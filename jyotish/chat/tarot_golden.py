"""Golden responses for Tarot: canonical verified readings for the reading model.

A golden tarot response is a complete reading grounded in the deterministic card-based
interpreter that sets the quality bar: honest framing, balanced support/friction,
exact position-aware discipline, and the five-part structure mandated by the system
prompt. Every golden answer here passes the same quality checks as a live AI answer.

Two jobs:

1. Guidance.  tarot_golden_guidance(spread, cards, question, language) returns a compact,
   chart-grounded example the model can match for structure and depth (clearly marked as
   reference structure, never to be copied verbatim).

2. Evaluation. tarot_golden_dataset(spread) returns canonical questions with their
   verified golden answers for each spread type, so tests can enforce the quality bar.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

# Add server directory to path for tarot_reading import
SERVER_DIR = Path(__file__).resolve().parent.parent / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from tarot_reading import draw_cards, interpret as tarot_interpret, MAJORS, SUITS, RANKS, MINOR_MEANINGS, POSITIONS, HIGH_STAKES_RE, _fallback


# Type for language
Language = Literal["en", "hi", "hi-Latn"]


# Canonical test questions for each spread type
TAROT_GOLDEN_QUESTIONS: dict[str, list[str]] = {
    "1": [
        "What energy should I focus on today?",
        "What is the most important thing I need to understand about my current situation?",
        "What is blocking my progress right now?",
    ],
    "3": [
        "I am planning to change my job next month. Are there any planetary alignments supporting it?",
        "What is the current state of my relationship and where is it heading?",
        "Should I invest in this business opportunity or wait?",
    ],
    "7": [
        "Give me a comprehensive reading about my career path for the next year.",
        "What are the deep patterns in my love life and how can I navigate them?",
        "I feel stuck in life. What do I need to understand to move forward?",
    ],
}


@dataclass(frozen=True)
class TarotGoldenCase:
    """One canonical question→answer pair for the tarot quality reference set."""
    question: str
    spread: str  # "1", "3", or "7"
    cards: list[dict]  # the drawn cards for reproducibility
    answer: dict  # the full interpret() output


# Pre-drawn canonical card sets for each spread (seeded for reproducibility)
# These are fixed draws so the golden cases are reproducible
CANONICAL_DRAWS: dict[str, list[dict]] = {
    "1": [
        {"name": "The Star", "suit": "Major Arcana", "symbol": "✦", "image": "/static/tarot-deck/major-16-the-star.webp",
         "theme": "renewal, perspective, and patient rebuilding of trust or hope", "polarity": 1,
         "number": "16", "position": "Focus", "orientation": "upright"},
        {"name": "Three of Cups", "suit": "Cups", "symbol": "💧", "image": "/static/tarot-deck/cups-03.webp",
         "theme": "friendship, community, and shared enjoyment", "polarity": 1,
         "number": "Three", "position": "Extra clarifier", "orientation": "upright"},
    ],
    "3": [
        {"name": "The Chariot", "suit": "Major Arcana", "symbol": "✦", "image": "/static/tarot-deck/major-06-the-chariot.webp",
         "theme": "focused effort, self-direction, and managing competing pressures", "polarity": 1,
         "number": "6", "position": "Situation", "orientation": "upright"},
        {"name": "Five of Swords", "suit": "Swords", "symbol": "🌬️", "image": "/static/tarot-deck/swords-05.webp",
         "theme": "conflict or a hollow victory that may leave trust damaged", "polarity": -1,
         "number": "Five", "position": "Challenge", "orientation": "reversed"},
        {"name": "Temperance", "suit": "Major Arcana", "symbol": "✦", "image": "/static/tarot-deck/major-13-temperance.webp",
         "theme": "balance, gradual adjustment, and combining different needs", "polarity": 1,
         "number": "13", "position": "Guidance", "orientation": "upright"},
        {"name": "Knight of Pentacles", "suit": "Pentacles", "symbol": "🌿", "image": "/static/tarot-deck/pents-12.webp",
         "theme": "reliability, patience, and progress through consistent follow-through", "polarity": 1,
         "number": "Knight", "position": "Extra clarifier", "orientation": "upright"},
    ],
    "7": [
        {"name": "The Moon", "suit": "Major Arcana", "symbol": "✦", "image": "/static/tarot-deck/major-17-the-moon.webp",
         "theme": "uncertainty, strong feelings, and the need to check assumptions", "polarity": 0,
         "number": "17", "position": "Context", "orientation": "upright"},
        {"name": "Eight of Cups", "suit": "Cups", "symbol": "💧", "image": "/static/tarot-deck/cups-08.webp",
         "theme": "leaving an unsatisfying pattern in search of deeper meaning", "polarity": 0,
         "number": "Eight", "position": "Root", "orientation": "upright"},
        {"name": "Six of Swords", "suit": "Swords", "symbol": "🌬️", "image": "/static/tarot-deck/swords-06.webp",
         "theme": "a gradual transition away from a stressful situation", "polarity": 1,
         "number": "Six", "position": "Past influence", "orientation": "reversed"},
        {"name": "The Tower", "suit": "Major Arcana", "symbol": "✦", "image": "/static/tarot-deck/major-15-the-tower.webp",
         "theme": "disruption, unstable assumptions, and a need to respond to what is real", "polarity": -1,
         "number": "15", "position": "Present", "orientation": "upright"},
        {"name": "Five of Wands", "suit": "Wands", "symbol": "🔥", "image": "/static/tarot-deck/wands-05.webp",
         "theme": "competition or clashing ambitions that need fair handling", "polarity": -1,
         "number": "Five", "position": "Challenge", "orientation": "upright"},
        {"name": "Ace of Pentacles", "suit": "Pentacles", "symbol": "🌿", "image": "/static/tarot-deck/pents-01.webp",
         "theme": "a practical opportunity, resource, or seed for long-term growth", "polarity": 1,
         "number": "Ace", "position": "Near-term direction", "orientation": "upright"},
        {"name": "The World", "suit": "Major Arcana", "symbol": "✦", "image": "/static/tarot-deck/major-20-the-world.webp",
         "theme": "completion, integration, and recognising how far a process has come", "polarity": 1,
         "number": "20", "position": "Guidance", "orientation": "upright"},
        {"name": "Queen of Cups", "suit": "Cups", "symbol": "💧", "image": "/static/tarot-deck/cups-13.webp",
         "theme": "empathy, emotional steadiness, and care that respects boundaries", "polarity": 1,
         "number": "Queen", "position": "Extra clarifier", "orientation": "reversed"},
    ],
}


def _generate_golden_answer(question: str, spread: str, language: Language, cards: list[dict]) -> dict:
    """Generate a golden answer by calling the deterministic interpreter with the fixed cards."""
    # We need to call interpret with pre-drawn cards. Since interpret() draws its own cards,
    # we'll use the fallback directly with our canonical cards.

    # Check if high stakes
    high_stakes = bool(HIGH_STAKES_RE.search(question))

    # Use the fallback interpreter which is deterministic
    result = _fallback(question, cards, language)

    # Apply high stakes handling if needed
    if high_stakes:
        result["verdict"] = "MAYBE"
        result["card_readings"] = _fallback(question, cards, language)["card_readings"]
        if language == "hi":
            result["summary"] = "इस विषय में Tarot तथ्यात्मक हाँ या ना नहीं बता सकता। निर्णय के लिए विश्वसनीय जानकारी और योग्य पेशेवर सहायता लें; कार्ड केवल अपनी भावनाओं और प्रश्नों पर विचार करने का माध्यम हैं।"
            result["synthesis"] = "इस निर्णय के लिए Tarot निश्चित उत्तर नहीं दे सकता। भरोसेमंद जानकारी लें और किसी योग्य पेशेवर से बात करें।"
            result["next_step"] = "अगला कदम लेने से पहले उपयुक्त योग्य पेशेवर या भरोसेमंद सहायता सेवा से बात करें।"
        else:
            result["summary"] = "Tarot cannot answer this as a factual yes or no. Use qualified professional support and reliable evidence; treat the cards only as a prompt to notice your feelings and questions."
            result["synthesis"] = "Use qualified professional support and reliable evidence for this decision. The cards can only prompt reflection, not establish a fact."
            result["next_step"] = "Speak with an appropriately qualified professional or trusted support service before acting."

    return {
        "cards": cards,
        "reading": result,
        "spread": int(spread),
        "ai_attempted": False,
        "note": "Tarot is a symbolic reflection tool. It cannot guarantee outcomes or replace professional advice."
    }


def tarot_golden_case(question: str, spread: str, language: Language = "en") -> TarotGoldenCase:
    """Return a TarotGoldenCase for the given question, spread, and language."""
    cards = CANONICAL_DRAWS[spread]
    answer = _generate_golden_answer(question, spread, language, cards)
    return TarotGoldenCase(question, spread, cards, answer)


def tarot_golden_dataset(language: Language = "en") -> list[TarotGoldenCase]:
    """Return all canonical TarotGoldenCases — one per question per spread type."""
    cases = []
    for spread, questions in TAROT_GOLDEN_QUESTIONS.items():
        for question in questions:
            cases.append(tarot_golden_case(question, spread, language))
    return cases


# Compact distillation for guidance (similar to chat/golden.py)

_SECTION_SPLIT = re.compile(r"(?m)(^### )")


def _distil_tarot(text: str, max_words: int = 300) -> str:
    """Distil a tarot answer into a compact guidance exemplar."""
    parts = _SECTION_SPLIT.split(text)
    blocks: list[str] = []
    for i in range(1, len(parts), 2):
        heading = parts[i]
        body = parts[i + 1] if i + 1 < len(parts) else ""
        blocks.append(heading + body.strip())
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
    if "**Next step:**" not in result and "next_step" not in result.lower():
        result += "\n\n**Next step:** Identify one real-world fact you can verify and one small, respectful action within your control."
    return result


def tarot_golden_guidance(spread: str, question: str, language: Language = "en") -> str:
    """Return a compact, card-grounded example the model can match for structure and depth.

    The returned text is clearly marked as a reference exemplar; the model should match
    its structure, depth, honesty and position-aware discipline. Do not copy its
    card names or positions verbatim — answer the user's actual drawn cards.
    """
    case = tarot_golden_case(question, spread, language)
    reading = case.answer["reading"]

    # Build a distilled version from the reading
    summary = reading.get("summary", "")
    synthesis = reading.get("synthesis", "")
    next_step = reading.get("next_step", "")
    card_readings = reading.get("card_readings", [])

    distilled_parts = []
    if summary:
        distilled_parts.append(f"### Summary\n{summary}")
    if card_readings:
        card_text = "\n".join(f"- {cr['position']}: {cr['card_name']} ({cr['orientation']}) — {cr['text'][:150]}"
                              for cr in card_readings[:3])
        distilled_parts.append(f"### Card readings\n{card_text}")
    if synthesis:
        distilled_parts.append(f"### Synthesis\n{synthesis[:200]}")
    if next_step:
        distilled_parts.append(f"### Next step\n{next_step}")

    distilled = "\n\n".join(distilled_parts)
    distilled = _distil_tarot(distilled, max_words=250)

    return (
        "## Golden Tarot example — reference structure (different wording is fine)\n"
        "The exemplar below is a verified reading for the question shown. Match its structure, "
        "depth, honesty and position-aware discipline. Do not copy its card names, positions, "
        "or orientations verbatim — answer the user's actual drawn cards.\n\n"
        f"Spread: {spread}-card + clarifier\n"
        f"Q: {question}\n\n{distilled}"
    )


# Evaluation function

def evaluate_tarot(answer: dict, question: str, spread: str, language: Language = "en") -> dict:
    """Evaluate a tarot answer against quality checks.

    Returns a dict with pass/fail flags and key metrics.
    """
    reading = answer.get("reading", {})
    cards = answer.get("cards", [])

    verdict = reading.get("verdict", "")
    summary = reading.get("summary", "")
    card_readings = reading.get("card_readings", [])
    synthesis = reading.get("synthesis", "")
    next_step = reading.get("next_step", "")

    # Check required fields
    has_verdict = verdict in {"YES", "NO", "MAYBE", "POSSIBLE"}
    has_summary = len(summary) > 20
    has_synthesis = len(synthesis) > 30
    has_next_step = len(next_step) > 15
    has_card_readings = len(card_readings) == int(spread) + 1  # spread cards + clarifier

    # Check position awareness
    expected_positions = POSITIONS.get(int(spread), []) + ["Extra clarifier"]
    position_match = all(any(cr.get("position") == pos for cr in card_readings) for pos in expected_positions)

    # Check for orientation awareness
    orientation_aware = any("reversed" in cr.get("text", "").lower() or "upright" in cr.get("text", "").lower()
                            for cr in card_readings)

    # High stakes check
    from .tarot_reading import HIGH_STAKES_RE
    high_stakes = bool(HIGH_STAKES_RE.search(question))
    high_stakes_handled = high_stakes and verdict == "MAYBE"

    return {
        "has_verdict": has_verdict,
        "has_summary": has_summary,
        "has_synthesis": has_synthesis,
        "has_next_step": has_next_step,
        "has_card_readings": has_card_readings,
        "position_match": position_match,
        "orientation_aware": orientation_aware,
        "high_stakes_handled": not high_stakes or high_stakes_handled,
        "total_cards": len(card_readings),
        "expected_cards": int(spread) + 1,
        "verdict": verdict,
        "language": language,
        "passes": all([
            has_verdict, has_summary, has_synthesis, has_next_step,
            has_card_readings, position_match, orientation_aware,
            not high_stakes or high_stakes_handled
        ]),
    }