"""Measure the live AI reader against the golden bar.

Asks the configured LLM (from .env: LLM_PROVIDER / LLM_MODEL / LLM_API_KEY) every canonical deep-reading
question for the golden reference chart, then reports for each answer:
  - verified / total chart facts (the verifier),
  - the reading-quality score and its issues (chat/quality.py),
  - repairs used (fact repairs plus at most one style rewrite) and seconds taken.

This sends the reference chart (a fictional "Aarav", not a real customer) to your AI provider and uses
your API credits: roughly 14 questions x 1-4 calls each.

Usage (from the jyotish folder):
  .venv/Scripts/python scripts/eval_readings.py            # all topics
  .venv/Scripts/python scripts/eval_readings.py career year # selected topics
  .venv/Scripts/python scripts/eval_readings.py --save out.json
  .venv/Scripts/python scripts/eval_readings.py --timeout 300 --parallel 3 career marriage year
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from chat import llm as llm_mod  # noqa: E402
from chat.golden import GOLDEN_QUESTIONS  # noqa: E402
from chat.golden_exemplars import REFERENCE_ASKED_AT, REFERENCE_BIRTH  # noqa: E402
from chat.session import ChatSession  # noqa: E402
from vedic import BirthInput, analyse  # noqa: E402


def _option(argv: list[str], name: str):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1], argv[:i] + argv[i + 2:]
    return None, argv


def main(argv: list[str]) -> int:
    save, argv = _option(argv, "--save")
    timeout, argv = _option(argv, "--timeout")
    parallel, argv = _option(argv, "--parallel")
    if timeout:
        os.environ["LLM_TIMEOUT"] = timeout
    keys = argv or list(GOLDEN_QUESTIONS)
    llm_mod.load_env_file()
    llm = llm_mod.get_llm()
    if llm is None:
        print("No LLM configured (.env LLM_PROVIDER / LLM_API_KEY); nothing to evaluate.")
        return 1
    chart, report = analyse(BirthInput(**REFERENCE_BIRTH), now=REFERENCE_ASKED_AT)
    print(f"Model: {llm.cfg.model} (timeout {llm.cfg.timeout:.0f}s)\n"
          f"{'topic':<10} {'reader':>7} {'facts':>9} {'quality':>8} {'repairs':>8} {'secs':>6}  issues", flush=True)

    def run(key):
        out = ChatSession(chart, report, llm=llm).ask(GOLDEN_QUESTIONS[key])
        s, q = out["summary"], out["quality"]
        reader = "AI" if out["mode"] == "llm" else "offline"
        note = out["error"] or "; ".join(q["issues"]) or "-"
        print(f"{key:<10} {reader:>7} {s['verified']:>4}/{s['total']:<4} {q['score']:>8} {out['repairs']:>8} "
              f"{out['seconds']:>6}  {note[:90]}", flush=True)
        return {"topic": key, "mode": out["mode"], "summary": s, "quality": q, "repairs": out["repairs"],
                "seconds": out["seconds"], "error": out["error"], "text": out["text"]}

    with ThreadPoolExecutor(max_workers=max(1, int(parallel or 1))) as pool:
        rows = list(pool.map(run, keys))
    live = [r for r in rows if r["mode"] == "llm"]
    if live:
        mean = sum(r["quality"]["score"] for r in live) / len(live)
        print(f"\nLive answers: {len(live)}/{len(rows)}; mean quality {mean:.1f}; "
              f"fully verified {sum(r['summary']['contradicted'] == 0 for r in live)}/{len(live)}")
    if save:
        Path(save).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Saved full answers to {save}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
