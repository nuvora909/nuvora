"""Compose a Tarot reading the way a reader speaks: answer first, cards in conversation, one next step.

Used whenever the AI reader is off or unavailable. The input is the question and the drawn cards
(main spread plus one clarifier); the output keeps the shape the page renders:
verdict, summary, card_readings, synthesis, next_step.
"""
from __future__ import annotations

import re

from tarot_knowledge import COURT_PEOPLE, MAJOR, RANK, SUIT

YES_NO = re.compile(r"^\s*(will|should|is|are|am|does|do|did|can|could|would|shall|may|has|have)\b", re.I)
WHEN = re.compile(r"\bwhen\b", re.I)
LOVE = re.compile(r"\b(love|feelings?|relationship|partner|marriage|marry|crush|like me|dating|date|girlfriend|boyfriend|"
                  r"spouse|husband|wife|ex|breakup|soulmate|romance|together)\b", re.I)
WORK = re.compile(r"\b(job|career|work|business|interview|offer|company|join|promotion|profession|boss|startup|study|exam)\b", re.I)
MONEY = re.compile(r"\b(money|finance|financial|investment|invest|debt|loan|purchase|profit|salary|buy|sell|property)\b", re.I)
OTHER_PERSON = re.compile(r"\b(he|she|they|him|her|them|his|their)\b|\b(?:does|do|did|will|is)\s+\w+\s+(?:still\s+)?"
                          r"(?:like|love|miss|think|want|care|feel)\b|\b(?:love|miss|want|like)s?\s+me\b", re.I)

# How much each position counts toward the overall lean. A hard card in the Challenge seat is expected,
# so that seat counts least; the near-term direction and the focus count most.
WEIGHT = {"Focus": 2.0, "Situation": 1.0, "Present": 1.5, "Near-term direction": 2.0, "Guidance": 1.0,
          "Challenge": 0.5, "Context": 0.75, "Root": 0.75, "Past influence": 0.5}

OPENERS = {
    "Focus": "At the heart of this is {card}",
    "Situation": "Where things stand is shown by {card}",
    "Present": "Right now {card} describes your position",
    "Context": "The wider setting is {card}",
    "Root": "Underneath it all sits {card}",
    "Past influence": "From behind you, {card} still echoes",
    "Challenge": "The obstacle is {card}",
    "Near-term direction": "Ahead, {card} shows where this is moving",
    "Guidance": "The advice card is {card}",
    "Extra clarifier": "The clarifier, {card}, adds a quieter note",
}


BARE_MAJORS = {"Strength", "Justice", "Death", "Temperance", "Judgement"}


def _ref(card) -> str:
    """How a reader names a card mid-sentence: 'the Chariot', 'the Five of Swords', 'Temperance'."""
    name = card["name"]
    if name.startswith("The "):
        return "the " + name[4:]
    return name if name in BARE_MAJORS else "the " + name


def _rank_suit(card):
    if card["suit"] == "Major Arcana":
        return None, None
    return card["name"].split(" of ")[0], card["suit"]


def _value(card) -> float:
    """Upright cards count at face value. A reversed positive card is blocked (it neither helps nor hurts),
    and a reversed difficult card is softening, so it counts slightly in your favour."""
    p = card["polarity"]
    if card["orientation"] == "reversed":
        return 0.0 if p > 0 else (0.5 if p < 0 else -0.25)
    return float(p)


def _meaning(card) -> str:
    rev = card["orientation"] == "reversed"
    if card["suit"] == "Major Arcana":
        return MAJOR[card["name"]][0] if rev else card["theme"]
    rank, suit = _rank_suit(card)
    if rev:
        return f"{RANK[rank][0]}, around {SUIT[suit][3]}"
    return card["theme"]


def _advice(card) -> str:
    if card["suit"] == "Major Arcana":
        return MAJOR[card["name"]][1]
    rank, _ = _rank_suit(card)
    return RANK[rank][1]


def _lens(card, domain: str) -> str | None:
    """What this card says about the question's own life area, if it has something specific to add."""
    if card["suit"] == "Major Arcana":
        _, _, love, work, money = MAJOR[card["name"]]
        angle = {"love": love, "career": work, "money": money}.get(domain)
        lead = {"love": "In love", "career": "At work", "money": "With money"}.get(domain)
        return f"{lead}, it speaks of {angle}" if angle else None
    rank, suit = _rank_suit(card)
    if rank in COURT_PEOPLE:
        return f"As a court card, it may point to {COURT_PEOPLE[rank]}, or to that quality in you"
    if domain != "general" and SUIT[suit][2] == domain:
        return f"As a {suit} card, it lands squarely on {SUIT[suit][3]}, which is the heart of your question"
    return None


def _classify(question: str) -> dict:
    q = question or ""
    domain = "love" if LOVE.search(q) else "career" if WORK.search(q) else "money" if MONEY.search(q) else "general"
    return {"domain": domain, "yes_no": bool(YES_NO.search(q)), "when": bool(WHEN.search(q)),
            "other_person": domain == "love" and bool(OTHER_PERSON.search(q))}


def _verdict(main) -> tuple[str, float]:
    total = sum(WEIGHT.get(c["position"], 1.0) for c in main) or 1.0
    score = sum(WEIGHT.get(c["position"], 1.0) * _value(c) for c in main) / total
    if score >= 0.45:
        return "YES", score
    if score >= 0.15:
        return "POSSIBLE", score
    if score <= -0.3:
        return "NO", score
    return "MAYBE", score


def _card_text(card, info, index) -> str:
    rev = card["orientation"] == "reversed"
    opener = OPENERS.get(card["position"], "{card} appears").format(card=_ref(card))
    opener = opener[0].upper() + opener[1:]
    if card["position"] == "Guidance":
        text = f"{opener}{', reversed,' if rev else ''} and it asks you to {_advice(card)}."
        if rev:
            text += f" Reversed, it warns that {_meaning(card)} is getting in the way of that."
    else:
        text = f"{opener}{' — reversed' if rev else ''}: {_meaning(card)}."
    lens = _lens(card, info["domain"])
    if lens and card["position"] != "Extra clarifier":
        text += f" {lens}."
    elif card["position"] == "Extra clarifier":
        text += " It colours the main message rather than overruling it."
    return text


def _patterns(main) -> list[str]:
    notes = []
    suits = [c["suit"] for c in main if c["suit"] != "Major Arcana"]
    majors = sum(1 for c in main if c["suit"] == "Major Arcana")
    reversed_n = sum(1 for c in main if c["orientation"] == "reversed")
    n = len(main)
    if n >= 3 and majors >= (n + 1) // 2:
        notes.append("Most of these cards are Major Arcana, so this is about a larger life chapter, not a passing mood")
    for suit in SUIT:
        if n >= 3 and suits.count(suit) >= max(2, (n + 1) // 2):
            notes.append(f"{suit} dominate the spread, putting the weight on {SUIT[suit][1]}")
    if n >= 3 and reversed_n >= (n + 1) // 2:
        notes.append("More than half the cards are reversed: the energy is turned inward or held back, so expect slower movement than you would like")
    courts = [c for c in main if (_rank_suit(c)[0] or "") in COURT_PEOPLE]
    if len(courts) >= 2:
        notes.append("Several court cards appear, so other people's choices are part of how this unfolds")
    ranks = [_rank_suit(c)[0] for c in main if _rank_suit(c)[0]]
    for rank in set(ranks):
        if ranks.count(rank) >= 2:
            notes.append(f"Two {rank}s repeat the theme of {RANK[rank][2]}")
    return notes


def _trajectory(main) -> str | None:
    by = {c["position"]: c for c in main}
    if not {"Past influence", "Present", "Near-term direction"} <= set(by):
        return None
    past, now, ahead = (_value(by[p]) for p in ("Past influence", "Present", "Near-term direction"))
    if ahead > now:
        return "The movement from past to present to near future is upward: what is hard now is not where this ends"
    if ahead < now:
        return "The near-term card is harder than the present one, so the next stretch asks for care before things ease"
    return "Past, present and near future sit at a similar level: this is a steady road, and change will come from what you do"


def compose(question: str, cards: list[dict]) -> dict:
    info = _classify(question)
    main, clarifier = cards[:-1], cards[-1]
    verdict, score = _verdict(main)
    if info["other_person"] and verdict == "YES":
        verdict = "POSSIBLE"          # no confident yes about what someone else privately feels
    by = {c["position"]: c for c in main}
    challenge, guidance = by.get("Challenge"), by.get("Guidance")
    anchor = by.get("Focus") or by.get("Present") or by.get("Situation") or main[0]
    ahead = by.get("Near-term direction")

    lean = {"YES": "The cards lean yes", "POSSIBLE": "The cards lean cautiously toward yes",
            "MAYBE": "The cards do not give a clean yes or no", "NO": "The cards lean no, at least for now"}[verdict]
    if not info["yes_no"]:
        lean = {"YES": "This spread is encouraging", "POSSIBLE": "This spread is quietly encouraging",
                "MAYBE": "This spread is mixed", "NO": "This spread is a caution"}[verdict]
    center = f"{lean}. The centre of the reading is {_ref(anchor)}: {_meaning(anchor)}"
    if challenge and guidance:
        hinge = (f". The sticking point is {_ref(challenge)} ({_meaning(challenge)}), and the cards' answer to it is to "
                 f"{_advice(guidance)}")
    elif ahead:
        hinge = f"; the direction ahead points to {_meaning(ahead)}"
    else:
        hinge = f"; the clarifier adds {_meaning(clarifier)}"
    summary = center + hinge + "."
    if info["other_person"]:
        summary += " The cards describe the dynamic around you both; they cannot read another person's private feelings."
    if info["when"]:
        summary += " Tarot speaks to conditions rather than dates: watch for the shift the direction card describes."

    readings = [{"position": c["position"], "card_name": c["name"], "orientation": c["orientation"],
                 "text": _card_text(c, info, i)} for i, c in enumerate(cards)]

    parts = _patterns(main)
    traj = _trajectory(main)
    if traj:
        parts.append(traj)
    if challenge and guidance:
        parts.append(f"The obstacle and the advice belong together: {_ref(challenge)} names what is in the way, and "
                     f"{_ref(guidance)} shows the way through it, which is to {_advice(guidance)}")
    agrees = (_value(clarifier) >= 0) == (score >= 0)
    parts.append(f"The clarifier, {_ref(clarifier)}, " + ("agrees with this" if agrees else "tempers it")
                 + f". Its added note: {_meaning(clarifier)}")
    if len(main) == 1:
        parts.insert(0, f"With a single card the message is concentrated: {_meaning(main[0])}")
    synthesis = ". ".join(p[0].upper() + p[1:] for p in parts) + "."

    step_card = guidance or anchor
    concrete = {
        "love": "say one honest thing you have been holding back, and notice how it is received",
        "career": "take one visible action this week: a conversation, an application or a finished piece of work",
        "money": "check one concrete number this week — a budget line, an offer or a rate — before deciding",
        "general": "pick one small, real step you can take this week and do it",
    }[info["domain"]]
    advice = _advice(step_card)
    next_step = f"{advice[0].upper()}{advice[1:]}. In practice: {concrete}."

    return {"verdict": verdict, "summary": summary, "card_readings": readings, "synthesis": synthesis,
            "next_step": next_step, "engine": "card-based"}
