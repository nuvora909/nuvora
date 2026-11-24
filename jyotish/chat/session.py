"""One chat conversation about one chart: tool loop -> verify -> repair (max 2) -> safe render."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from .context import build_context
from .facts import extract_and_verify
from .golden import golden_guidance
from .judgment import judge, working_notes
from .llm import LLM, LLMError, get_llm
from .offline import LABEL as OFFLINE_LABEL
from .offline import offline_answer
from .prashna import build_prashna, prashna_prompt
from .prompt import REPAIR_PROMPT, SYSTEM_PROMPT
from .quality import STYLE_REPAIR_PROMPT, score_reading
from .render import render, strip_facts
from .tools import TOOLS, run_tool
from .topics import deep_prompt, detect_topic, is_decision_question

MAX_TOOL_ROUNDS = 6
MAX_REPAIRS = 2
HISTORY_TURNS = 8
STYLE_REPAIR_BELOW = 72      # quality score under which a factually clean answer gets one rewrite
SHORT_ANSWER_WORDS = 160     # quick follow-ups are not held to the full-reading rubric


class ChatSession:
    def __init__(self, chart, report: dict, llm: LLM | None = None, use_env_llm: bool = True,
                 use_golden: bool = True):
        self.chart, self.report = chart, report
        self.llm = llm if llm is not None else (get_llm() if use_env_llm else None)
        self.use_golden = use_golden
        today = datetime.now(chart.time.local.tzinfo).date().isoformat()
        self.system = SYSTEM_PROMPT + "\n\n" + build_context(report, today=today)
        self.history: list[dict] = []          # neutral messages, user/assistant only (final texts)

    def reader_label(self, mode: str | None = None, error: str | None = None, language: str = "en") -> str:
        mode = mode or ("llm" if self.llm else "offline")
        if mode == "offline":
            hindi = language == "hi"
            if not self.llm:
                return "ऑफ़लाइन कुंडली-पाठक · AI सहमति बंद" if hindi else "Offline chart reader · AI consent off"
            if error and "rejected" in error.lower():
                return ("ऑफ़लाइन विकल्प · AI उत्तर कुंडली-जाँच में असफल" if hindi
                        else "Offline fallback · AI answer failed chart checks")
            return "ऑफ़लाइन विकल्प · AI उपलब्ध नहीं" if hindi else "Offline fallback · AI unavailable"
        model = getattr(getattr(self.llm, "cfg", None), "model", "")
        if "gemma-4-31b" in model.lower():
            return "Gemma 4 31B"
        return f"AI reading · {model}" if model else "AI reading"

    # ------------------------------------------------------------------ model loop
    def _topic_evidence(self, topic, asked_at=None) -> str:
        at = self.report.get("transits", {}).get("at")
        now = asked_at or (datetime.fromisoformat(at).astimezone(timezone.utc) if at
                          else datetime.now(timezone.utc))
        start = now.date().isoformat()
        days, depth = {"month": (45, 3), "lifetime": (36525, 1), "foreign": (1826, 2)}.get(topic.key, (550, 3))
        end = (now + timedelta(days=days)).date().isoformat()
        sections = []
        if topic.varga:
            evidence = run_tool(self.chart, "get_varga", {"n": topic.varga})
            sections.append(f"Relevant divisional chart D{topic.varga}:\n{evidence}")
        periods = run_tool(self.chart, "get_dasha", {"start": start, "end": end, "depth": depth})
        label = {1: "Mahadasha", 2: "Antardasha", 3: "Pratyantardasha"}[depth]
        sections.append(f"{label} periods, {start} to {end}:\n{periods}")
        if topic.key == "foreign":
            near_end = (now + timedelta(days=1095)).date().isoformat()
            pratyantars = run_tool(self.chart, "get_dasha", {"start": start, "end": near_end, "depth": 3})
            sections.append(f"Pratyantardasha periods for nearer-term timing, {start} to {near_end}:\n{pratyantars}")
            for planet in ("Rahu", "Ketu"):
                evidence = run_tool(self.chart, "get_ingresses", {"planet": planet, "start": start, "end": end})
                sections.append(f"{planet} sign changes under the configured node and ayanamsa settings, {start} to {end}:\n{evidence}")
        if topic.key == "month":
            for planet in ("Sun", "Mercury", "Venus", "Mars"):
                evidence = run_tool(self.chart, "get_ingresses", {"planet": planet, "start": start, "end": end})
                sections.append(f"{planet} sign changes, {start} to {end}:\n{evidence}")
        return ("\n\n[Prefetched engine evidence: use this directly. Do not repeat tool calls for this "
                "divisional chart or date range; call tools only for additional evidence not already supplied.]\n"
                + "\n\n".join(sections))

    def _run_model(self, messages: list[dict], trace: list, system_prompt: str | None = None):
        system_prompt = system_prompt or self.system
        for _ in range(MAX_TOOL_ROUNDS):
            resp = self.llm.complete(system_prompt, messages, TOOLS)
            if not resp["tool_calls"]:
                return resp["text"]
            messages.append({"role": "assistant", "content": resp["text"], "tool_calls": resp["tool_calls"]})
            for call in resp["tool_calls"]:
                out = run_tool(self.chart, call["name"], call["args"])
                trace.append({"tool": call["name"], "args": call["args"], "bytes": len(out)})
                messages.append({"role": "tool", "tool_call_id": call["id"], "name": call["name"], "content": out})
        # tool budget exhausted: ask for a final answer without tools
        messages.append({"role": "user", "content": "Tool budget reached. Answer now with the information you have."})
        return self.llm.complete(system_prompt, messages, [])["text"]

    @staticmethod
    def _errors_text(rep) -> str:
        lines = []
        for c in rep.contradicted:
            hint = ""
            if c.kind in ("placement", "lagna") and not c.attrs.get("chart"):
                hint = ' If this is a divisional-chart claim, add the missing chart="Dn" attribute.'
            lines.append(f'- You wrote "{c.text}" ({c.kind} {c.attrs}). Engine: {c.engine}.{hint}')
        return "\n".join(lines)

    def ask(self, question: str, language: str = "en") -> dict:
        t0 = time.perf_counter()
        question = question.strip()[:4000]
        asked_at = datetime.now(timezone.utc)
        topic = detect_topic(question)
        prashna = build_prashna(self.chart, asked_at) if is_decision_question(question) else None
        prashna_cr = (prashna.chart, prashna.report) if prashna else None
        language = language if language in ("hi", "hi-Latn") else "en"
        response_system = self.system
        if language == "hi":
            response_system += ("\n\n## Output language\nRespond in clear, natural Hindi written in Devanagari. "
                                "Keep every <fact> tag and its attribute names/values intact; translate only the visible prose. "
                                "Explain Sanskrit astrology terms simply and do not change computed names, dates, or numbers.")
        elif language == "hi-Latn":
            response_system += ("\n\n## Output language\nRespond in natural Hinglish: conversational Hindi written in Latin script with familiar English words where people commonly use them. "
                                "Keep every <fact> tag and its attribute names/values intact; translate only the visible prose. "
                                "Explain Sanskrit astrology terms simply and do not change computed names, dates, or numbers.")
        trace, repairs, error = [], 0, None
        language_notice = None
        mode = "llm" if self.llm else "offline"
        if language == "hi-Latn" and not self.llm:
            language_notice = "Hinglish needs the AI reader; the chart reader is answering in Hindi instead."
        text = None
        quality = None
        if self.llm:
            # The hand-written golden exemplar for this topic: a model of reasoning and tone, not of facts.
            if self.use_golden:
                response_system += "\n\n" + golden_guidance(topic.key)
            prashna_evidence = prashna_prompt(prashna, topic.houses) if prashna else ""
            judgment = judge(self.chart, self.report, topic, asked_at)
            msgs = self.history[-2 * HISTORY_TURNS:] + [
                {"role": "user", "content": question + "\n" + deep_prompt(topic)
                 + self._topic_evidence(topic, asked_at) + "\n\n" + working_notes(judgment) + prashna_evidence}
            ]
            try:
                text = self._run_model(msgs, trace, response_system)
                rep = extract_and_verify(text, self.chart, self.report, prashna_cr)
                while rep.contradicted and repairs < MAX_REPAIRS:
                    repairs += 1
                    msgs.append({"role": "assistant", "content": text})
                    msgs.append({"role": "user", "content": REPAIR_PROMPT.format(errors=self._errors_text(rep))})
                    text = self._run_model(msgs, trace, response_system)
                    rep = extract_and_verify(text, self.chart, self.report, prashna_cr)
                if rep.contradicted:
                    error = f"Live answer rejected: {len(rep.contradicted)} chart facts remained contradicted after repair."
                    mode, text = "offline", None
                else:
                    text, rep, quality = self._style_repair(text, rep, msgs, trace, response_system, prashna_cr)
                    repairs += quality.pop("rewrites", 0)
            except LLMError as e:
                error, mode, text = str(e), "offline", None
        if text is None:
            text = offline_answer(self.chart, self.report, question, question_time=asked_at, prashna=prashna,
                                  language="hi" if language == "hi-Latn" else language)
            if language == "hi-Latn":
                language_notice = "Hinglish needs the AI reader; the chart reader is answering in Hindi instead."
            rep = extract_and_verify(text, self.chart, self.report, prashna_cr)
        self.history += [{"role": "user", "content": question}, {"role": "assistant", "content": text}]
        summary = rep.summary()
        if quality is None:
            quality = score_reading(text)
        return {
            "mode": mode, "label": self.reader_label(mode, error, language),
            "language": language, "language_notice": language_notice,
            "html": render(text, rep), "text": strip_facts(text),
            "checks": [c.as_dict() for c in rep.checks], "summary": summary, "repairs": repairs,
            "quality": {"score": quality["score"], "issues": quality["issues"]},
            "tools_used": trace, "error": error, "seconds": round(time.perf_counter() - t0, 2),
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }

    def _style_repair(self, text, rep, msgs, trace, system_prompt, prashna_cr):
        """One rewrite when a factually clean answer reads mechanically; keep it only if it is better
        on quality and still fully consistent with the chart."""
        quality = score_reading(text)
        quality["rewrites"] = 0
        if quality["score"] >= STYLE_REPAIR_BELOW or quality["words"] < SHORT_ANSWER_WORDS:
            return text, rep, quality
        issues = "\n".join(f"- {issue}" for issue in quality["issues"])
        attempt = msgs + [{"role": "assistant", "content": text},
                          {"role": "user", "content": STYLE_REPAIR_PROMPT.format(issues=issues)}]
        try:
            rewritten = self._run_model(attempt, trace, system_prompt)
        except LLMError:
            return text, rep, quality
        new_rep = extract_and_verify(rewritten, self.chart, self.report, prashna_cr)
        new_quality = score_reading(rewritten)
        if not new_rep.contradicted and new_quality["score"] > quality["score"]:
            new_quality["rewrites"] = 1
            return rewritten, new_rep, new_quality
        quality["rewrites"] = 1
        return text, rep, quality
