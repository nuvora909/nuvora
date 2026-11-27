"""Topic blueprints shared by the AI reader and the deterministic offline reader.

A topic is not just a keyword: it defines the houses, natural significators, divisional chart,
timing horizon and practical emphasis that a complete Parashari reading must cover.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Topic:
    key: str
    label: str
    houses: tuple[int, ...]          # analysed in detail, in priority order
    secondary: tuple[int, ...]       # used for timing and synthesis
    karakas: tuple[str, ...]
    varga: int | None
    varga_house: int
    focus: str
    actions: tuple[str, ...]


TOPICS = {
    "general": Topic("general", "Full life reading", (1, 10, 7, 4), (2, 5, 9, 11), ("MOON", "SUN"), 9, 1,
        "temperament, life direction, strengths, relationships, career and the current chapter",
        ("Build around the factors that repeat across D1 and the divisional charts, not around one dramatic placement.",
         "Use the stronger dasha windows for important initiatives and the quieter ones for preparation.",
         "Revisit the reading when the mahadasha changes; the same natal promise is expressed differently by period.")),
    "career": Topic("career", "Career, business and status", (10, 6, 11), (2, 9, 5), ("SATURN", "MERCURY"), 10, 10,
        "profession, service versus independent work, visibility, competition, gains and professional timing",
        ("Keep a visible record of results and skills; this makes supportive periods easier to convert into offers or recognition.",
         "Prepare qualifications, portfolio and contacts before a strong window instead of waiting for it to arrive.",
         "Do not make an irreversible job decision from astrology alone; test the opportunity against role, manager and finances.")),
    "marriage": Topic("marriage", "Marriage and partnerships", (7, 2, 8), (11, 5, 4), ("VENUS", "JUPITER"), 9, 7,
        "partnership style, family formation, shared adjustment, commitment and relationship timing",
        ("Discuss expectations, money, family boundaries and conflict habits explicitly; a chart cannot replace that conversation.",
         "Use supportive periods for introductions, engagement and formal commitment, not as a deadline.",
         "Do not use a placement or dosha to label a partner or to decide whether to leave or stay.")),
    "money": Topic("money", "Wealth, savings and gains", (2, 11, 9), (5, 4, 10), ("JUPITER", "MERCURY"), 2, 2,
        "earning, saving, family resources, gains, fortune and the sustainability of wealth",
        ("Track cash flow and reserves first; a favourable wealth indication is not a reason to increase leverage.",
         "Separate earned income, speculative gains and shared or inherited money; they come from different houses.",
         "Use a qualified financial adviser for actual investment, tax and debt decisions.")),
    "property": Topic("property", "Property, home and vehicles", (4, 2, 11), (9, 10, 12), ("MARS", "VENUS"), 4, 4,
        "residence, land, property, domestic stability, comforts and relocation of the home base",
        ("Treat a favourable period as a time for inspection, finance preparation and negotiation, not automatic ownership.",
         "Check title, legal documents, location and affordability independently of the chart.",
         "Distinguish a desire to move from the suitability of a particular property.")),
    "education": Topic("education", "Education and learning", (4, 5, 9), (2, 10, 11), ("MERCURY", "JUPITER"), 24, 5,
        "basic education, intelligence, higher learning, teachers, specialisation and examination timing",
        ("Choose a field that matches the repeated learning pattern, then validate it with aptitude and real exposure.",
         "Use supportive periods for applications and examinations; use slower ones for foundations and revision.",
         "Measure progress with work samples and feedback, not only with the reading.")),
    "children": Topic("children", "Children and creativity", (5, 9, 2), (11, 7, 4), ("JUPITER",), 7, 5,
        "children, creativity, teaching, legacy and the responsibilities that accompany them",
        ("For fertility, pregnancy or a child's health, rely on qualified medical care rather than a birth chart.",
         "Read the fifth house as creativity and mentorship too; its promise is not limited to biological children.",
         "Use supportive periods for planning and preparation without treating them as guarantees.")),
    "foreign": Topic("foreign", "Foreign travel and residence", (3, 9, 12, 4), (2, 7, 10, 11), ("RAHU", "MOON"), 4, 4,
        "long journeys, foreign residence, distance from the birthplace and the effect on home and career",
        ("Separate short travel, a work assignment and permanent relocation; they need different practical preparation.",
         "Check visas, employment, language and support networks before treating a period as a relocation window.",
         "Consider whether the move improves the whole life pattern, not only the wish to escape a current difficulty.")),
    "spiritual": Topic("spiritual", "Spiritual life and inner growth", (9, 12, 5), (8, 4, 1), ("KETU", "JUPITER"), 20, 9,
        "dharma, teachers, practice, retreat, intuition, detachment and the search for meaning",
        ("Prefer a sustainable practice and a trustworthy teacher over intense but inconsistent effort.",
         "Keep spiritual discernment grounded in ethics, evidence and everyday responsibilities.",
         "Use reflective periods for study and service rather than withdrawing from necessary medical or practical help.")),
    "health": Topic("health", "Health, vitality and resilience", (1, 6, 8), (12, 4, 10), ("SUN", "MOON"), None, 1,
        "vitality, routines, vulnerability, recovery and periods requiring better self-care",
        ("Use the reading only to reflect on routines, rest and stress; it cannot diagnose or rule out illness.",
         "Seek a qualified clinician for symptoms, screening, medication and treatment decisions.",
         "Choose sustainable sleep, food and movement habits rather than drastic regimens.")),
    "timing": Topic("timing", "Current dasha and transits", (1, 10), (2, 7, 9, 11), ("MOON", "SATURN"), None, 1,
        "the present mahadasha, antardasha and pratyantar, their agenda and slow-transit triggers",
        ("Work with the current period's agenda instead of expecting every area of life to move at once.",
         "Use sub-period changes as review points for plans already under way.",
         "Allow a wider timing margin if the birth-time sensitivity report flags the Moon nakshatra.")),
    "year": Topic("year", "Yearly predictions", (1, 10, 7), (2, 5, 9, 11), ("JUPITER", "SATURN"), None, 1,
        "the next twelve months across identity, work, relationships, money and major transit changes",
        ("Choose two or three priorities for the year; a transit calendar is useful only when tied to real decisions.",
         "Review plans at antardasha and major ingress dates rather than treating every day as equally active.",
         "Keep the forecast provisional where birth-time sensitivity affects dasha dates.")),
    "month": Topic("month", "Monthly predictions", (1, 10, 7), (2, 6, 11), ("MOON", "MERCURY"), None, 1,
        "the next thirty days across work, money, relationships, routines and short-term decision windows",
        ("Pick one priority for the month and use the dated periods as planning windows, not fixed event dates.",
         "Keep routine decisions reversible around demanding periods and avoid treating a quiet week as a denial.",
         "Recheck the forecast after the next antardasha or pratyantardasha change; short timing is especially birth-time sensitive.")),
    "lifetime": Topic("lifetime", "Lifetime predictions", (1, 9, 10), (2, 4, 5, 7, 11), ("JUPITER", "SATURN"), 9, 1,
        "the lifelong pattern, major developmental chapters, recurring strengths, duties and mahadasha phases",
        ("Treat each mahadasha as a chapter with an agenda, not a guarantee of marriage, wealth, illness or any other event.",
         "Build durable skills, relationships and reserves that remain useful when the ruling planet and chapter change.",
         "Return to the detailed yearly reading before making a time-sensitive decision; a lifetime map is deliberately broad.")),
}

RULES = [
    ("month", r"month ahead|next month|this month|monthly|30 days|thirty days"),
    ("lifetime", r"lifetime|life time|whole life|entire life|life-long|lifelong|major life chapters"),
    ("year", r"yearly|year ahead|next year|this year|annual|12 months|twelve months|202[0-9].*(outlook|forecast|hold)"),
    ("property", r"property|real estate|house purchase|home loan|land|flat|apartment|vehicle|car\b"),
    ("education", r"educat|study|studies|exam|college|university|degree|learn|course|phd|school|mba\b|masters|ms\b|"
                  r"b\.?tech|m\.?tech|engineering entrance|neet|jee\b|gate\b|cat exam|gre\b|gmat|ielts|upsc prep|coaching"),
    ("children", r"child|children|son|daughter|baby|pregnan|kids|fertil|conceiv"),
    ("spiritual", r"spiritual|spirituality|dharma|meditat|mantra|sadhana|moksha|inner growth|past karma"),
    ("health", r"health|disease|illness|sick|body|surgery|hospital|energy|vitality|mental health"),
    ("foreign", r"foreign|abroad|travel|visa|relocat|settle|overseas|immigra|move to|moving to|shift(?:ing)? to|"
                r"canada|usa\b|america|uk\b|england|britain|london|australia|germany|dubai|europe|new zealand|singapore"),
    ("marriage", r"marri|spouse|wife|husband|partner|relationship|love|wedding|divorce|compatib"),
    ("money", r"money|wealth|finance|income|rich|savings|invest|debt|loan|financial|salary|lottery|gambl|speculat|"
              r"stock|share market|trading|crypto|profit|loss\b"),
    ("career", r"career|job|work|profession|business|promotion|boss|office|employ|startup|interview"),
    ("timing", r"dasha|period|now|current|timing|when|future|transit|sade|mahadasha|antardasha|pratyantar"),
]


def is_join_decision(question: str) -> bool:
    q = question.lower()
    if re.search(r"\b(?:course|class|college|university|school|degree|phd|bootcamp|academy|student)\b", q):
        return False
    return bool(re.search(r"\b(?:shall|should|would|could|can)\s+i\s+(?:join|accept|take)\b", q)
                or re.search(r"\b(?:join|accept)(?:ing)?\b.*\b(?:company|job|offer|role|employer|firm|organisation|organization)\b", q))


def is_decision_question(question: str) -> bool:
    q = question.lower()
    return is_join_decision(q) or bool(re.search(r"\b(?:shall|should|would|could|can)\s+i\b|\bor\s+not\b", q))


def detect_topic(question: str) -> Topic:
    q = question.lower()
    if is_join_decision(q):
        return TOPICS["career"]
    # Explicit foreign/residence intent must take priority over generic "study"
    # wording in prompts such as "temporary work/study stay abroad".
    if re.search(r"\b(?:foreign|abroad|overseas|visa|immigra\w*)\b", q):
        return TOPICS["foreign"]
    # "Relocation" alone means moving abroad only when the question is not about a home or property.
    if re.search(r"\brelocat\w*", q) and not re.search(r"\b(?:property|home|house|flat|apartment|land|vehicles?)\b", q):
        return TOPICS["foreign"]
    for key, rx in RULES:
        # Each keyword must start a word: "son" is not "reason", "now" is not "know", "land" is not "England".
        if re.search(rf"\b(?:{rx})", q):
            return TOPICS[key]
    return TOPICS["general"]


def deep_prompt(topic: Topic) -> str:
    """Instruction appended privately to the user's message for the live model."""
    houses = ", ".join(f"H{h}" for h in topic.houses)
    varga = (f"Use the prefetched D{topic.varga} evidence and verify the reading through its lagna and "
             f"H{topic.varga_house}; compare it with D1." if topic.varga else
             "Do not force a divisional chart into this answer; D1, dashas and transits are sufficient.")
    horizon = {"month": "30 days with pratyantar and fast-planet ingress detail",
               "year": "12-18 months with pratyantar detail",
               "timing": "12-18 months with pratyantar detail",
               "foreign": "up to five years of antardasha activations, with the next three years of pratyantar detail",
               "lifetime": "the full remaining mahadasha sequence; explain life chapters rather than listing guaranteed events"}.get(
                   topic.key, "the relevant windows over the next 5-10 years")
    extra = (" Organise the forecast into dated fortnightly or period-based phases and include practical priorities for the month."
             if topic.key == "month" else
             " Organise the long-range map by mahadasha, explain how the same natal promise changes expression by chapter, and do not turn it into a list of certain events."
             if topic.key == "lifetime" else
             " Give a month-by-month or period-based flow across the full year, not only the current period."
             if topic.key == "year" else "")
    foreign_rules = ""
    if topic.key == "foreign":
        foreign_rules = """

Foreign travel and residence answer rubric (follow only when this is the user's topic):
- Open with a short verdict split into: short journeys; temporary work/study stay abroad; permanent settlement. Use calibrated labels such as strong, supported with conditions, mixed, or not assessable. Do not collapse these into one yes/no.
- For a broad reading, organize the answer as: bottom line; house-level reasoning; a compact comparison table for short travel / temporary stay / permanent settlement (supports, limits, reading); up to three dated windows from nearest to later; practical sequence; confidence. For a narrow follow-up, keep the same distinctions but shorten the format.
- Explain the outward indicators and the home/settlement indicators separately. For every material indicator, state whether it leans toward travel, toward living away, toward staying/rootedness, or only toward a temporary journey. Consider H3 for short journeys; H9 for long-distance travel; H12 for foreign stays; H4 for home, roots, and the ability to establish a base. Include each house's lord, placement, occupants, aspects, and Sarvashtakavarga when supplied. Use Saturn's placement and the 6th/12th node axis only when present and relevant. Rahu or a strong H12 alone never proves relocation.
- Interpret H4 support carefully: it can show roots, domestic stability, and capacity to establish a comfortable home (including abroad); by itself it is not evidence that the person will leave. Explain any mobile-home implication only when the supplied H4-lord placement supports it.
- Read Moon and Rahu in their actual chart context, including dignity, conjunctions, dispositor, and relevant house ownership when those fields are supplied. Check debilitation cancellation/neecha-bhanga only when the engine explicitly supplies that result; never infer a cancellation from a partial rule.
- Use D1 as the main promise and D4 as a secondary cross-check. Compare the D4 lagna lord and 4th lord with D1 evidence. If the D4 lagna or relevant factor is birth-time sensitive, say so and lower confidence; D4 cannot override D1.
- When timing is useful or requested, order no more than three windows from nearest to later. Use the supplied dasha periods and ingress/transit dates together: say which dasha activates the topic, what the transit adds, and what practical step the window suits. A node ingress date must match the configured mean/true node and ayanamsa in the chart context. Never invent dates or treat a transit as an event promise.
- Finish with a brief practical sequence for the person to test the opportunity (for example, short visit or assignment before an irreversible move) and checks for visa eligibility, work/study, finances, housing, return options, and support network. State confidence and the concrete data or birth-time limitation behind it.
- Do not copy a sample chart's placements, verdict, dates, or conclusions. Transfer its reasoning discipline only. If the report omits a requested indicator, say that it is unavailable and do not fill the gap by guessing.
"""
    return f"""
[Analysis blueprint: {topic.label}. Cover {topic.focus}. Analyse {houses} in D1, their lords,
occupants, aspects and SAV support; assess {', '.join(x.title() for x in topic.karakas)} as natural
significator(s). {varga} Time the synthesis using {horizon}.{extra} This must be a synthesis, not a list of
placements: explain how the factors reinforce or contradict one another. Include both supportive and
challenging evidence, a practical action section, and an explicit confidence/sensitivity assessment.{foreign_rules}]"""


ANALYSIS_MODES = [
    ("general", "Full life reading", "Personality, strengths, life direction, career, relationships and timing"),
    ("career", "Career & business", "D1 + D10, job versus business, status, gains and timing"),
    ("marriage", "Marriage & partnership", "7th house, Venus/Jupiter, D9 and commitment windows"),
    ("money", "Wealth & finances", "Income, savings, fortune, D2 and sustainable gains"),
    ("property", "Property & home", "4th house, Mars, D4 and purchase or relocation timing"),
    ("education", "Education & skills", "Learning pattern, higher studies, D24 and exam periods"),
    ("children", "Children & creativity", "5th house, Jupiter, D7 and family timing"),
    ("foreign", "Foreign travel & residence", "12th/9th/4th houses, Rahu and relocation windows"),
    ("spiritual", "Spiritual life", "9th/12th houses, Ketu/Jupiter and D20"),
    ("timing", "Current period deep-dive", "Mahadasha, antardasha, pratyantar and live transits"),
    ("year", "Yearly predictions", "Your next 12 months with dated dasha phases and major transits"),
    ("month", "Monthly predictions", "Your next 30 days with short-period and fast-transit timing"),
    ("lifetime", "Lifetime predictions", "Lifelong patterns and every major mahadasha chapter"),
    ("health", "Health & resilience", "Vitality and routines only — never diagnosis"),
]

MODE_QUESTIONS = {
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

QUICK_QUESTIONS = [
    "Give me a concise personality overview using the Ascendant, Moon and Sun.",
    "What are my strongest planets and which life areas do they support?",
    "What does my chart say about career direction and professional growth?",
    "Explain my current Mahadasha, Antardasha and what they activate.",
    "What does my chart indicate about marriage and partnerships?",
    "Am I going through Sade Sati? Explain its actual dates and meaning without fear.",
]

PROMPT_LIBRARY = {
    "Self & life path": [
        "Describe my core personality using the Ascendant, its lord, Moon and Sun.",
        "Which are my strongest and weakest planets, and what practical difference does that make?",
        "What are the major recurring themes and lessons in my life?",
        "Which yogas are actually present in my chart, and how strongly can they operate?",
        "Give me a balanced overview of my greatest opportunities and main challenges.",
    ],
    "Career & money": [
        "Which career paths suit my chart, and should I prefer employment or independent work?",
        "Explain the condition of my 10th house, 10th lord and D10 career chart.",
        "When are my next favourable periods for career advancement?",
        "What does my chart show about earning, saving and long-term financial stability?",
        "Can my chart support business or entrepreneurship, and what safeguards would matter?",
        "Are speculative gains supported? Give a cautious interpretation, not financial advice.",
    ],
    "Love & marriage": [
        "What relationship patterns are shown by my 7th house, its lord and Venus?",
        "What does my Navamsha (D9) add to the marriage and partnership reading?",
        "Which periods are more supportive for meeting a partner or formal commitment?",
        "What compatibility factors matter most in my chart without making deterministic claims?",
        "Do I have Mangal Dosha? Explain cancellations and avoid fear-based conclusions.",
        "What does my chart suggest about communication and adjustment in relationships?",
    ],
    "Family, home & education": [
        "What does my chart show about education, learning style and higher studies?",
        "Explain my 4th house, home environment and property indications.",
        "What are the indications for children, creativity and mentorship in my chart?",
        "What does the chart show about my relationship with family and emotional security?",
        "Are foreign travel or residence supported, and which houses indicate them?",
    ],
    "Timing & transits": [
        "Explain my full current Mahadasha, Antardasha and Pratyantardasha with exact dates.",
        "What are the next three important dasha changes in my life?",
        "Am I in Sade Sati, Dhaiya or another major Saturn phase? Use exact Moon-based dates.",
        "Which current transits are most relevant to my chart right now?",
        "Give a month-by-month forecast for the next 12 months using dashas and major transits.",
        "Which periods need extra care, and how can I use them constructively without fear?",
    ],
    "Health & inner life": [
        "Describe vitality, stress patterns and helpful routines without diagnosing illness.",
        "What spiritual or contemplative inclinations are shown by my 9th, 12th and Ketu?",
        "How do Moon and the 4th house describe emotional balance and inner security?",
        "What practices or habits would constructively support the weaker themes in my chart?",
        "Explain my chart's karmic symbolism responsibly, without past-life certainty.",
    ],
}

PRECOMPUTE_QUESTIONS = tuple(dict.fromkeys([
    *MODE_QUESTIONS.values(), *QUICK_QUESTIONS,
    *(question for questions in PROMPT_LIBRARY.values() for question in questions),
]))
