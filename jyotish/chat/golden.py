"""Golden responses: the quality bar for the reading model.

Two sources, two jobs:

1. Golden exemplars (chat/golden_exemplars.py) are hand-written master readings for one fixed
   reference chart. They teach *how* to read: lead with the answer and a central theme, explain each
   fact as cause and effect, weigh the counterweight, give reasons for timing, end with concrete steps
   and calibrated confidence. golden_guidance() shows the model the exemplar for the user's topic with
   its fact tags removed, so it copies the reasoning and never another person's placements.

2. The offline dataset (golden_dataset) runs every canonical deep-reading question through the
   deterministic offline reader for a chart. It is a factual regression set: every claim must verify.

evaluate() combines both bars: the verifier (are the chart facts true?) and the quality rubric from
chat/quality.py (does it read like a considered reading?).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from .golden_exemplars import EXEMPLARS, exemplar_for
from .offline import offline_answer
from .quality import score_reading


@dataclass(frozen=True)
class GoldenCase:
    """One canonical question->answer pair for the offline regression set."""
    question: str
    topic_key: str
    answer: str  # raw offline_answer output (contains fact tags)


GOLDEN_QUESTIONS: dict[str, str] = {
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
GOLDEN_KEYS = list(GOLDEN_QUESTIONS.keys())

_TAG = re.compile(r"<fact\b[^>]*>(.*?)</fact>", re.S)


def golden_case(topic_key: str, chart, report, asked_at: datetime) -> GoldenCase:
    question = GOLDEN_QUESTIONS[topic_key]
    return GoldenCase(question, topic_key, offline_answer(chart, report, question, question_time=asked_at))


def golden_dataset(chart, report, asked_at: datetime) -> list[GoldenCase]:
    """Every canonical question answered by the deterministic offline reader for this chart."""
    return [golden_case(k, chart, report, asked_at) for k in GOLDEN_KEYS]


def golden_guidance(topic_key: str, chart=None, report=None, asked_at: datetime | None = None) -> str:
    """The hand-written exemplar for this topic, shown to the model as a reasoning and style model.

    Fact tags are removed: the exemplar belongs to a different person's chart, so the model must learn
    its structure and reasoning while taking every fact from the user's own chart context."""
    key, ex = exemplar_for(topic_key)
    body = _TAG.sub(lambda m: m.group(1), ex["answer"])
    return (
        "## Golden example — how a master reading sounds (DIFFERENT PERSON'S CHART: copy the reasoning, never the facts)\n"
        f"This is a verified {key} reading written for another chart. Match its qualities: answer first with a "
        "calibrated lean and a central theme; explain every placement as cause and effect for this person; name "
        "the main counterweight; give each timing window a reason (period lord's link plus any double transit); "
        "close with concrete steps and a reasoned confidence line. Every placement, date and yoga in YOUR answer "
        "must come from the user's chart context, tools or working notes, wrapped in fact tags.\n\n"
        f"Q: {ex['question']}\n\n{body}"
    )


def evaluate(answer_text: str, chart, report) -> dict:
    """Both quality bars for one answer: verifier (truth) and rubric (reading quality)."""
    from .facts import extract_and_verify
    rep = extract_and_verify(answer_text, chart, report, prashna=None)
    quality = score_reading(answer_text)
    return {
        "verified": rep.summary()["verified"],
        "contradicted": len(rep.contradicted),
        "total_checks": len(rep.checks),
        "has_confidence": "**Confidence:**" in answer_text,
        "sections": sum(1 for line in answer_text.split("\n") if line.startswith("### ")),
        "word_count": len(answer_text.split()),
        "fact_count": answer_text.count("<fact"),
        "quality": quality["score"],
        "quality_issues": quality["issues"],
        "passes": len(rep.contradicted) == 0,
    }


__all__ = ["EXEMPLARS", "GOLDEN_KEYS", "GOLDEN_QUESTIONS", "GoldenCase", "evaluate", "golden_case",
           "golden_dataset", "golden_guidance"]
