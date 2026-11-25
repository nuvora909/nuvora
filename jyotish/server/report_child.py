"""Child Kundli: temperament, name letters, birth doshas with Gandmool shanti dates, childhood dashas,
learning and health indications, sanskar muhurats (Namkaran, Annaprashan, Mundan, Vidyarambh) and parenting
guidance. Written about the child in the third person, for the parents."""
from __future__ import annotations

from datetime import timedelta

from chat.judgment import HEALTH_LEAN, LEAN_WORDS
from vedic.constants import NAKSHATRAS
from vedic.panchang import nakshatra_info, tithi_info

from . import report_extras as X
from . import report_knowledge as K
from . import report_visuals as V
from .report_content import (BUL, CALL, FACTS, H, LEAN_TONE, NOTE, P, TABLE, _add_years, _chart_chapter, _cover,
                             _dmy, _dt, _join, _remedies_chapter, cap, chapter, ordinal, sentence)

NAK_SPAN = 360 / 27
GANDMOOL = {"Ashwini": 1, "Ashlesha": 4, "Magha": 1, "Jyeshtha": 4, "Mula": 1, "Revati": 4}  # junction pada
SANSKAR_NAKSHATRAS = {"Ashwini", "Rohini", "Mrigashira", "Punarvasu", "Pushya", "Uttara Phalguni", "Hasta", "Chitra",
                      "Swati", "Anuradha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
                      "Uttara Bhadrapada", "Revati"}
RIKTA = {"Chaturthi", "Navami", "Chaturdashi"}
CHILD_PLANET = {
    "SUN": "confidence, health of the body and the bond with the father",
    "MOON": "emotional security, sleep, appetite and the bond with the mother",
    "MARS": "energy, sport and courage — and a few more bumps and scrapes",
    "MERCURY": "speech, reading, numbers and early school learning",
    "JUPITER": "learning, values, good teachers and steady growth",
    "VENUS": "arts, music, friendships and comfort",
    "SATURN": "discipline and routine; growth is steady rather than fast, so patience pays",
    "RAHU": "curiosity and unusual interests, with some restlessness; screen time needs limits",
    "KETU": "an inward, intuitive phase; the child may need extra reassurance",
}
ELEMENT_GUIDANCE = {
    "Fire": ["Give plenty of physical activity and real challenges.", "Praise effort and courage, not only results.",
             "Help them cool down before talking about a conflict.", "Let them lead small projects at home."],
    "Earth": ["Keep a steady routine for meals, study and sleep.", "Teach through hands-on, practical activities.",
              "Give them time; they dislike being rushed.", "Reward patience and completed tasks."],
    "Air": ["Explain the reasons behind rules; they learn by understanding.", "Encourage questions, reading and conversation.",
            "Offer variety and friends to learn with.", "Help them finish what they start."],
    "Water": ["Create emotional safety: a gentle tone and calm home.", "Give creative outlets such as music, art and stories.",
              "Reassure them before changes such as a new school.", "Protect sleep; they absorb the mood around them."],
}
CHILD_MOON = [(a, b) for a, b in (("You need", "Your child needs"), ("You feel", "Your child feels"),
                                  ("your loyalty", "their loyalty"), ("allow yourself", "allow them"),
                                  ("You ", "Your child "), (" you ", " they "))]


def _child_moon_text(sign):
    text = K.MOON_TEXT[sign]
    for a, b in CHILD_MOON:
        text = text.replace(a, b)
    return text


def _moon_nak_on(ctx, when):
    return NAKSHATRAS[int(float(ctx.c.eph.sidereal_longitude_series([when], "MOON")[0]) // NAK_SPAN)]


def _gandmool_dates(ctx, nak_name):
    """The 27th-day Gandmool shanti date (Moon back in the birth nakshatra) and, if past, the next one."""
    birth = _dt(ctx.r["birth"]["utc"])
    first = next((birth + timedelta(days=d) for d in range(24, 31)
                  if _moon_nak_on(ctx, birth + timedelta(days=d)) == nak_name), None)
    upcoming = None
    if first and first < ctx.now:
        upcoming = next((ctx.now + timedelta(days=d) for d in range(0, 30)
                         if _moon_nak_on(ctx, ctx.now + timedelta(days=d)) == nak_name), None)
    return first, upcoming


def _sanskar_dates(ctx, start, end, limit=4):
    c = ctx.c
    day = max(start, ctx.now).astimezone(ctx.tz).replace(hour=7, minute=0, second=0, microsecond=0)
    out = []
    while day <= end and len(out) < limit:
        if day.weekday() in (0, 2, 3, 4):
            pos, _ = c.eph.sidereal_positions(day, node=c.options.node)
            tithi = tithi_info(pos["SUN"]["lon"], pos["MOON"]["lon"])
            nak = nakshatra_info(pos["MOON"]["lon"])
            if tithi["name"] not in RIKTA and tithi["name"] != "Amavasya" and nak["name"] in SANSKAR_NAKSHATRAS:
                out.append([f"{day:%d %b %Y}".lstrip("0"), day.strftime("%A"), f"{tithi['paksha']} {tithi['name']}",
                            nak["name"]])
        day += timedelta(days=1)
    return out


def _birth_doshas(ctx):
    c, r = ctx.c, ctx.r
    p = r["panchang"]
    moon = ctx.planet("MOON")
    nak = moon["nakshatra"]
    found, blocks = [], []
    if nak in GANDMOOL:
        junction = moon["pada"] == GANDMOOL[nak]
        found.append("Gandmool")
        first, upcoming = _gandmool_dates(ctx, nak)
        when = (f"The traditional shanti day, when the Moon first returns to {nak}, "
                f"{'was' if first < ctx.now else 'is'} {_dmy(first)}." if first else "")
        if upcoming:
            when += f" If it was missed, the next suitable day is {_dmy(upcoming)}; it recurs every lunar month."
        blocks += [H("Gandmool (Moola) nakshatra"),
                   CALL("Present", [f"**The Moon is in {nak}, pada {moon['pada']}**, one of the six Gandmool "
                                    f"nakshatras at the junction of a water and a fire sign."
                                    + (" This pada sits right at the junction, which tradition treats as the more significant case." if junction else
                                       " This pada is away from the exact junction, so tradition treats it as milder."),
                                    "The customary response is a Gandmool Shanti puja. It is a blessing ritual, not a "
                                    "sign of harm to the child or the family.", when], "gold", "Shanti advised")]
    else:
        blocks += [H("Gandmool (Moola) nakshatra"),
                   CALL("Not present", f"The Moon is in {nak}, which is not a Gandmool nakshatra. No shanti is needed.", "good", "Clear")]
    checks = [
        ("Amavasya (new Moon) birth", p["tithi"]["name"] == "Amavasya"),
        ("Krishna Chaturdashi birth", p["tithi"]["paksha"] == "Krishna" and p["tithi"]["name"] == "Chaturdashi"),
        ("Vishti (Bhadra) karana", p["karana"]["name"] == "Vishti"),
        ("Vyatipata or Vaidhriti yoga", p["yoga"]["name"] in ("Vyatipata", "Vaidhriti")),
    ]
    rows = [[name, "Present" if hit else "Not present"] for name, hit in checks]
    found += [name for name, hit in checks if hit]
    blocks += [H("Panchang doshas at birth"),
               P("Tradition also checks the lunar day, karana and yoga at the moment of birth. A positive result is "
                 "usually answered with a simple shanti or charity on the child's behalf."),
               TABLE(["Check", "Result"], rows, [3, 1.2], 8.6,
                     highlight=[(i, 1, "caution" if hit else "good") for i, (_, hit) in enumerate(checks)]),
               FACTS([("Tithi", f"{p['tithi']['paksha']} {p['tithi']['name']}"), ("Karana", p["karana"]["name"]),
                      ("Yoga", p["yoga"]["name"])])]
    return found, blocks


def _child_topic(ctx, key, title):
    j = ctx.j(key)
    tone, badge = LEAN_TONE.get(j.lean, ("info", j.lean.title()))
    lean = (HEALTH_LEAN if key == "health" else LEAN_WORDS).get(j.lean, j.lean_text)
    out = [H(title), CALL("Indication", [f"**{cap(lean)}.**", sentence(j.theme)], tone, badge),
           BUL([sentence(f.text) for f in j.drivers[:3]] + [f"Tempered by: {sentence(f.text)}" for f in j.counterweights[:2]])]
    if j.varga:
        out.append(NOTE(sentence(j.varga["text"])))
    return out


def _childhood_dashas(ctx):
    birth = _dt(ctx.r["birth"]["utc"])
    limit = _add_years(birth, 25)
    periods = [m for m in ctx.r["dasha"]["mahadashas"] if _dt(m["end"]) > birth and _dt(m["start"]) < limit]
    rows, bars = [], []
    for m in periods:
        s, e = max(_dt(m["start"]), birth), min(_dt(m["end"]), limit)
        g = m["lords"][0]
        rows.append([m["label"], f"{(s - birth).days // 365}–{(e - birth).days // 365}", _dmy(s), _dmy(_dt(m["end"])),
                     cap(CHILD_PLANET[g])])
        bars.append((m["label"], s, e, "gold" if _dt(m["start"]) <= ctx.now < _dt(m["end"]) else "info"))
    return [P("The Vimshottari dasha periods of childhood and youth show which themes are in the foreground as the "
              "child grows. They describe emphasis, not fixed events."),
            {"t": "flow", "obj": V.Timeline(bars, birth, limit, ctx.now), "after": 3},
            TABLE(["Period", "Age", "From", "To", "What it brings for a child"], rows, [.9, .6, 1, 1, 3], 7.8)]


def build(ctx, item):
    c, r = ctx.c, ctx.r
    moon, lagna = ctx.planet("MOON"), r["lagna"]
    nak_i = int(c.lon["MOON"] // NAK_SPAN)
    pada = moon["pada"]
    syllables = X.NAMAKSHAR[nak_i]
    doshas, dosha_blocks = _birth_doshas(ctx)
    element = K.SIGN_ELEMENT[c.sign["MOON"]]
    summary = [f"**Name letter: {syllables[pada - 1]}** ({moon['nakshatra']} pada {pada}).",
               f"**Birth doshas:** {_join(doshas) if doshas else 'none found'}.",
               f"**Paya:** {X.PAYA[moon['house']]}."]
    sections = [_cover(ctx, "Your child's chart in brief", summary, [CALL("How to read this report", [
        "This report is written for parents. It describes the child's temperament, the letters traditionally "
        "used for naming, any birth doshas with their customary remedies, and auspicious dates for the early "
        "sanskaras. A chart shows tendencies; a child's character is shaped above all by love, care and upbringing."],
        "neutral")])]
    sections.append(_chart_chapter(ctx, title="Your child's birth chart"))
    sections.append(chapter("Temperament and nature", [
        P(f"**Ascendant {lagna['sign_name']}:** {K.LAGNA_TEXT[lagna['sign']]}"),
        P(f"**Moon in {moon['sign_name']}:** {_child_moon_text(c.sign['MOON'])}"),
        P(f"**Birth nakshatra {moon['nakshatra']}:** {K.NAKSHATRA_TEXT.get(moon['nakshatra'], '')}"),
        H("Raising this child"),
        P(f"With a {element.lower()} Moon, this child responds best to:"), BUL(ELEMENT_GUIDANCE[element]),
    ], "The ascendant, Moon and nakshatra, read for a growing child."))
    sections.append(chapter("Name letters (Namakshar)", [
        CALL("Recommended first letter", [f"**{syllables[pada - 1]}** — from {moon['nakshatra']} pada {pada}.",
             f"The other padas of {moon['nakshatra']} give {', '.join(s for i, s in enumerate(syllables) if i != pada - 1)}; "
             f"families sometimes use these too."], "good", syllables[pada - 1]),
        P("In the Vedic naming tradition the child's name begins with the syllable of the Moon's nakshatra pada at "
          "birth. The name number can also be checked so it harmonises with the birth date."),
        TABLE(["Pada", "Syllable"], [[f"{moon['nakshatra']} {i + 1}", s + ("  ← birth pada" if i == pada - 1 else "")]
                                     for i, s in enumerate(syllables)], [2, 2], 8.6),
    ], "The traditional first syllable for the child's name.", brk=False, sample=True))
    sections.append(X.avakhada_chapter(ctx, brk=True))
    sections.append(chapter("Birth doshas and remedies", dosha_blocks,
                            "Gandmool nakshatra and the panchang checks made at every birth."))
    sections.append(chapter("Learning, health and aptitude", _child_topic(ctx, "education", "Learning and education")
                            + _child_topic(ctx, "health", "Health and vitality")
                            + _child_topic(ctx, "career", "Natural aptitude (future career)")
                            + [NOTE("Health indications are traditional and general. Follow your paediatrician's advice.")],
                            "What the chart suggests about study, constitution and talents."))
    sections.append(chapter("Planetary periods of childhood", _childhood_dashas(ctx),
                            "The dasha periods from birth to age 25."))
    birth = _dt(r["birth"]["utc"])
    ceremonies = [
        ("Namkaran (naming)", birth + timedelta(days=10), birth + timedelta(days=45),
         "Traditionally on the 11th or 12th day after birth, or within the first month and a half."),
        ("Annaprashan (first rice)", birth + timedelta(days=150), birth + timedelta(days=240),
         "In the 6th or 8th month for boys and the 5th or 7th month for girls."),
        ("Mundan (first haircut)", _add_years(birth, 1), _add_years(birth, 3),
         "In an odd year of age: commonly the 1st or 3rd year."),
        ("Vidyarambh (start of learning)", _add_years(birth, 4), _add_years(birth, 5) + timedelta(days=60),
         "Around the 5th year, often on Vasant Panchami or Vijayadashami."),
    ]
    sblocks = [P("Dates below fall inside each ceremony's traditional window and pass common muhurat filters: a "
                 "Monday, Wednesday, Thursday or Friday; no Rikta tithi (4th, 9th, 14th) or Amavasya; and one of the "
                 "nakshatras recommended for sanskaras. Your family priest fixes the exact time.")]
    gender = str(r["birth"].get("gender") or "").lower()
    for name, start, end, rule in ceremonies:
        group = [H(name), NOTE(rule)]
        if name.startswith("Annaprashan"):
            months = [(5, "girls"), (6, "boys"), (7, "girls"), (8, "boys")]
            if gender in ("male", "boy", "m"):
                months = [m for m in months if m[1] == "boys"]
            elif gender in ("female", "girl", "f"):
                months = [m for m in months if m[1] == "girls"]
            rows = []
            for n, who in months:
                found = _sanskar_dates(ctx, birth + timedelta(days=30 * (n - 1)), birth + timedelta(days=30 * n), 2)
                rows += [[f"{ordinal(n)} month ({who})"] + row for row in found]
            table = TABLE(["Month", "Date", "Weekday", "Tithi", "Nakshatra"], rows, [1.2, 1, .9, 1.3, 1.3], 8.2)
        else:
            rows = _sanskar_dates(ctx, start, end)
            table = TABLE(["Date", "Weekday", "Tithi", "Nakshatra"], rows, [1, 1, 1.4, 1.4], 8.4)
        if end < ctx.now:
            group.append(P("This ceremony's traditional window has already passed."))
        elif rows:
            group.append(table)
        else:
            group.append(P("No date in the window passes every filter; ask your priest to widen the search."))
        sblocks.append({"t": "keep", "blocks": group})
    sections.append(chapter("Sanskar muhurats", sblocks, "Auspicious dates for the early childhood ceremonies."))
    gentle = [("MOON", "Emotional security and sleep"), (moon["nakshatra_lord"], "Lord of the birth nakshatra")]
    sections.append(_remedies_chapter(ctx, gentle, "Gentle remedies for the child", brk=True))
    sections[-1]["blocks"].insert(0, NOTE("For young children, parents perform the remedies on the child's behalf. "
                                          "Gemstones are not traditionally given to young children."))
    return item["name"], "Temperament, name letters, birth doshas, childhood dashas and sanskar muhurats", sections
