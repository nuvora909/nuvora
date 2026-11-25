"""Additional Kundli sections that full-service reports carry: Avakhada chakra, favourable points, numerology,
house-by-house results, Yogini dasha, Varshaphal (annual charts), a month-by-month outlook, nodal transits and
per-planet Ashtakavarga. Each builder returns report_content sections or blocks."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from reportlab.lib.units import mm

from vedic.constants import NAKSHATRAS, SIGN_LORD, SIGNS
from vedic.matching import GANA_BY_NAKSHATRA, NADI_PATTERN, YONI_BY_NAKSHATRA, _varna, _vashya

from . import report_knowledge as K
from . import report_visuals as V
from .report_content import (BUL, CALL, FACTS, FLOW, H, HOUSE_MEANING, LORD_OUTLET, NOTE, P, TABLE, _add_years, _dmy,
                             _dt, _join, _my, chapter, ordinal, pname, section)

NAK_SPAN = 360 / 27
GRAHAS = ["SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN", "RAHU", "KETU"]

# ---------------------------------------------------------------- reference tables

NAMAKSHAR = [
    ("Chu", "Che", "Cho", "La"), ("Li", "Lu", "Le", "Lo"), ("A", "I", "U", "E"), ("O", "Va", "Vi", "Vu"),
    ("Ve", "Vo", "Ka", "Ki"), ("Ku", "Gha", "Nga", "Chha"), ("Ke", "Ko", "Ha", "Hi"), ("Hu", "He", "Ho", "Da"),
    ("Di", "Du", "De", "Do"), ("Ma", "Mi", "Mu", "Me"), ("Mo", "Ta", "Ti", "Tu"), ("Te", "To", "Pa", "Pi"),
    ("Pu", "Sha", "Na", "Tha"), ("Pe", "Po", "Ra", "Ri"), ("Ru", "Re", "Ro", "Taa"), ("Ti", "Tu", "Te", "To"),
    ("Na", "Ni", "Nu", "Ne"), ("No", "Ya", "Yi", "Yu"), ("Ye", "Yo", "Bha", "Bhi"), ("Bhu", "Dha", "Pha", "Dha"),
    ("Bhe", "Bho", "Ja", "Ji"), ("Khi", "Khu", "Khe", "Kho"), ("Ga", "Gi", "Gu", "Ge"), ("Go", "Sa", "Si", "Su"),
    ("Se", "So", "Da", "Di"), ("Du", "Tha", "Jha", "Na"), ("De", "Do", "Cha", "Chi"),
]
PLANET_NUMBER = {"SUN": 1, "MOON": 2, "JUPITER": 3, "RAHU": 4, "MERCURY": 5, "VENUS": 6, "KETU": 7, "SATURN": 8, "MARS": 9}
NUMBER_PLANET = {v: k for k, v in PLANET_NUMBER.items()}
PLANET_DAY = {"SUN": "Sunday", "MOON": "Monday", "MARS": "Tuesday", "MERCURY": "Wednesday", "JUPITER": "Thursday",
              "VENUS": "Friday", "SATURN": "Saturday", "RAHU": "Saturday", "KETU": "Tuesday"}
PLANET_COLOUR = {"SUN": "copper red and orange", "MOON": "white and silver", "MARS": "red and coral",
                 "MERCURY": "green", "JUPITER": "yellow and gold", "VENUS": "white, cream and pastel pink",
                 "SATURN": "dark blue and black", "RAHU": "smoky grey", "KETU": "multicoloured and brown"}
PLANET_METAL = {"SUN": "gold or copper", "MOON": "silver", "MARS": "copper", "MERCURY": "bronze",
                "JUPITER": "gold", "VENUS": "silver or platinum", "SATURN": "iron or steel", "RAHU": "lead",
                "KETU": "mixed metal"}
NATURAL_FRIENDS = {"SUN": ["MOON", "MARS", "JUPITER"], "MOON": ["SUN", "MERCURY"], "MARS": ["SUN", "MOON", "JUPITER"],
                   "MERCURY": ["SUN", "VENUS"], "JUPITER": ["SUN", "MOON", "MARS"], "VENUS": ["MERCURY", "SATURN"],
                   "SATURN": ["MERCURY", "VENUS"]}
NUMBER_TEXT = {
    1: "Sun · leadership, independence and initiative; you do best when you can set the direction.",
    2: "Moon · sensitivity, cooperation and intuition; you work best in partnership and calm surroundings.",
    3: "Jupiter · wisdom, optimism and teaching; you grow by learning and guiding others.",
    4: "Rahu · originality, hard work and unconventional thinking; steady structure turns ideas into results.",
    5: "Mercury · quick thinking, communication and versatility; variety and trade suit you.",
    6: "Venus · harmony, beauty and responsibility to family; art, comfort and service attract you.",
    7: "Ketu · introspection, research and spirituality; you need solitude to think deeply.",
    8: "Saturn · discipline, endurance and ambition; success is slow but lasting.",
    9: "Mars · courage, energy and service; you are a natural fighter for causes and people.",
}
CHALDEAN = {**dict.fromkeys("AIJQY", 1), **dict.fromkeys("BKR", 2), **dict.fromkeys("CGLS", 3),
            **dict.fromkeys("DMT", 4), **dict.fromkeys("EHNX", 5), **dict.fromkeys("UVW", 6),
            **dict.fromkeys("OZ", 7), **dict.fromkeys("FP", 8)}
PAYA = {1: "Gold (Swarna)", 6: "Gold (Swarna)", 11: "Gold (Swarna)", 2: "Silver (Rajat)", 5: "Silver (Rajat)",
        9: "Silver (Rajat)", 3: "Copper (Tamra)", 7: "Copper (Tamra)", 10: "Copper (Tamra)", 4: "Iron (Loha)",
        8: "Iron (Loha)", 12: "Iron (Loha)"}
PAYA_TEXT = {"Gold": "traditionally the most comfortable start: resources and support come easily.",
             "Silver": "traditionally auspicious: steady comfort and good fortune through effort.",
             "Copper": "traditionally mixed: success comes through hard work and perseverance.",
             "Iron": "traditionally the most demanding: early life asks for patience; remedies and effort help."}
# Gochara: houses from the natal Moon in which each transiting planet is classically favourable
GOCHARA_GOOD = {"SUN": {3, 6, 10, 11}, "MARS": {3, 6, 11}, "MERCURY": {2, 4, 6, 8, 10, 11},
                "VENUS": {1, 2, 3, 4, 5, 8, 9, 11, 12}, "JUPITER": {2, 5, 7, 9, 11}, "SATURN": {3, 6, 11},
                "RAHU": {3, 6, 11}, "KETU": {3, 6, 11}}
YOGINI = [("Mangala", "MOON", 1), ("Pingala", "SUN", 2), ("Dhanya", "JUPITER", 3), ("Bhramari", "MARS", 4),
          ("Bhadrika", "MERCURY", 5), ("Ulka", "SATURN", 6), ("Siddha", "VENUS", 7), ("Sankata", "RAHU", 8)]
YOGINI_TEXT = {"Mangala": "auspicious; good news and progress", "Pingala": "mixed; heat, ego and health need care",
               "Dhanya": "prosperous; wealth and wisdom grow", "Bhramari": "restless; travel and effort",
               "Bhadrika": "favourable; friendships, learning and success", "Ulka": "testing; workload and setbacks",
               "Siddha": "very favourable; goals are fulfilled", "Sankata": "difficult; caution and patience"}
MUNTHA_GOOD = {1, 2, 3, 5, 9, 10, 11}
NODE_TEXT = {
    1: "Rahu over the Moon / Ketu 7th: restlessness and new ambitions; keep relationships patient.",
    2: "Rahu 2nd / Ketu 8th: family and money matters fluctuate; guard speech and savings.",
    3: "Rahu 3rd / Ketu 9th: classically favourable — courage, initiative and communication succeed.",
    4: "Rahu 4th / Ketu 10th: home or job changes; keep peace of mind first.",
    5: "Rahu 5th / Ketu 11th: speculation and children need care; creative risk-taking.",
    6: "Rahu 6th / Ketu 12th: classically favourable — you overcome rivals, debts and illness.",
    7: "Rahu 7th / Ketu over the Moon: partnerships are intense; avoid hasty contracts.",
    8: "Rahu 8th / Ketu 2nd: sudden changes; protect health and finances.",
    9: "Rahu 9th / Ketu 3rd: questioning beliefs and mentors; long journeys.",
    10: "Rahu 10th / Ketu 4th: career ambition rises; balance it with home.",
    11: "Rahu 11th / Ketu 5th: classically favourable for gains and networks.",
    12: "Rahu 12th / Ketu 6th: expenses and foreign links; good for retreat and spiritual work.",
}


def _reduce(n: int) -> int:
    while n > 9:
        n = sum(int(d) for d in str(n))
    return n


# ---------------------------------------------------------------- Avakhada, favourable points, numerology

def avakhada_chapter(ctx, brk=True):
    c, r = ctx.c, ctx.r
    moon = ctx.planet("MOON")
    nak = int(c.lon["MOON"] // NAK_SPAN)
    pada = int((c.lon["MOON"] % NAK_SPAN) // (NAK_SPAN / 4))
    paya = PAYA[moon["house"]]
    p = r["panchang"]
    rashi_lord = SIGN_LORD[c.sign["MOON"]]
    syllables = NAMAKSHAR[nak]
    friends = NATURAL_FRIENDS.get(rashi_lord, [])
    friendly_signs = [SIGNS[s] for s in range(12) if SIGN_LORD[s] in friends]
    good_numbers = sorted({PLANET_NUMBER[rashi_lord]} | {PLANET_NUMBER[f] for f in friends})
    gem = K.GEM[rashi_lord]
    blocks = [
        P("The Avakhada chakra is the classical identity card of a horoscope. It is used for naming, matching and "
          "choosing muhurats, and it is read from the Moon's sign and nakshatra at birth."),
        FACTS([("Ascendant", r["lagna"]["sign_name"]), ("Ascendant lord", pname(r["lagna"]["lord"])),
               ("Rashi (Moon sign)", moon["sign_name"]), ("Rashi lord", pname(rashi_lord)),
               ("Nakshatra · pada", f"{NAKSHATRAS[nak]} · {pada + 1}"), ("Nakshatra lord", pname(moon["nakshatra_lord"])),
               ("Varna", _varna(c.sign["MOON"])[0]), ("Vashya", _vashya(c.sign["MOON"], c.deg["MOON"])),
               ("Yoni", YONI_BY_NAKSHATRA[nak]), ("Gana", GANA_BY_NAKSHATRA[nak]), ("Nadi", NADI_PATTERN[nak % 6]),
               ("Tatva (element)", K.SIGN_ELEMENT[c.sign["MOON"]]),
               ("Tithi", f"{p['tithi']['paksha']} {p['tithi']['name']}"), ("Yoga", p["yoga"]["name"]),
               ("Karana", p["karana"]["name"]), ("Paya", paya),
               ("Name syllable", syllables[pada]), ("All syllables of the nakshatra", ", ".join(syllables))]),
        P(f"**Paya {paya.split(' ')[0]}:** the Moon in your {ordinal(moon['house'])} house gives "
          f"{'an' if paya[0] in 'AEIOU' else 'a'} {paya.lower()} paya, {PAYA_TEXT[paya.split(' ')[0]]}"),
        P(f"**Name letter:** names starting with **{syllables[pada]}** match your birth nakshatra pada "
          f"({NAKSHATRAS[nak]} {pada + 1}); the other padas of the nakshatra give {', '.join(s for i, s in enumerate(syllables) if i != pada)}."),
        H("Favourable points"),
        FACTS([("Lucky day", PLANET_DAY[rashi_lord]), ("Lucky numbers", ", ".join(str(n) for n in good_numbers)),
               ("Lucky colours", PLANET_COLOUR[rashi_lord].capitalize()), ("Lucky metal", PLANET_METAL[rashi_lord].capitalize()),
               ("Lucky stone", gem["stone"]), ("Friendly signs", ", ".join(friendly_signs) or "—"),
               ("Good deity", K.RUDRAKSHA[rashi_lord][1]), ("Mantra", K.REMEDY[rashi_lord]["mantra"]),
               ("Fasting day", PLANET_DAY[rashi_lord])]),
        NOTE("Favourable points follow your Moon-sign lord, as in most traditional Kundli formats. The stone listed "
             "here is the Moon-sign stone; see the gemstone report for a recommendation based on your ascendant."),
    ]
    return chapter("Avakhada chakra and favourable points", blocks,
                   "Your horoscope's identity card: varna, yoni, gana, nadi, paya, name letter and lucky factors.", brk=brk)


def numerology_chapter(ctx, brk=False):
    birth = ctx.r["birth"]
    day = int(birth["day"])
    psychic = _reduce(day)
    destiny = _reduce(sum(int(d) for d in f"{birth['day']}{birth['month']}{birth['year']}"))
    name = "".join(ch for ch in (birth.get("name") or "").upper() if ch.isalpha())
    name_number = _reduce(sum(CHALDEAN.get(ch, 0) for ch in name)) if name else None
    rows = [["Psychic (birth day)", str(psychic), pname(NUMBER_PLANET[psychic]), NUMBER_TEXT[psychic]],
            ["Destiny (full date)", str(destiny), pname(NUMBER_PLANET[destiny]), NUMBER_TEXT[destiny]]]
    if name_number:
        rows.append([f"Name ({birth.get('name')})", str(name_number), pname(NUMBER_PLANET[name_number]), NUMBER_TEXT[name_number]])
    harmony = ""
    if name_number:
        friends = set(NATURAL_FRIENDS.get(NUMBER_PLANET[destiny], [])) | {NUMBER_PLANET[destiny]}
        harmony = (f"Your name number {name_number} is in harmony with your destiny number {destiny}."
                   if NUMBER_PLANET[name_number] in friends or name_number == destiny else
                   f"Your name number {name_number} is neutral to your destiny number {destiny}; numerologists "
                   f"sometimes adjust the spelling so the name totals {destiny} or a friendly number.")
    return chapter("Numerology", [
        P("Indian numerology links each number from 1 to 9 to a planet. The psychic number (from your birth day) "
          "describes how you see yourself; the destiny number (from the full date) describes life's direction; the "
          "name number (Chaldean system) describes how others experience you."),
        TABLE(["Number", "Value", "Planet", "Meaning"], rows, [1.3, .5, .7, 3.6], 8),
        P(harmony) if harmony else NOTE("Add a name to the Kundli to calculate the name number."),
        NOTE(f"Lucky dates each month: the {_join([ordinal(d) for d in range(1, 32) if _reduce(d) in (psychic, destiny)][:8])}."),
    ], "Psychic, destiny and name numbers and what they say.", brk=brk)


# ---------------------------------------------------------------- house-by-house results

def bhava_chapter(ctx, brk=True):
    r = ctx.r
    sav = {x["house"]: x["sav"] for x in (r.get("ashtakavarga") or {}).get("sav_by_house", [])}
    blocks = [P("Each house of the chart rules a department of life. Its condition is judged from the sign it "
                "falls in, where its lord sits, which planets occupy and aspect it, and its Ashtakavarga support.")]
    for h in r["houses"]:
        n, lord = h["house"], h["lord"]
        lp = ctx.planet(lord)
        st = ctx.strength(lord).get("score")
        occ = h["occupants"]
        good = (sav.get(n, 28) >= 28) + (lp["house"] in (1, 2, 4, 5, 7, 9, 10, 11)) + ((st or 50) >= 50)
        tone = "Well supported" if good >= 3 else "Supported, with effort" if good == 2 else "Needs care"
        text = (f"With {h['sign_name']} here, your {ordinal(n)} house ({HOUSE_MEANING[n]}) is ruled by "
                f"{pname(lord)}, which sits in your {ordinal(lp['house'])} house in {lp['sign_name']} "
                f"({lp['dignity']['status'].lower()}). This ties {HOUSE_MEANING[n].split(',')[0]} to {LORD_OUTLET[lp['house']]}.")
        if occ:
            text += " " + " ".join(f"{pname(g)} here adds {K.PLANET_NATURE[g].split(',')[0]} to this area." for g in occ)
        if h["aspected_by"]:
            text += f" Aspected by {_join([pname(g) for g in h['aspected_by']])}."
        blocks += [H(f"{ordinal(n)} house · {h['sign_name']} · {tone}"), P(text),
                   NOTE(f"Ashtakavarga support {sav.get(n, '—')} (average 28)" + (f" · lord strength {st:.0f}/100" if st else ""))]
    return chapter("House-by-house results (Bhava phal)", blocks,
                   "All twelve houses read one by one: what each rules and how it is placed in your chart.", brk=brk)


# ---------------------------------------------------------------- Yogini dasha

def yogini_periods(ctx, years=100):
    c = ctx.c
    nak = int(c.lon["MOON"] // NAK_SPAN)
    start_index = (nak + 1 + 3) % 8 - 1  # (nakshatra number + 3) mod 8, 1 = Mangala, 0 = Sankata
    elapsed = (c.lon["MOON"] % NAK_SPAN) / NAK_SPAN
    birth = _dt(ctx.r["birth"]["utc"])
    days = 365.25
    name, lord, yrs = YOGINI[start_index]
    cur = birth - timedelta(days=elapsed * yrs * days)
    out, i = [], start_index
    end_limit = _add_years(birth, years)
    while cur < end_limit:
        name, lord, yrs = YOGINI[i % 8]
        end = cur + timedelta(days=yrs * days)
        out.append({"name": name, "lord": lord, "start": cur, "end": end})
        cur, i = end, i + 1
    return out


def yogini_blocks(ctx):
    periods = yogini_periods(ctx)
    now = ctx.now
    current = next((p for p in periods if p["start"] <= now < p["end"]), None)
    upcoming = [p for p in periods if p["end"] > now][:6]
    blocks = [H("Yogini dasha"),
              P("Yogini dasha is a shorter 36-year cycle of eight periods, each ruled by a Yogini and a planet. "
                "Astrologers use it to confirm what Vimshottari shows: when both systems point the same way, the "
                "timing is stronger.")]
    if current:
        blocks.append(CALL("Running Yogini period", f"**{current['name']} ({pname(current['lord'])})**, "
                           f"{_my(current['start'])} – {_my(current['end'])}: {YOGINI_TEXT[current['name']]}.",
                           "good" if current["name"] in ("Mangala", "Dhanya", "Bhadrika", "Siddha") else
                           "caution" if current["name"] in ("Ulka", "Sankata") else "gold"))
    blocks.append(TABLE(["Yogini", "Planet", "From", "To", "Nature"],
                        [[p["name"], pname(p["lord"]), _dmy(max(p["start"], _dt(ctx.r["birth"]["utc"]))), _dmy(p["end"]),
                          YOGINI_TEXT[p["name"]].capitalize()] for p in upcoming], [.9, .8, 1, 1, 2.4], 8))
    return blocks


# ---------------------------------------------------------------- Varshaphal

def solar_return(ctx, year):
    """UTC moment in `year` when the Sun returns to its natal sidereal longitude."""
    eph = ctx.c.eph
    target = ctx.c.lon["SUN"]
    birth = _dt(ctx.r["birth"]["utc"])
    t = birth.replace(year=year) if not (birth.month == 2 and birth.day == 29) else birth.replace(year=year, day=28)
    for _ in range(8):
        lon = float(eph.sidereal_longitude_series([t], "SUN")[0])
        diff = (target - lon + 180) % 360 - 180
        if abs(diff) < 1e-6:
            break
        t += timedelta(days=diff / 0.9856)
    return t


def annual_chart(ctx, year):
    c = ctx.c
    when = solar_return(ctx, year)
    pos, _ = c.eph.sidereal_positions(when, node=c.options.node)
    asc = c.eph.ascendant_at(when, c.birth.lat, c.birth.lon)
    lagna = int(asc // 30)
    signs = {g: int(pos[g]["lon"] // 30) for g in GRAHAS}
    houses = {g: (s - lagna) % 12 + 1 for g, s in signs.items()}
    age = year - _dt(ctx.r["birth"]["utc"]).year
    muntha = (c.lagna_sign + age) % 12
    return {"when": when, "lagna": lagna, "signs": signs, "houses": houses, "age": age, "muntha": muntha,
            "muntha_house": (muntha - lagna) % 12 + 1, "retro": [g for g in GRAHAS[:7] if pos[g].get("speed", 1) < 0]}


def varshaphal_chapter(ctx, count, brk=True):
    birth = _dt(ctx.r["birth"]["utc"])
    first_year = ctx.now.year if solar_return(ctx, ctx.now.year) <= ctx.now else ctx.now.year - 1
    blocks = [P("Varshaphal (Tajik annual horoscope) casts a fresh chart for the moment the Sun returns to its exact "
                "birth position each year, at your birthplace. The annual ascendant, the Muntha (your progressed "
                "ascendant, moving one sign a year) and the placement of Jupiter and Saturn describe the year ahead.")]
    for i in range(count):
        a = annual_chart(ctx, first_year + i)
        placements = {}
        for g, h in a["houses"].items():
            placements.setdefault(h, []).append(V.ABBR[g])
        chart = V.KundliChart(a["lagna"], placements, f"Varsha {a['when']:%Y}–{a['when'].year + 1}", 62 * mm,
                              [V.ABBR[g] for g in a["retro"]])
        lagna_lord = SIGN_LORD[a["lagna"]]
        ll_house = a["houses"][lagna_lord]
        muntha_ok = a["muntha_house"] in MUNTHA_GOOD
        jup, sat = a["houses"]["JUPITER"], a["houses"]["SATURN"]
        right = [
            f"**Year begins:** {a['when'].astimezone(ctx.tz):%d %b %Y, %I:%M %p}".replace(" 0", " "),
            f"**Age completed:** {a['age']}",
            f"**Annual ascendant:** {SIGNS[a['lagna']]} — lord {pname(lagna_lord)} in the {ordinal(ll_house)} house, "
            f"putting the year's focus on {HOUSE_MEANING[ll_house]}.",
            f"**Muntha:** {SIGNS[a['muntha']]} in the {ordinal(a['muntha_house'])} house — "
            + ("classically favourable for progress and recognition." if muntha_ok else
               "classically a year to move carefully in " + HOUSE_MEANING[a['muntha_house']].split(',')[0] + "."),
            f"**Jupiter** in the {ordinal(jup)} house supports {HOUSE_MEANING[jup].split(',')[0]}; "
            f"**Saturn** in the {ordinal(sat)} asks for discipline in {HOUSE_MEANING[sat].split(',')[0]}.",
        ]
        blocks += [H(f"Varshaphal {a['when']:%Y}–{a['when'].year + 1}"),
                   {"t": "duo", "left": chart, "right": right},
                   CALL("Theme of the year", ("A year of progress: " if muntha_ok else "A year for consolidation: ")
                        + f"{HOUSE_MEANING[ll_house].split(',')[0]} and {HOUSE_MEANING[a['muntha_house']].split(',')[0]} lead.",
                        "good" if muntha_ok else "gold")]
    blocks.append(NOTE("Year lord (Varsheshwara) selection and Tajik yogas are not computed; the Muntha lord and annual "
                       "ascendant lord are read instead."))
    return chapter("Varshaphal: your annual charts", blocks,
                   f"{count} solar-return chart{'s' if count > 1 else ''}, one for each year from your last birthday.", brk=brk)


# ---------------------------------------------------------------- month by month

def monthly_chapter(ctx, months=12, brk=True):
    c = ctx.c
    rows, blocks = [], []
    start = ctx.now.replace(day=1, hour=12, minute=0, second=0, microsecond=0)
    for i in range(months):
        m0 = (start + timedelta(days=32 * i)).replace(day=1)
        mid = m0 + timedelta(days=14)
        houses = {g: ctx.from_moon(ctx.sign_at(g, mid)) for g in ("SUN", "MARS", "MERCURY", "VENUS", "JUPITER", "SATURN")}
        good = [g for g, h in houses.items() if h in GOCHARA_GOOD[g]]
        hard = [g for g, h in houses.items() if h not in GOCHARA_GOOD[g]]
        score = len(good) - len(hard) + (1 if "JUPITER" in good else 0)
        pd = c.dasha.between(m0, m0 + timedelta(days=28), depth=3)
        pd_label = " → ".join(dict.fromkeys("–".join(pname(x) for x in p.lords[1:]) for p in pd)) if pd else "—"
        mood = "Favourable" if score >= 2 else "Mixed" if score >= -1 else "Careful"
        best = next((g for g in ("JUPITER", "VENUS", "MERCURY", "SUN", "MARS", "SATURN") if g in good), None)
        focus = (f"{pname(best)} {ordinal(houses[best])} from the Moon helps {HOUSE_MEANING[houses[best]].split(',')[0]}"
                 if best else "slow down and consolidate")
        caution = next((f"{pname(g)} {ordinal(houses[g])} — go easy on {HOUSE_MEANING[houses[g]].split(',')[0]}"
                        for g in ("SATURN", "MARS", "SUN") if g in hard), "no major friction")
        rows.append([f"{m0:%b %Y}", pd_label, mood, focus, caution])
    blocks += [P("A month-by-month guide from the running sub-sub-periods (pratyantardasha) and the transits of the "
                 "Sun, Mars, Mercury, Venus, Jupiter and Saturn counted from your Moon (gochara). Fast planets change "
                 "the mood of each month inside the longer trends described in the year-by-year chapter."),
               TABLE(["Month", "Antar–pratyantar", "Overall", "Best use", "Go easy on"], rows, [.75, 1.45, .7, 1.8, 1.7], 7.4,
                     highlight=[(i, 2, "good" if r[2] == "Favourable" else "gold" if r[2] == "Mixed" else "caution")
                                for i, r in enumerate(rows)]),
               NOTE("Gochara rule used: favourable houses from the Moon — Sun 3/6/10/11, Mars 3/6/11, Mercury 2/4/6/8/10/11, "
                    "Venus all but 6/7/10, Jupiter 2/5/7/9/11, Saturn 3/6/11. Vedha (obstruction) is not applied.")]
    return chapter("Month by month", blocks, f"The next {months} months at a glance.", brk=brk)


def node_transit_text(ctx, when):
    h = ctx.from_moon(ctx.sign_at("RAHU", when))
    return SIGNS[ctx.sign_at("RAHU", when)], h, NODE_TEXT[h]


# ---------------------------------------------------------------- Ashtakavarga tables

def bav_blocks(ctx):
    av = ctx.r.get("ashtakavarga") or {}
    bav, sav = av.get("bav_by_sign") or {}, av.get("sav_by_sign")
    if not bav:
        return []
    lagna = ctx.c.lagna_sign
    order = [(lagna + i) % 12 for i in range(12)]
    rows = [[pname(g)] + [str(bav[g][s]) for s in order] + [str(sum(bav[g]))] for g in bav]
    if sav:
        rows.append(["**Total (SAV)**"] + [str(sav[s]) for s in order] + [str(sum(sav))])
    head = ["Planet"] + [f"H{i + 1} {SIGNS[s][:3]}" for i, s in enumerate(order)] + ["Total"]
    return [H("Bhinnashtakavarga (points from each planet)"),
            P("Each planet gives 0–8 points to every sign. A transiting planet does well in signs where it has 4 or "
              "more of its own points; the total row is the Sarvashtakavarga used elsewhere in this report."),
            TABLE(head, rows, [1.1] + [.55] * 12 + [.7], 6.6)]
