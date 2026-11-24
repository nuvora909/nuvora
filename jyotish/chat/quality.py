"""Reading quality: does an answer read like a thoughtful astrologer or like a template?

The fact verifier (chat/facts.py) decides whether chart statements are *true*. This module scores
whether the reading is *good*: it answers the question first, explains cause and effect instead of
listing placements, weighs a counter-indicator, gives reasons for its timing, avoids boilerplate and
repetition, ends with concrete steps and an honest confidence line.

score_reading(text) returns a 0-100 score, per-check points and plain-language issues. The issues
double as rewrite instructions for the live model (see STYLE_REPAIR_PROMPT) and as the regression
bar for the golden exemplars.
"""
from __future__ import annotations

import re
from collections import Counter

FACT = re.compile(r"<fact\b[^>]*>(.*?)</fact>", re.S)
FACT_OPEN = re.compile(r"<fact\b([^>]*)>")

LEAN_WORDS = re.compile(
    r"\b(strong(?:ly)?|support(?:ed|ive|s)?|favourabl[ey]|favorabl[ey]|mixed|demanding|challenging|difficult|"
    r"promising|resilient|likely|unlikely|yes|no|lean(?:s)?|clear(?:er)?|weak(?:er)?|steady|positive|cautious)\b", re.I)
CAUSAL = re.compile(
    r"\b(because|so|which|means|meaning|suggests?|shows?|explains?|therefore|that is why|this is why|giving|"
    r"making|turns?|ties?|plugs?|links?|connects?|points?|lets?|allows?|helps?|reinforces?|weakens?|"
    r"strengthens?|softens?|delays?|adds?|pulls?|pushes?|asks?|needs?)\b|—|:", re.I)
CONTRAST = re.compile(r"\b(however|but|although|though|yet|whereas|the catch|on the other hand|counterweight|"
                      r"qualification|friction|tempers?|limits?|caveat|condition)\b", re.I)
TIMING_REASON = re.compile(r"\b(because|so|as|when|while|since|activat\w*|trigger\w*|double transit|rules?|"
                           r"connects?|links?|brings?|suits?|reach(?:es)?|touch(?:es)?|favours?|favors?|which|"
                           r"means|explains?|helps?|opens?|works with|steps? forward|good for|best for)\b", re.I)
CHARACTERISATION = re.compile(r"\b(is|are) (?:a|an) [\w\s-]{0,30}?(chart|year|month|period|chapter|life) of\b|"
                              r"\b(is|are) (?:defined by|built on|centred on|centered on|about)\b", re.I)
ACTION_START = re.compile(
    r"^\s*(?:[-*]|\d+[.)])?\s*(?:\*\*[^*]+\*\*\s*)?(use|keep|build|prepare|test|track|choose|ask|plan|discuss|check|"
    r"save|start|focus|avoid|schedule|set|talk|review|treat|spend|write|apply|protect|invest|create|let|"
    r"give|take|limit|make|put|look|wait|book|document|consolidate|anchor|hold|commit|step|agree|separate)\b", re.I | re.M)
CONFIDENCE = re.compile(r"\*\*Confidence:\*\*\s*(high|moderate|low)\b(.{12,})", re.I)

# Phrases that signal template output rather than a considered reading.
BOILERPLATE = (
    "this is one supportive factor, not a guarantee",
    "28-bindu reference",
    "treat this as a qualification, not a prediction of failure",
    "close to the middle range rather than an extreme",
    "benefic occupation supports the house through",
    "the ruling planet sits in a prominent or supportive house",
    "the lord's placement is not a strong support or obstacle by itself",
    "reflect on what resonates with your lived experience",
    "identify one practical step you can take this week",
    "check the practical facts before making decisions",
    "use demanding periods for preparation, not panic",
    "no single strong contradiction stands out",
    "it neither clearly overrides nor cancels the house evidence",
    "think of the houses below as expressions of this foundation",
    "as an ai",
    "i am not able to predict",
    "the stars",
    "the universe has",
)

WEIGHTS = {
    "direct_answer": 15, "reasoning": 20, "counterweight": 10, "no_boilerplate": 15,
    "no_repetition": 10, "timing_reasoned": 10, "practical": 10, "confidence": 5, "evidence": 5,
}


def _plain(text: str) -> str:
    return FACT.sub(lambda m: m.group(1), text)


def _sentences(text: str) -> list[str]:
    body = re.sub(r"(?m)^#+\s.*$", "", text)
    parts = re.split(r"(?<=[.!?])\s+|\n{2,}|\n(?=\s*(?:[-*]|\d+[.)])\s)", body)
    return [p.strip() for p in parts if len(p.strip()) > 2]


def _paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n{2,}", text) if p.strip() and not p.strip().startswith("#")]


def score_reading(text: str) -> dict:
    """Score a reading (raw text with fact tags). Returns score, per-check results and issues."""
    plain = _plain(text)
    sentences = _sentences(text)
    paragraphs = _paragraphs(text)
    lower = plain.lower()
    checks: dict[str, tuple[float, str]] = {}

    # 1. Direct answer in the opening.
    opening = " ".join(_plain(p) for p in paragraphs[:1])
    first_words = " ".join(opening.split()[:70])
    leaning = LEAN_WORDS.search(first_words) or CHARACTERISATION.search(first_words)
    if leaning and len(FACT.findall(paragraphs[0] if paragraphs else "")) <= 3:
        checks["direct_answer"] = (1.0, "opens with a clear lean")
    elif leaning:
        checks["direct_answer"] = (0.6, "opens with a lean but crowds it with chart facts")
    else:
        checks["direct_answer"] = (0.0, "does not answer the question in the opening")

    # 2. Reasoning: fact-bearing sentences should say what the fact means.
    factual = [s for s in sentences if "<fact" in s]
    if factual:
        explained = sum(1 for s in factual if CAUSAL.search(_plain(s)))
        ratio = explained / len(factual)
        checks["reasoning"] = (min(1.0, ratio / 0.75), f"{explained}/{len(factual)} chart statements explain their meaning")
    else:
        checks["reasoning"] = (0.0, "no chart evidence is cited")

    # 3. Counterweight.
    checks["counterweight"] = ((1.0, "weighs a counter-indicator") if CONTRAST.search(plain)
                               else (0.0, "never names what pushes back"))

    # 4. Boilerplate.
    hits = [b for b in BOILERPLATE if b in lower]
    checks["no_boilerplate"] = (max(0.0, 1.0 - 0.34 * len(hits)),
                                "no template phrases" if not hits else "template phrases: " + "; ".join(hits[:3]))

    # 5. Repetition: repeated sentence openings and the same fact cited again and again.
    openers = Counter(" ".join(_plain(s).lower().split()[:4]) for s in sentences if len(_plain(s).split()) >= 4)
    repeated_openers = [o for o, n in openers.items() if n >= 3]
    tags = Counter(re.sub(r"\s+", " ", a.strip()) for a in FACT_OPEN.findall(text))
    repeated_tags = [t for t, n in tags.items() if n >= 3]
    penalty = 0.35 * len(repeated_openers) + 0.2 * len(repeated_tags)
    checks["no_repetition"] = (max(0.0, 1.0 - penalty),
                               "varied" if not penalty else
                               f"{len(repeated_openers)} repeated sentence openings, {len(repeated_tags)} facts cited 3+ times")

    # 6. Timing reasoned (only judged when the answer gives dates or periods). A window is judged as a
    #    unit (its paragraph or list item) because the reason often follows in the next sentence.
    #    Action steps that merely mention a date are not timing claims.
    blocks = [b.strip() for b in re.split(r"\n{2,}|\n(?=\s*(?:[-*]|\d+[.)])\s)", re.sub(r"(?m)^#+\s.*$", "", text))]
    timing_units = [b for b in blocks if b and re.search(r"\b(19|20)\d{2}\b|kind=\"dasha\"", b)
                    and not ACTION_START.match(_plain(b))]
    if timing_units:
        reasoned = sum(1 for b in timing_units if TIMING_REASON.search(_plain(b)))
        checks["timing_reasoned"] = (min(1.0, reasoned / max(1, len(timing_units)) / 0.75),
                                     f"{reasoned}/{len(timing_units)} timing windows give a reason")
    else:
        checks["timing_reasoned"] = (1.0, "no dated timing offered")

    # 7. Practical steps the person controls.
    tail = "\n".join(paragraphs[-4:]) if paragraphs else ""
    actions = ACTION_START.findall(_plain(tail))
    generic = sum(1 for b in BOILERPLATE[7:11] if b in lower)
    checks["practical"] = (max(0.0, min(1.0, len(actions) / 2) - 0.5 * generic),
                           f"{len(actions)} concrete next steps" if actions else "no concrete next step")

    # 8. Confidence line.
    m = CONFIDENCE.search(plain)
    checks["confidence"] = ((1.0, f"confidence {m.group(1).lower()} with a reason") if m
                            else (0.0, "missing a reasoned **Confidence:** line"))

    # 9. Evidence density: enough facts to be grounded, not a placement list.
    n_tags = len(FACT.findall(text))
    density = n_tags / max(1, len(sentences))
    if n_tags >= 3 and density <= 1.6:
        checks["evidence"] = (1.0, f"{n_tags} verified-style facts, well spaced")
    elif n_tags >= 3:
        checks["evidence"] = (0.4, "reads like a placement list (too many facts per sentence)")
    else:
        checks["evidence"] = (0.3 if n_tags else 0.0, "too little chart evidence")

    score = round(sum(WEIGHTS[k] * v for k, (v, _) in checks.items()))
    issues = [note for k, (v, note) in checks.items() if v < 0.75]
    return {"score": score, "checks": {k: {"points": round(WEIGHTS[k] * v, 1), "max": WEIGHTS[k], "note": note}
                                       for k, (v, note) in checks.items()},
            "issues": issues, "words": len(plain.split()), "facts": n_tags}


STYLE_REPAIR_PROMPT = """Your reading is factually consistent with the chart but reads too mechanically. Rewrite the
whole answer so it reads like an experienced astrologer explaining one connected judgement, fixing these points:

{issues}

Keep every fact tag you keep exactly as it is (do not change attribute values), keep the same conclusions and
dates, and do not add new chart claims. Open with the direct answer and the central theme, explain each piece of
evidence as cause and effect, name the main counterweight, give a reason for every timing window, end with
concrete steps and a reasoned **Confidence:** line."""


# ------------------------------------------------------------------ Tarot

TAROT_BOILERPLATE = (
    "comes upright in the", "speaking to", "in a work context, this points to where your energy is",
    "take this as a mirror for your own reflection", "the the ", "balance of selected symbols",
    "it's a quiet note beneath the main message", "this is about the professional energy around",
)
TAROT_LEAN = re.compile(r"\b(yes|no|lean\w*|encouraging|mixed|caution\w*|possibl\w*|likely|unlikely|clean|clear\w*|"
                        r"favourabl\w*|supportive|hopeful|not yet)\b", re.I)
TAROT_LINK = re.compile(r"\b(together|through|while|but|because|so|agrees?|tempers?|answers?|belongs?|"
                        r"connects?|against|whereas|which|then)\b", re.I)


def _card_mentioned(text: str, name: str) -> bool:
    bare = name[4:] if name.startswith("The ") else name
    return bare.lower() in text.lower()


def score_tarot(reading: dict, cards: list[dict]) -> dict:
    """0-100 quality score for a Tarot reading dict (summary, card_readings, synthesis, next_step)."""
    summary, synthesis = reading.get("summary", ""), reading.get("synthesis", "")
    next_step, items = reading.get("next_step", ""), reading.get("card_readings", [])
    everything = " ".join([summary, synthesis, next_step] + [i.get("text", "") for i in items])
    checks: dict[str, tuple[float, str, int]] = {}

    first = re.split(r"(?<=[.!?])\s", summary.strip(), maxsplit=1)[0] if summary else ""
    checks["direct_answer"] = ((1.0, "summary opens with a clear lean", 20) if TAROT_LEAN.search(first)
                               else (0.0, "summary does not open with an answer", 20))

    named = sum(1 for i, c in zip(items, cards) if _card_mentioned(i.get("text", ""), c["name"]))
    checks["every_card_read"] = (named / max(1, len(cards)), f"{named}/{len(cards)} card readings name their card", 15)

    in_synthesis = sum(1 for c in cards if _card_mentioned(synthesis, c["name"]))
    connected = (min(1.0, in_synthesis / 2) * 0.6 + (0.4 if TAROT_LINK.search(synthesis) else 0.0)) if len(cards) > 2 \
        else (1.0 if TAROT_LINK.search(synthesis) or in_synthesis else 0.0)
    checks["cards_in_conversation"] = (connected, f"synthesis links {in_synthesis} cards", 20)

    sentences = [s.strip().lower() for s in re.split(r"(?<=[.!?])\s+", everything) if len(s.split()) >= 5]
    repeats = sum(n - 1 for n in __import__("collections").Counter(sentences).values() if n > 1)
    checks["no_repetition"] = (max(0.0, 1.0 - 0.34 * repeats), "no repeated sentences" if not repeats
                               else f"{repeats} sentences repeated", 20)

    hits = [b for b in TAROT_BOILERPLATE if b in everything.lower()]
    checks["no_boilerplate"] = (max(0.0, 1.0 - 0.5 * len(hits)), "no template phrases" if not hits
                                else "template phrases: " + "; ".join(hits[:3]), 15)

    actionable = len(next_step.split()) >= 8 and bool(ACTION_START.search(next_step) or
                                                       re.search(r"\b(say|ask|write|call|check|try|decide|list|take|pick|finish|complete|choose|book|talk|commit|send|plan)\b", next_step, re.I))
    checks["next_step"] = ((1.0, "concrete next step", 10) if actionable else (0.0, "next step is vague", 10))

    score = round(sum(w * v for v, _, w in checks.values()))
    return {"score": score, "issues": [n for v, n, _ in checks.values() if v < 0.75],
            "checks": {k: {"points": round(w * v, 1), "max": w, "note": n} for k, (v, n, w) in checks.items()}}
