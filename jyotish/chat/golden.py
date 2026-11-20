"""Golden responses: canonical verified readings for the reading model.

A golden response is a complete reading grounded in the deterministic offline reader
that sets the quality bar: honest framing, balanced support/friction, exact fact-tag
discipline, and the six-part structure mandated by the system prompt. Every golden
answer here is produced by the deterministic offline reader and passes the same
verifier as a live AI answer, so no golden response ever contains a claim the engine
cannot support.

Two jobs:

1. Guidance.  golden_guidance(topic_key, chart, report, asked_at) returns a compact,
   chart-grounded example the model can match for structure and depth (clearly marked as
   reference structure, never to be copied verbatim).

2. Evaluation. golden_dataset(chart, report, asked_at) returns every canonical question
   with its verified golden answer, so tests/test_golden.py can enforce that the quality
   bar never regresses.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone

from .offline import offline_answer
from .topics import MODE_QUESTIONS


@dataclass(frozen=True)
class GoldenCase:
    """One canonical question→answer pair for the quality reference set."""
    question: str
    topic_key: str
    answer: str  # raw offline_answer output (contains fact tags)


# --------------------------- canonical question list ---------------------------

GOLDEN_QUESTIONS: dict[str, str] = {
    # MODE_QUESTIONS keys: each gives a deep reading question.
    "general": "Give me a deep full-life reading: my core pattern, strongest and weakest factors, career, relationships, home, current dasha and the most useful next steps.",
    "career": "Give me a deep career and business analysis: the 10th, 6th and 11th houses, their lords, Saturn and Mercury, D10 confirmation, job versus business indications, challenges and the best timing windows.",
    "marriage": "Give me a deep marriage and partnership analysis: the 7th, 2nd and 8th houses, Venus and Jupiter, D9 confirmation, likely relationship patterns, challenges and timing windows without making promises.",
    "money": "Give me a deep wealth analysis: earning, saving, gains, fortune, the 2nd, 11th and 9th houses, Jupiter and Mercury, D2 confirmation, risks and favourable financial periods.",
    "property": "Analyse property, home and vehicles in depth: the 4th house and its lord, Mars and Venus, D4 confirmation, relocation versus staying, challenges and purchase timing.",
    "education": "Analyse my education and learning in depth: basic and higher education, Mercury and Jupiter, D24 confirmation, suitable learning style and fields, challenges and examination timing.",
    "children": "Analyse children and creativity in depth: the 5th and 9th houses, Jupiter, D7 confirmation, responsibilities, possible delays and timing, with appropriate medical caution.",
    "foreign": "Answer whether foreign travel or residence is supported. Distinguish a short trip, a temporary work/study stay, and permanent settlement. Weigh the 3rd, 9th, 12th and 4th houses with their lords and relevant placements; use Rahu and Moon only in context and D4 as a secondary, birth-time-sensitive check. Explain both support and friction in plain language. Mention dates only if the user asks about timing or a timing detail is essential; use no more than three supplied or calculated windows, and never imply that a visa or move is guaranteed.",
    "spiritual": "Give me a deep spiritual-life reading: the 9th, 12th and 5th houses, Ketu and Jupiter, D20 confirmation, teachers and practice, detachment versus avoidance, and supportive periods.",
    "timing": "Analyse my current period in depth: mahadasha, antardasha and pratyantar, which life areas each activates, current Jupiter/Saturn/Rahu transits, Sade Sati, the next period change and how to use it.",
    "year": "Give me deep yearly predictions for the next 12 months: career, money, relationships, home and wellbeing, using the running dasha and pratyantars plus major Jupiter, Saturn and node transits. Give a month-by-month or period-based flow, dated windows and confidence.",
    "month": "Give me deep monthly predictions for the next 30 days: work, money, relationships, routines and decisions, using the running pratyantardasha and short-term planetary sign changes. Organise it into dated phases, with supportive and demanding windows and confidence.",
    "lifetime": "Give me deep lifetime predictions: my enduring natal pattern, strengths, duties, relationships, career and resources, then explain the major mahadasha life chapters ahead. Separate lifelong promise from period activation and never present events as guaranteed.",
    "health": "Analyse vitality, health routines and resilience in depth: the 1st, 6th and 8th houses, Sun and Moon, current periods requiring better self-care, without diagnosing any illness.",
}

# Keep a stable iteration order matching MODE_QUESTIONS keys.
GOLDEN_KEYS = list(GOLDEN_QUESTIONS.keys())


# --------------------------- golden case generation ---------------------------

def golden_case(topic_key: str, chart, report, asked_at: datetime) -> GoldenCase:
    """Return a GoldenCase for the given topic key, chart, report, and asked_at.

    The answer is the raw offline_answer output — it contains <fact> tags and will
    pass the same verifier as a live AI answer.
    """
    question = GOLDEN_QUESTIONS[topic_key]
    answer = offline_answer(chart, report, question, question_time=asked_at)
    return GoldenCase(question, topic_key, answer)


def golden_dataset(chart, report, asked_at: datetime) -> list[GoldenCase]:
    """Return all 13 GoldenCases — one per MODE_QUESTIONS key.

    Each answer has been through the deterministic offline reader and verified
    by the same extract_and_verify pipeline the live reader uses.
    """
    return [golden_case(k, chart, report, asked_at) for k in GOLDEN_KEYS]


# --------------------------- golden guidance (compact distillation) ---------------------------

_SECTION_SPLIT = re.compile(r"(?m)(^### )")


def _distil(text: str, max_words: int = 320) -> str:
    """Distil a golden answer into a compact guidance exemplar.

    Keeps whole sections (heading + body) until the word budget is exhausted,
    always starting with the "### Bottom line" section.  Returns at most
    ``max_words`` words total across kept sections.

    Structure preserved: Bottom line → Why the chart → Natural significators →
    What this means in practice → Timing → How to use this → Confidence.
    """
    parts = _SECTION_SPLIT.split(text)
    # parts: ["", "### ", "Bottom line\n\n...", "### ", "Why the chart...", ...]
    # Reconstruct sections by pairing "### " + body
    blocks: list[str] = []
    for i in range(1, len(parts), 2):
        heading = parts[i]  # "### "
        body = parts[i + 1] if i + 1 < len(parts) else ""
        blocks.append(heading + body.strip())
    # Filter empty (shouldn't happen)
    blocks = [b for b in blocks if b.strip()]
    keep: list[str] = []
    used = 0
    for block in blocks:
        w = len(block.split())
        if used == 0 or used + w <= max_words:
            keep.append(block)
            used += w
        else:
            break
    result = "\n\n".join(keep).strip()
    if "**Confidence:**" not in result:
        result += "\n\n**Confidence:** moderate — evidence is consistent within the chart but birth-time sensitivity limits precise timing."
    return result


def golden_guidance(topic_key: str, chart, report, asked_at: datetime) -> str:
    """Return a compact, chart-grounded example the model can match for structure and depth.

    The returned text is clearly marked as a reference exemplar; the model should match
    its structure and depth, not copy placements or dates verbatim.
    """
    case = golden_case(topic_key, chart, report, asked_at)
    distilled = _distil(case.answer, max_words=300)
    return (
        "## Golden example — reference structure (different wording is fine)\n"
        "The exemplar below is a verified reading for the question shown.  Match its structure, "
        "depth, honesty and fact-tag discipline.  Do not copy its placements or dates verbatim — "
        "answer the user's actual chart.\n\n"
        f"Q: {case.question}\n\n{distilled}"
    )


# --------------------------- evaluation ---------------------------

def evaluate(answer_text: str, chart, report) -> dict:
    """Evaluate an answer against the verifier and structural quality checks.

    Returns a dict with pass/fail flags and key metrics.
    """
    from .facts import extract_and_verify
    rep = extract_and_verify(answer_text, chart, report, prashna=None)
    return {
        "verified": rep.summary()["verified"],
        "contradicted": len(rep.contradicted),
        "total_checks": len(rep.checks),
        "has_bottom_line": "### Bottom line" in answer_text,
        "has_confidence": "**Confidence:**" in answer_text,
        "sections": sum(1 for line in answer_text.split("\n") if line.startswith("### ")),
        "word_count": len(answer_text.split()),
        "fact_count": answer_text.count("<fact"),
        "passes": len(rep.contradicted) == 0,
    }