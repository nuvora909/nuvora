"""Real questions people ask, and where each must land. A specific question must never fall through to the
generic life reading: it gets its own composer, its topic, or an honest request to rephrase ("unclear")."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chat.golden_exemplars import REFERENCE_ASKED_AT, REFERENCE_BIRTH  # noqa: E402
from chat.facts import extract_and_verify  # noqa: E402
from chat.intents import is_overview, resolve_topics, special_intent, split_parts  # noqa: E402
from chat.offline import offline_answer  # noqa: E402
from chat.topics import detect_topic  # noqa: E402
from vedic import BirthInput, Options, analyse  # noqa: E402

CASES = [
    ('how will be my relations with my brother', 'relative:brother'),
    ('Will my sister and I ever get along again?', 'relative:sister'),
    ('Does my mother-in-law like me?', 'relative:mother-in-law'),
    ('how is my bond with my father', 'relative:father'),
    ('Will my elder brother help me financially?', 'relative:elder brother'),
    ('My younger sister fights with me a lot, why?', 'relative:younger sister'),
    ('Will my son do well in his studies?', 'relative:son'),
    ("How will my daughter's marriage be?", 'relative:daughter'),
    ("Will my father's health improve?", 'relative:father'),
    ('Is my mother going to be okay after her surgery?', 'relative:mother'),
    ('How are my relations with my in-laws?', 'relative:in-laws'),
    ('Will my friends support me?', 'relative:friends'),
    ('Will my boss promote me?', 'career'),
    ('How is my relationship with my colleagues?', 'relative:colleagues'),
    ('When will I get married?', 'when'),
    ('Will I get married in 2027?', 'year'),
    ('How will my husband be?', 'relative:husband'),
    ('When will I meet my wife?', 'when'),
    ('Love or arranged marriage?', 'love_arranged'),
    ('Will I have a son?', 'children'),
    ('When will I have children?', 'when'),
    ('When will I get a job?', 'when'),
    ('Which career suits me?', 'career_choice'),
    ('Should I start a business or stay in a job?', 'business_job'),
    ('Will I get a government job?', 'govt_job'),
    ('How will my finances be in the next 6 months?', 'money'),
    ('Will I become rich?', 'wealth_scale'),
    ('When will I buy a house?', 'when'),
    ('Will I buy a car this year?', 'year'),
    ('Will I settle abroad?', 'foreign'),
    ('Will I get a visa for Canada?', 'foreign'),
    ('Will I clear my exam?', 'education'),
    ('Should I do an MBA?', 'education'),
    ('How is my health?', 'health'),
    ('When will my bad time end?', 'bad_time'),
    ('Is my Sade Sati over?', 'sade_sati'),
    ('Which gemstone should I wear?', 'gemstone'),
    ('What remedies should I do?', 'remedies'),
    ('Is this a good day to sign a contract?', 'muhurta'),
    ('Will I win my court case?', 'legal'),
    ('Tell me about my personality', 'personality'),
    ('Overview of my chart', 'general'),
    ('What does this year hold for me?', 'year'),
    ('How will next month be?', 'month'),
    ('What is my future?', 'timing'),
    ("I don't know what to do with my life", 'general'),
    ('What is the reason for my delays in marriage?', 'marriage'),
    ('Will I move to England?', 'foreign'),
    ('Is somebody doing black magic on me?', 'unclear'),
    ("How is my luck with my neighbour's dog", 'unclear'),
    ('Will I win the lottery?', 'money'),
    ('Should I invest in crypto?', 'money'),
]


def route(q):
    if special_intent(q):
        return ",".join(i if i != "topic" else t.key for _, i, t in resolve_topics(split_parts(q)))
    t = detect_topic(q)
    return "unclear" if t.key == "general" and not is_overview(q) else t.key


@pytest.mark.parametrize("question,expected", CASES)
def test_each_question_lands_where_it_should(question, expected):
    assert route(question) == expected


@pytest.mark.parametrize("word,question", [("reason", "What is the reason for my stress?"),
                                           ("know", "I want to know about my luck"),
                                           ("England", "Will I move to England?"),
                                           ("somebody", "Is somebody jealous of me?")])
def test_keywords_match_whole_words_only(word, question):
    assert detect_topic(question).key not in ("children", "timing", "property", "health"), word


@pytest.fixture(scope="module")
def chart():
    return analyse(BirthInput(**REFERENCE_BIRTH), Options(), REFERENCE_ASKED_AT)


def test_the_brother_question_is_about_the_brother(chart):
    c, r = chart
    text = offline_answer(c, r, "how will be my relations with my brother", question_time=REFERENCE_ASKED_AT)
    assert text.startswith("Your relationship with your brother") and "3rd house" in text
    assert "Your chart's foundation" not in text and "yoga pattern" not in text
    assert not extract_and_verify(text, c, r).contradicted


GOLDEN = [
    ("Will I ever be financially stable? Why is money not staying with me?", "money_leak", r"financially stable"),
    ("Is my partner right for me?", "partner_match", r"both charts"),
    ("Will my ex come back?", "ex", r"can't force someone else's choice"),
    ("My father is seriously ill. Will he recover?", "relative:father", r"won't predict"),
    ("Why is there constant conflict at home?", "home_conflict", r"4th house"),
    ("I have Mangal Dosha. Will it ruin my marriage?", "manglik", r"Mangal Dosha"),
    ("Do I have Kaal Sarp Dosha or Sade Sati? Is it dangerous?", "kaal_sarp", r"Kaal Sarp.*\*\*Sade Sati:\*\*"),
    ("Is astrology scientific? Do you really believe this?", "skeptic", r"isn't scientifically validated"),
    ("Can you change my destiny?", "destiny", r"can't change your destiny"),
    ("Someone told me something terrible is going to happen to me.", "fear", r"don't carry that fear"),
    ("When will I die?", "death", r"won't predict death"),
    ("When will my father die?", "death", r"won't predict death"),
]


@pytest.mark.parametrize("question,intent,must", GOLDEN)
def test_golden_questions_get_careful_direct_answers(chart, question, intent, must):
    import re
    from chat.intents import intent_of
    c, r = chart
    assert intent_of(split_parts(question)[0]) == intent
    text = offline_answer(c, r, question, question_time=REFERENCE_ASKED_AT)
    assert re.search(must, text, re.S), text[:300]
    assert "You asked a few things" not in text, "one question asked twice is answered once"
    assert not re.search(r"recovery is well supported|will recover|you will die|lifespan of", text)
    assert not extract_and_verify(text, c, r).contradicted


def test_manglik_cancellations():
    from vedic.chart import BirthInput as B, Chart, Options as O
    from vedic.dosha import manglik_status
    m = manglik_status(Chart(B(**REFERENCE_BIRTH), O(vargas=())))
    assert m["level"] in ("none", "cancelled", "mild", "moderate", "strong")
    assert (m["level"] == "none") == (not m["hits"])


@pytest.mark.parametrize("question", ["will i become a millionaire or a billionaire?", "Will I be rich?",
                                      "Will I become a crorepati?", "when will i become rich",
                                      "Can I achieve financial freedom?"])
def test_wealth_questions_get_an_honest_wealth_reading(chart, question):
    import re
    from chat.intents import intent_of
    c, r = chart
    assert detect_topic(question).key == "money"
    assert intent_of(question) == "wealth_scale"
    text = offline_answer(c, r, question, question_time=REFERENCE_ASKED_AT)
    assert "couldn't tie" not in text
    for must in ("2nd lord", "11th lord", "Jupiter", "Earning versus keeping", "financial adviser"):
        assert must in text, must
    assert re.search(r"no chart can honestly promise|not a number", text)
    assert not re.search(r"you will (become|be) (a )?(millionaire|billionaire|rich)", text, re.I)
    assert not extract_and_verify(text, c, r).contradicted


def test_billionaire_gets_the_rarity_line(chart):
    c, r = chart
    text = offline_answer(c, r, "will i become a millionaire or a billionaire?", question_time=REFERENCE_ASKED_AT)
    assert "### Millionaire or billionaire?" in text and "extremely rare" in text
    assert "Saturn–Saturn" not in text
