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


# Hand-written golden readings: how a thoughtful reader answers, one per spread size. They use the fixed
# draws above, so the tests can check that every card is read and the score stays high.
TAROT_EXEMPLARS: dict[str, dict] = {
    "1": {
        "question": "What energy should I focus on today?",
        "reading": {
            "verdict": "YES",
            "summary": "The energy to lean into today is hope that you rebuild on purpose. The Star asks you to look past "
                       "what has been draining you and put your attention on something that restores you, and the Three of "
                       "Cups says that restoration comes easiest in good company.",
            "card_readings": [
                {"position": "Focus", "text": "The Star, upright, is a card of renewal after a hard stretch. It is not "
                 "dramatic; it is the quiet moment when you breathe again and remember what you are working toward. As "
                 "today's focus it asks you to protect your optimism, choose one thing that feeds you rather than drains "
                 "you, and trust that small, steady repair counts."},
                {"position": "Extra clarifier", "text": "The Three of Cups adds who to do it with: friends, community, "
                 "people you can laugh with. The Star's renewal is not meant to be solitary today; a conversation or a "
                 "shared moment will do more for your energy than another hour alone with your list."},
            ],
            "synthesis": "Together the two cards point the same way: today is for refilling, not pushing. The Star "
                         "names the need (hope and perspective) and the Three of Cups names the source (connection), so "
                         "the day goes best when you treat rest and company as part of the work rather than a reward "
                         "after it.",
            "next_step": "Message one person who lifts your mood and make a small plan to see or call them today, "
                         "then choose one task to finish slowly and well instead of five done in a rush.",
        },
    },
    "3": {
        "question": "Should I accept the new job offer?",
        "reading": {
            "verdict": "YES",
            "summary": "The cards lean yes, provided you go in with your eyes open. The Chariot says you have the drive "
                       "to make this move work, and the reversed Five of Swords suggests an old conflict is losing its "
                       "grip. Temperance's condition is pace: negotiate and settle in gradually rather than charging in "
                       "to prove something.",
            "card_readings": [
                {"position": "Situation", "text": "The Chariot, upright, shows you ready to move: ambitious, focused and "
                 "tired of standing still. In a job decision it is the card of choosing a direction and steering it, so "
                 "the offer fits where your energy already is."},
                {"position": "Challenge", "text": "The Five of Swords reversed points to friction that is winding down: "
                 "a rivalry, an argument or a bruising experience at your current job. The challenge is not the new role; "
                 "it is not letting that old fight shape how you negotiate or how you leave."},
                {"position": "Guidance", "text": "Temperance asks you to blend, not swing. Accept on terms that work for "
                 "you, give yourself a realistic settling-in period, and keep relationships intact on the way out rather "
                 "than burning bridges."},
                {"position": "Extra clarifier", "text": "The Knight of Pentacles adds steadiness: this choice pays off "
                 "through reliable, consistent effort over months, not a dramatic first week. It supports the yes and "
                 "slows its tempo."},
            ],
            "synthesis": "The Chariot and Temperance work as a pair: drive gets you to the new role, balance keeps you "
                         "there. The reversed Five of Swords sits between them as the thing to leave behind, and the "
                         "Knight of Pentacles confirms that the payoff is real but gradual. Read together, the spread "
                         "favours accepting, as long as you move deliberately rather than in reaction to past conflict.",
            "next_step": "Before you sign, write down the three terms that matter most to you — pay, role scope and "
                         "start date — and ask for them in one calm conversation; then give your current team a clean, "
                         "courteous handover.",
        },
    },
    "7": {
        "question": "I feel stuck in life. What do I need to understand to move forward?",
        "reading": {
            "verdict": "MAYBE",
            "summary": "The spread is mixed but hopeful: you are not as stuck as you feel, you are in the middle of a "
                       "shake-up that has not finished yet. The Tower says old assumptions are falling away, the Ace of Pentacles shows something "
                       "practical and new arriving next, and the World asks you to finish the chapter you are in rather "
                       "than looking for a shortcut out of it.",
            "card_readings": [
                {"position": "Context", "text": "The Moon sets the scene: uncertainty, mixed feelings and a sense that "
                 "you cannot see the path clearly. Part of feeling stuck is simply not having enough information yet."},
                {"position": "Root", "text": "The Eight of Cups underneath says you already know something no longer "
                 "satisfies you. The deeper driver is a wish to leave a pattern behind and look for something with more "
                 "meaning."},
                {"position": "Past influence", "text": "The Six of Swords reversed shows an earlier move that did not "
                 "fully happen: you started to leave a difficult situation but parts of it came with you."},
                {"position": "Present", "text": "The Tower is the honest picture of now: structures you relied on are "
                 "shifting. It feels like disruption, but it is also what clears the ground."},
                {"position": "Challenge", "text": "The Five of Wands names the friction: competing demands, other "
                 "people's agendas and your own scattered priorities pulling in different directions."},
                {"position": "Near-term direction", "text": "The Ace of Pentacles is the hopeful card here: a concrete, "
                 "practical opening, such as work, a skill or a resource, is next on the road if you stay ready for it."},
                {"position": "Guidance", "text": "The World asks you to complete what you started. Closing a loose end "
                 "gives you the stable footing the Ace of Pentacles needs."},
                {"position": "Extra clarifier", "text": "The Queen of Cups reversed adds that you have been caring for "
                 "everyone but yourself; some of the stuck feeling is emotional exhaustion, not lack of direction."},
            ],
            "synthesis": "The story runs from the Six of Swords reversed (an unfinished move) through the Tower (the shake-"
                         "up now) to the Ace of Pentacles (a practical new start), so the direction is upward. The Five of "
                         "Wands and the World answer each other: scattered effort is the obstacle and completion is the "
                         "remedy. The Moon and the reversed Queen of Cups explain why it feels worse than it is: unclear "
                         "information and an emotional tank running low.",
            "next_step": "List the unfinished things competing for your attention, choose the one whose completion would "
                         "free you most, and finish it this month; protect two evenings a week for rest so you can see "
                         "the next opening when it arrives.",
        },
    },
}


def tarot_golden_guidance(spread: str, question: str = "", language: Language = "en") -> str:
    """The hand-written golden reading for this spread size, shown to the model as a model of reasoning and tone.

    It belongs to a different question and draw: the model must read the user's own cards."""
    import json as _json
    ex = TAROT_EXEMPLARS.get(str(spread)) or TAROT_EXEMPLARS["3"]
    return (
        "## Golden Tarot example (DIFFERENT QUESTION AND CARDS: copy the reasoning and tone, never the cards)\n"
        "Qualities to match: answer the question in the first sentence; read each card in its position as it "
        "applies to THIS question; show how the cards answer one another (obstacle and advice, past to future, "
        "the clarifier as a modifier); state any caveat once, not per card; end with one concrete step.\n\n"
        f"Spread: {ex['reading'] and len(ex['reading']['card_readings']) - 1}-card + clarifier\n"
        f"Q: {ex['question']}\n" + _json.dumps(ex["reading"], ensure_ascii=False, indent=1)
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