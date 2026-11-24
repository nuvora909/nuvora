"""Deterministic, chart-linked content for core and standalone PDF reports."""
from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone

from vedic.constants import EXALTATION, OWN_SIGNS, SIGN_LORD, SIGNS
from vedic.events import TOPICS, event_windows
from vedic.matching import match_charts
from vedic.panchang import nakshatra_info, tithi_info
from vedic.timing import activation_windows

from .report_products import PRODUCTS


def section(title, paragraphs=None, bullets=None, table=None):
    return {"title": title, "paragraphs": paragraphs or [], "bullets": bullets or [], "table": table}


def _reader_guide(kind):
    """Plain-language orientation shared by every on-demand PDF report."""
    paragraphs = [
        "This report combines calculated chart details with a traditional Vedic interpretation. Read the indicators together: each one is a symbolic lens, not a guaranteed event or a substitute for real-world evidence.",
        "Where this report shows a confidence label, it describes how consistently the selected chart indicators point in the same direction; it is not the probability that an event will happen. Birth-time-sensitive divisional charts should be treated as secondary checks.",
    ]
    additions = {
        "life": "The yearly outlook covers career, relationships, wealth, education, property and general themes. A dasha window marks a topic for attention or planning; it does not promise a specific result. Check decisions against your actual opportunities, resources and responsibilities.",
        "sade_sati": "Sade Sati here means Saturn's calculated transit through the signs before, with, and after the natal Moon sign. The phases are a timing framework, not a prediction that hardship must occur.",
        "dosha": "Dosha results follow the explicit rules shown in this report. Traditions may use different rules; a listed result does not prove a curse, harm, or fixed fate.",
        "match": "The compatibility score summarizes one traditional matching method. It cannot measure the full quality of a relationship or replace conversations about values, consent, safety, finances and shared plans.",
        "marriage": "Timing windows identify periods of chart activation, not a guaranteed marriage date. Candidate ceremony dates need the actual location, family tradition and an experienced human muhurat review.",
        "gemstone": "The suggested item is a traditional association, not a necessity, treatment or guaranteed remedy. Check suitability, cost and sourcing independently; do not substitute it for professional care.",
        "rudraksha": "The suggestion is a traditional association, not a necessity or guaranteed remedy. Choose only if it is meaningful to you and practical for your circumstances.",
        "core": "Use the chart tables as the evidence layer: placements are calculated from the supplied birth record, while interpretations remain contextual and can change when birth-time accuracy is limited.",
    }
    paragraphs.append(additions.get(kind, additions["core"]))
    return section("How to read this report", paragraphs)


def _date(value):
    return str(value or "")[:10]


def _birth_section(report):
    birth = report["birth"]
    local_raw = str(birth["local"])
    try:
        local_dt = datetime.fromisoformat(local_raw.replace("Z", "+00:00"))
        local = local_dt.strftime("%d %b %Y, %I:%M %p").lstrip("0")
    except ValueError:
        local = local_raw.replace("T", " ")
    return section("Birth details", [
        f"Name: {birth.get('name') or 'Not supplied'}",
        f"Birth: {local} (local time) · {birth.get('tz_name') or 'UTC offset ' + str(birth.get('utc_offset_hours'))}",
        f"Place: {birth.get('place') or 'Not supplied'} · {birth['lat']:.4f}, {birth['lon']:.4f}",
        "Calculated with sidereal zodiac, Lahiri ayanamsa and whole-sign houses. Times and dates depend on the supplied birth record.",
    ])


def _identity_section(report):
    lagna, moon = report["lagna"], report["planets"]["MOON"]
    p = report["panchang"]
    return section("Lagna, Rashi and birth Nakshatra", [
        f"Lagna: {lagna['sign_name']} {lagna['dms']}; lord {lagna['lord'].title()}.",
        f"Moon Rashi: {moon['sign_name']}; birth Nakshatra: {moon['nakshatra']}, pada {moon['pada']}.",
        "Lagna describes the chart's embodied direction, the Moon sign its emotional frame, and the birth Nakshatra the starting point of Vimshottari dasha. These are interpretive frames, not fixed personality verdicts.",
    ], table={"headers": ["Panchang limb", "Value"], "rows": [
        ["Tithi", f"{p['tithi']['paksha']} {p['tithi']['name']}"], ["Vara", p["vara"]["name"]],
        ["Nakshatra", f"{p['nakshatra']['name']}, pada {p['nakshatra']['pada']}"],
        ["Yoga", p["yoga"]["name"]], ["Karana", p["karana"]["name"]],
        ["Sunrise", p.get("sunrise") or "Not available"], ["Sunset", p.get("sunset") or "Not available"],
    ], "widths": [1, 2.4]})


def _planet_section(report):
    rows = []
    for name, p in report["planets"].items():
        rows.append([name.title(), p["sign_name"], p["dms"], str(p["house"]), f"{p['nakshatra']} · {p['pada']}",
                     p["dignity"]["status"] + (" · R" if p["retrograde"] else "")])
    return section("Planetary positions", ["Exact sidereal longitudes, whole-sign houses, lunar mansions and dignity at birth."],
                   table={"headers": ["Graha", "Sign", "Degree", "House", "Nakshatra / pada", "Dignity"], "rows": rows,
                          "widths": [.75, .9, .8, .48, 1.45, 1.25]})


def _house_section(report):
    rows = [[str(h["house"]), h["sign_name"], h["lord"].title(), ", ".join(x.title() for x in h["occupants"]) or "—",
             ", ".join(x.title() for x in h["aspected_by"]) or "—"] for h in report["houses"]]
    return section("Houses and chart exploration", table={"headers": ["House", "Sign", "Lord", "Occupants", "Aspected by"], "rows": rows,
                                                               "widths": [.5, 1, .8, 1.6, 1.6]})


def _varga_section(report):
    rows = []
    for key, v in report["vargas"].items():
        planets = "; ".join(f"{g.title()[:2]} {p['sign_name'][:3]}" for g, p in v["planets"].items())
        rows.append([key, v["domain"], v["lagna"]["sign_name"], planets])
    return section("Important divisional charts", ["Each row is calculated independently from the same birth record; divisional factors are more birth-time sensitive than D1."],
                   table={"headers": ["Varga", "Domain", "Lagna", "Planet signs (Su Mo Ma Me Ju Ve Sa Ra Ke)"], "rows": rows,
                          "widths": [.42, 1.45, .65, 3.5], "font_size": 6.5})


def _dasha_section(report, years=None):
    now = datetime.now(timezone.utc)
    end_limit = now + timedelta(days=365.25 * years) if years else None
    running = " → ".join(p["label"] for p in report["dasha"]["running_now"])
    rows = []
    for maha in report["dasha"]["mahadashas"]:
        if years and (_date(maha["end"]) < _date(now) or _date(maha["start"]) > _date(end_limit)):
            continue
        if years:
            for antar in maha["antardashas"]:
                if _date(antar["end"]) >= _date(now) and _date(antar["start"]) <= _date(end_limit):
                    rows.append([antar["label"], _date(antar["start"]), _date(antar["end"]), "Antardasha"])
        else:
            rows.append([maha["label"], _date(maha["start"]), _date(maha["end"]), "Mahadasha"])
    label = f"Vimshottari dasha · {years}-year horizon" if years else "Vimshottari dasha"
    return section(label, [f"Running now: {running}.", "Periods describe symbolic activation timing; they do not guarantee an event."],
                   table={"headers": ["Period", "Start", "End", "Level"], "rows": rows, "widths": [1.7, 1, 1, 1]})


def _transit_section(report):
    transits = report.get("transits") or {}
    rows = [[g.title(), p["sign_name"], f"{p['degree']:.2f}°", str(p["house_from_lagna"]), str(p["house_from_moon"]),
             "Yes" if p["retrograde"] else "No"] for g, p in transits.get("positions", {}).items()]
    ss = transits.get("sade_sati", {})
    return section("Current transits and Sade Sati", [
        f"Transit snapshot: {transits.get('at', 'not calculated')}.",
        f"Sade Sati: {'active · ' + str(ss.get('phase')) if ss.get('active') else 'not active'}. Saturn is house {ss.get('saturn_house_from_moon', '—')} from natal Moon.",
    ], table={"headers": ["Graha", "Sign", "Degree", "From Lagna", "From Moon", "Retrograde"], "rows": rows,
              "widths": [.9, 1.2, .8, .9, .9, .9]})


def _premium_sections(report):
    out = []
    strengths = report.get("planet_strength") or {}
    if strengths:
        out.append(section("Planetary strength", ["Transparent heuristic scores, not classical Shadbala."],
                           table={"headers": ["Planet", "Score", "Label", "Evidence"], "rows": [
                               [g.title(), f"{v['score']:.1f}/100", v["label"], "; ".join(v["factors"])] for g, v in strengths.items()
                           ], "widths": [.7, .65, .65, 4], "font_size": 7}))
    yogas = report.get("yogas") or []
    if yogas:
        for yoga in yogas:
            impact = yoga.get("impact") or {}
            activation = impact.get("activation") or {}
            condition = impact.get("condition") or {}
            paragraphs = [yoga.get("rule", ""), impact.get("summary", "")]
            bullets = list(yoga.get("evidence") or [])
            if activation:
                bullets.append(f"Dasha activation: {activation.get('label')} — {activation.get('reason')}")
            if condition:
                bullets.append(f"Participant condition: {condition.get('label')} — {condition.get('summary')}")
            if impact.get("combined_effect"):
                paragraphs.append(impact["combined_effect"])
            out.append(section(f"Yoga · {yoga['name']} · {'present' if yoga.get('present') else 'not present'}", paragraphs, bullets))
        analysis = report.get("yoga_analysis") or {}
        if analysis:
            out.insert(1, section("Combined yoga interpretation", [analysis.get("headline", ""), analysis.get("summary", ""), analysis.get("note", "")],
                                  list(analysis.get("active_now") or [])))
    av = report.get("ashtakavarga") or {}
    if av:
        out.append(section("Ashtakavarga", ["Sarvashtakavarga bindus by house; use as one contextual factor, not a standalone verdict."],
                           table={"headers": ["House", "Sign", "SAV"], "rows": [[str(x["house"]), x["sign_name"], str(x["sav"])] for x in av.get("sav_by_house", [])],
                                  "widths": [1, 2, 1]}))
    if report.get("sensitivity"):
        guidance = report.get("birth_time_guidance") or {}
        out.append(section("Birth-time sensitivity", [guidance.get("summary", "")], list(guidance.get("recommendations") or [])))
    return out


def _dosha(c, report):
    yogas = {y["name"]: y for y in report.get("yogas", [])}
    manglik = yogas.get("Manglik (Kuja) Dosha", {})
    kaal = yogas.get("Kaal Sarp Yoga", {})
    node_sun = c.sign["SUN"] in (c.sign["RAHU"], c.sign["KETU"])
    ninth_node = any(c.house[n] == 9 for n in ("RAHU", "KETU"))
    ninth_lord = c.house_lord[9]
    lord_node = ninth_lord in ("RAHU", "KETU") or any(c.sign[ninth_lord] == c.sign[n] for n in ("RAHU", "KETU"))
    pitru_evidence = []
    if node_sun:
        pitru_evidence.append("Sun conjoins Rahu or Ketu by sign")
    if ninth_node:
        pitru_evidence.append("Rahu or Ketu occupies the 9th house")
    if lord_node:
        pitru_evidence.append(f"9th lord {ninth_lord.title()} is a node or conjoins one by sign")
    cancellations = []
    if manglik.get("present"):
        if c.sign["MARS"] in OWN_SIGNS["MARS"] or c.sign["MARS"] == EXALTATION["MARS"][0]:
            cancellations.append("Mars is in own or exaltation sign; listed as a traditional mitigating condition, not an automatic erasure.")
        if c.aspects("JUPITER", c.house["MARS"]) or c.aspects("JUPITER", 7):
            cancellations.append("Jupiter aspects Mars or the 7th house; listed as a traditional mitigating condition.")
    entries = [
        section("Manglik (Kuja) Dosha", [manglik.get("rule", "Manglik rule unavailable"),
            f"Result: {'present' if manglik.get('present') else 'not present'}; severity {manglik.get('severity', 'none')}.",
            "This is a traditional relationship indicator, not a prediction of marital harm."], list(manglik.get("evidence") or []) + cancellations),
        section("Pitru Dosha · transparent screening", [
            f"Screen result: {'one or more selected indicators are present' if pitru_evidence else 'none of this report’s selected indicators are present'}.",
            "Rule used: Sun-node conjunction, a node in the 9th, or the 9th lord joined to a node. Traditions disagree on Pitru Dosha; this screen is not a claim about ancestors, curses or fate.",
        ], pitru_evidence or ["No selected rule fired; other traditions may use different rules."]),
        section("Kaal Sarp Yoga", [kaal.get("rule", "Kaal Sarp rule unavailable"),
            f"Result: {'present' if kaal.get('present') else 'not present'}; pattern {kaal.get('severity', 'none')}.",
            "No automatic cancellation is asserted. Read dasha, dignity and the whole chart alongside the nodal enclosure."], list(kaal.get("evidence") or [])),
        _remedies("Dosha reflection and remedies"),
    ]
    return entries


def _remedies(title="Traditional reflection and remedies"):
    return section(title, ["These optional practices are reflective and devotional, not guaranteed cures or substitutes for medical, legal, financial or relationship decisions."], [
        "Keep a consistent weekly practice of quiet reflection, mantra or prayer according to your own tradition.",
        "Choose one concrete act of service or charity that is affordable and useful to its recipient.",
        "For relationship concerns, practise direct listening, consent, financial transparency and conflict repair.",
        "For Saturn themes, favour sustainable routines, patience and responsibility rather than fear-based rituals.",
    ])


def _sade_sati(report):
    ss = report["transits"]["sade_sati"]
    rows = [[p["start"], p["end"] or "Open", "Yes" if p["started_before_birth"] else "No"] for p in ss["lifetime_periods"]]
    phase = ss.get("phase")
    analysis = "Saturn is not currently in the 12th, 1st or 2nd sign from natal Moon under this report's rule."
    if phase:
        analysis = {
            "rising (1st phase)": "Rising phase: Saturn is 12th from the Moon. Review closure, expenditure, rest and preparation without assuming loss.",
            "peak (2nd phase)": "Peak phase: Saturn is with the natal Moon sign. Review emotional load, duties and support systems without assuming distress.",
            "setting (3rd phase)": "Setting phase: Saturn is 2nd from the Moon. Review resources, speech, family responsibilities and consolidation.",
        }.get(phase, analysis)
    return [section("Sade Sati status and phase analysis", [analysis, ss["rule"],
        "All dates are calculated transit windows, not promises of difficulty. Retrograde exits and re-entries are merged into the conventional span."],
        table={"headers": ["Start", "End", "Started before birth"], "rows": rows, "widths": [1.2, 1.2, 1.4]}), _remedies("Sade Sati reflection and remedies")]


def _marriage(c, report):
    activation = activation_windows(c, horizon_years=5)
    windows = event_windows(c, "relationships", horizon_years=5, ashtakavarga=report["ashtakavarga"],
                            planet_strength=report["planet_strength"], activation=activation)
    seventh_lord = c.house_lord[7]
    rows = [[w["mahadasha"].title() + "–" + w["antardasha"].title(), w["start"], w["end"], w["direction"], w["confidence"],
             "; ".join(w["reasons"][:2])] for w in windows["windows"][:8]]
    candidates = _muhurat_candidates(c, windows["windows"][:8])
    return [section("Marriage conditions", [
        f"7th house: {SIGNS[c.house_sign[7]]}; 7th lord {seventh_lord.title()} in house {c.house[seventh_lord]}.",
        f"Venus: {SIGNS[c.sign['VENUS']]} in house {c.house['VENUS']}; Jupiter: {SIGNS[c.sign['JUPITER']]} in house {c.house['JUPITER']}.",
        "The ranked windows combine dasha relevance, SAV, heuristic strength and slow-transit triggers. They are not guarantees of marriage.",
    ], table={"headers": ["Dasha", "Start", "End", "Direction", "Confidence", "Basis"], "rows": rows,
              "widths": [1, .8, .8, .7, .7, 2.2], "font_size": 7}),
        section("Candidate Shubh Vivah Muhurat dates", [
            "Candidates are sampled at 12:00 local time in the strongest ranked windows, using traditional weekday, tithi and nakshatra filters.",
            "A final ceremony time requires the ceremony location, both families' traditions and a human muhurat review. No candidate is a guarantee.",
        ], table={"headers": ["Date", "Weekday", "Tithi", "Nakshatra", "Dasha window"], "rows": candidates,
                  "widths": [.9, .8, 1.4, 1.2, 1.4]})]


def _add_years(value: datetime, years: int) -> datetime:
    year = value.year + years
    day = min(value.day, calendar.monthrange(year, value.month)[1])
    return value.replace(year=year, day=day)


def _annual_outlook(chart, report, years: int):
    """Create one chart-linked outlook row per life topic for each year in the horizon."""
    activation = activation_windows(chart, horizon_years=years)
    local_tz = chart.time.local.tzinfo
    start = datetime.fromisoformat(activation["at"]).astimezone(local_tz)
    topics = ("career", "relationships", "wealth", "education", "property", "general")
    topic_labels = {topic: TOPICS[topic]["label"] for topic in topics}
    ranked = {
        topic: event_windows(chart, topic, horizon_years=years,
                             ashtakavarga=report.get("ashtakavarga"),
                             planet_strength=report.get("planet_strength"),
                             activation=activation, limit=None)["windows"]
        for topic in topics
    }
    sections = []
    for offset in range(years):
        year_start, year_end = _add_years(start, offset), _add_years(start, offset + 1)
        rows = []
        for topic in topics:
            overlapping = []
            for window in ranked[topic]:
                w_start = datetime.fromisoformat(window["start"]).astimezone(local_tz)
                w_end = datetime.fromisoformat(window["end"]).astimezone(local_tz)
                if w_start < year_end and w_end > year_start:
                    overlapping.append((window, max(w_start, year_start), min(w_end, year_end)))
            if not overlapping:
                rows.append([topic_labels[topic],
                             "No standout period", "—", "Mixed", "Low", "No strong period overlap in this year"])
                continue
            window, clipped_start, clipped_end = max(
                overlapping,
                key=lambda item: (item[0]["confidence"] == "moderate", item[0]["support_score"]),
            )
            basis = "; ".join(window["reasons"][:2])
            rows.append([topic_labels[topic],
                         f"{window['mahadasha'].title()}–{window['antardasha'].title()}",
                         f"{clipped_start:%d %b %Y} – {clipped_end:%d %b %Y}",
                         window["direction"].title(), window["confidence"].title(), basis])
        sections.append(section(f"Year {offset + 1} · {year_start:%d %b %Y} to {year_end:%d %b %Y}",
                                ["This table shows the strongest calculated dasha activation found for each topic during this year. It is a planning lens, not a promise that an event will happen."],
                                table={"headers": ["Life area", "Strongest period", "Active dates", "Chart tendency", "Evidence confidence", "Chart basis"],
                                       "rows": rows, "widths": [1.25, 1.15, 1.55, .8, .75, 2.5], "font_size": 7.4}))
    return sections


def _muhurat_candidates(c, windows):
    weekdays = {0, 2, 3, 4}
    nakshatras = {"Rohini", "Mrigashira", "Magha", "Uttara Phalguni", "Hasta", "Swati", "Anuradha",
                  "Uttara Ashadha", "Uttara Bhadrapada", "Revati"}
    tithis = {"Dwitiya", "Tritiya", "Panchami", "Saptami", "Dashami", "Ekadashi", "Trayodashi"}
    now = datetime.now(timezone.utc)
    found = []
    for window in windows:
        try:
            start = max(now, datetime.fromisoformat(window["start"]))
            end = datetime.fromisoformat(window["end"])
        except ValueError:
            continue
        day = start + timedelta(days=(12 - start.hour) % 24)
        while day <= end and len(found) < 12:
            local = day.astimezone(c.time.local.tzinfo)
            if local.weekday() in weekdays:
                pos, _ = c.eph.sidereal_positions(day, node=c.options.node)
                tithi = tithi_info(pos["SUN"]["lon"], pos["MOON"]["lon"])
                nak = nakshatra_info(pos["MOON"]["lon"])
                if tithi["name"] in tithis and nak["name"] in nakshatras:
                    found.append([local.date().isoformat(), local.strftime("%A"), f"{tithi['paksha']} {tithi['name']}",
                                  f"{nak['name']} · pada {nak['pada']}", f"{window['mahadasha'].title()}–{window['antardasha'].title()}"])
            day += timedelta(days=1)
    return found or [["No filtered candidate in the sampled windows", "—", "Widen the horizon with a human muhurat review", "—", "—"]]


def _suggestion(c, report, kind):
    lord = c.house_lord[1]
    strength = report["planet_strength"].get(lord, {})
    mapping = {
        "gemstone": {"SUN": ("Ruby", "Surya"), "MOON": ("Natural pearl", "Chandra"), "MARS": ("Red coral", "Mangala"),
                     "MERCURY": ("Emerald", "Budha"), "JUPITER": ("Yellow sapphire", "Guru"),
                     "VENUS": ("Diamond or white sapphire", "Shukra"), "SATURN": ("Blue sapphire", "Shani")},
        "rudraksha": {"SUN": ("1 or 12 mukhi", "Surya"), "MOON": ("2 mukhi", "Chandra"), "MARS": ("3 mukhi", "Mangala"),
                      "MERCURY": ("4 mukhi", "Budha"), "JUPITER": ("5 mukhi", "Guru"), "VENUS": ("6 mukhi", "Shukra"),
                      "SATURN": ("7 mukhi", "Shani")},
    }
    item, deity = mapping[kind][lord]
    caution = "Blue sapphire has a strong traditional caution; do not wear it without individual human advice." if kind == "gemstone" and lord == "SATURN" else "Treat this as a traditional association, not a medical treatment, necessity or guaranteed remedy."
    return [section(f"Chart-linked {kind} suggestion", [
        f"Primary planet: {lord.title()}, because it rules the {SIGNS[c.lagna_sign]} ascendant. Its transparent heuristic strength is {strength.get('score', 'not available')}/100 ({strength.get('label', 'not available')}).",
        f"Traditional association used here: {item}, associated with {deity}.",
        "The selection follows the ascendant lord rather than automatically choosing the weakest or most difficult planet.",
        caution,
    ], list(strength.get("factors") or [])), _remedies("Optional traditional practice")]


def _match(c1, c2, r1, r2):
    match = match_charts(c1, c2, r1, r2)
    rows = [[k["name"], f"{k['score']:g}/{k['max']:g}", str(k["person1"]), str(k["person2"]), k["interpretation"]] for k in match["kootas"]]
    cancellations = []
    nadi = next(k for k in match["kootas"] if k["key"] == "nadi")
    if nadi["score"] == 0:
        if c1.sign["MOON"] != c2.sign["MOON"]:
            cancellations.append("Different Moon signs: some traditions treat this as a Nadi exception; the base score remains unchanged here.")
        if int(c1.lon["MOON"] // (360 / 27)) != int(c2.lon["MOON"] // (360 / 27)):
            cancellations.append("Different birth nakshatras: some traditions review this as a Nadi exception; no universal cancellation is asserted.")
    bhakoot = next(k for k in match["kootas"] if k["key"] == "bhakoot")
    if bhakoot["score"] == 0:
        from vedic.chart import natural_relation
        lord1, lord2 = SIGN_LORD[c1.sign["MOON"]], SIGN_LORD[c2.sign["MOON"]]
        if lord1 == lord2 or natural_relation(lord1, lord2) == "Friend":
            cancellations.append("Moon-sign lords are the same or natural friends: listed as a Bhakoot mitigation in some traditions; base score remains unchanged.")
    d1 = {y["name"]: y for y in r1.get("yogas", [])}
    d2 = {y["name"]: y for y in r2.get("yogas", [])}
    if d1.get("Manglik (Kuja) Dosha", {}).get("present") and d2.get("Manglik (Kuja) Dosha", {}).get("present"):
        cancellations.append("Both charts meet this engine's Manglik rule: a commonly cited mutual exception, shown for review without changing the Ashtakoota total.")
    if not cancellations:
        cancellations.append("No selected cancellation condition fired. Other lineages may apply additional exceptions.")
    dosha_rows = []
    for label, data in (("Partner 1", d1), ("Partner 2", d2)):
        for name in ("Manglik (Kuja) Dosha", "Kaal Sarp Yoga"):
            yoga = data.get(name, {})
            dosha_rows.append([label, name, "Present" if yoga.get("present") else "Not present", str(yoga.get("severity", "none"))])
    people = [f"{match['person1']['name']}: {match['person1']['moon']['sign']} Moon · {match['person1']['moon']['nakshatra']}",
              f"{match['person2']['name']}: {match['person2']['moon']['sign']} Moon · {match['person2']['moon']['nakshatra']}"]
    out = [section("Match summary", people + [f"Ashtakoota total: {match['total']:g}/36 · {match['band']}.", match["direction"], match["caution"]]),
           section("Detailed Ashtakoota analysis", [match["method"]], table={"headers": ["Factor", "Score", "Partner 1", "Partner 2", "Interpretation"], "rows": rows,
                                                                              "widths": [1, .5, 1, 1, 2.5], "font_size": 6.8}),
           section("Dosha checks", table={"headers": ["Chart", "Dosha", "Result", "Severity"], "rows": dosha_rows, "widths": [1, 2, 1, 1]}),
           section("Dosha-cancellation review", ["Exceptions vary by lineage. The report lists transparent mitigations without silently altering the base 36-point score."], cancellations),
           section("Relationship indicators and practical focus", [match["person1"]["relationship_indicators"]["seventh_house"], match["person2"]["relationship_indicators"]["seventh_house"]], match["practical_focus"])]
    return out


def build_report(product_key, c, report, c2=None, report2=None):
    if product_key == "core":
        return "Your Vedic Kundli", "Core birth chart, planets, houses, dashas and transits", [
            _reader_guide("core"), _birth_section(report), _identity_section(report), _planet_section(report), _house_section(report),
            _varga_section(report), _dasha_section(report), _transit_section(report),
        ]
    item = PRODUCTS[product_key]
    kind = item["kind"]
    if kind == "match":
        if c2 is None or report2 is None:
            raise ValueError("Two charts are required for matchmaking")
        return item["name"], "Two calculated charts · Ashtakoota, doshas, D9 and practical review", [_reader_guide(kind)] + _match(c, c2, report, report2)
    sections = [_reader_guide(kind), _birth_section(report), _identity_section(report), _planet_section(report)]
    if kind == "life":
        sections += [_house_section(report), _varga_section(report), _dasha_section(report, item["years"])]
        sections += _annual_outlook(c, report, item["years"])
        sections += _premium_sections(report) + _dosha(c, report) + [_transit_section(report)]
    elif kind == "sade_sati":
        sections += _sade_sati(report)
    elif kind == "dosha":
        sections += _dosha(c, report)
    elif kind == "marriage":
        sections += _marriage(c, report)
    elif kind in ("gemstone", "rudraksha"):
        sections += _suggestion(c, report, kind)
    return item["name"], " · ".join(item["features"][:2]), sections
