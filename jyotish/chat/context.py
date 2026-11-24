"""Compact, model-readable chart context. Everything here comes from the engine report; nothing is inferred."""
from __future__ import annotations

import json

from vedic.constants import GRAHAS, SIGNS

ABBR = {"SUN": "Su", "MOON": "Mo", "MARS": "Ma", "MERCURY": "Me", "JUPITER": "Ju", "VENUS": "Ve",
        "SATURN": "Sa", "RAHU": "Ra", "KETU": "Ke"}


def _ord(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _varga_line(v):
    occ = {}
    for g, p in v["planets"].items():
        occ.setdefault(p["house"], []).append(f"{g.title()}({p['sign_name']})")
    houses = "; ".join(f"H{h}: {', '.join(occ[h])}" for h in sorted(occ))
    return f"lagna {v['lagna']['sign_name']} | {houses}"


def build_context(report: dict, today: str | None = None) -> str:
    r = report
    m, b, L = r["meta"], r["birth"], r["lagna"]
    out = []
    w = out.append
    w("# CHART CONTEXT (computed by the Nuvora engine; treat as ground truth)")
    w(f"Conventions: sidereal, Lahiri ayanamsa {m['ayanamsa']['value_dms']}, whole-sign houses, {m['node']} node, "
      f"Vimshottari year {m['dasha_year_days']} days, Rahu/Ketu aspects 5/7/9: {m['node_aspects_5_7_9']}.")
    who = b.get("name") or "the native"
    w(f"Native: {who}{', ' + b['gender'] if b.get('gender') else ''}. Born {b['local']} local "
      f"({b['utc']} UTC) at {b.get('place') or ''} lat {b['lat']:.4f}, lon {b['lon']:.4f}.")
    if m["warnings"]:
        w("Warnings: " + " | ".join(m["warnings"]))
    if today:
        w(f"Today: {today}")

    w("\n## D1 Rashi")
    w(f"Lagna: {L['sign_name']} {L['dms']} ({L['nakshatra']} pada {L['pada']}), lagna lord {L['lord'].title()}.")
    w("| Graha | Sign | Deg | House | Nakshatra-pada | Dignity | Flags | Lord of | Aspects houses |")
    w("|---|---|---|---|---|---|---|---|---|")
    for g in GRAHAS:
        p = r["planets"][g]
        flags = []
        if p["retrograde"] and g not in ("RAHU", "KETU"):
            flags.append("retrograde")
        if p["combustion"]["combust"]:
            flags.append(f"combust {p['combustion']['distance_from_sun']:.1f}°")
        if p["vargottama"]:
            flags.append("vargottama")
        if p["chara_karaka"]:
            flags.append(p["chara_karaka"])
        flags.append(p["avastha_baladi"])
        w(f"| {g.title()} | {p['sign_name']} | {p['dms']} | {p['house']} | {p['nakshatra']}-{p['pada']} | "
          f"{p['dignity']['status']} | {', '.join(flags)} | {','.join(map(str, p['lord_of_houses'])) or '-'} | "
          f"{','.join(map(str, p['aspects_houses']))} |")
    w("Houses (sign, lord -> where the lord sits, occupants, aspected by):")
    for h in r["houses"]:
        w(f"  H{h['house']} {h['sign_name']}: lord {h['lord'].title()} in H{h['lord_in_house']}; "
          f"occupants {', '.join(x.title() for x in h['occupants']) or '-'}; "
          f"aspected by {', '.join(x.title() for x in h['aspected_by']) or '-'}")

    w("\n## Key divisional charts (other vargas via get_varga)")
    for key in ("D9", "D10", "D7"):
        if key in r["vargas"]:
            w(f"{key} {r['vargas'][key]['name']}: {_varga_line(r['vargas'][key])}")

    d = r["dasha"]
    w("\n## Vimshottari dasha")
    w(f"Birth nakshatra lord {d['birth_nakshatra_lord'].title()}, balance at birth {d['balance_at_birth_years']:.2f} y.")
    if d["running_now"]:
        w("Running now: " + " > ".join(f"{p['label']} ({p['start'][:10]} to {p['end'][:10]})" for p in d["running_now"]))
    w("Mahadashas: " + "; ".join(f"{p['label']} {p['start'][:10]}..{p['end'][:10]}" for p in d["mahadashas"][:9]))
    now_md = d["running_now"][0]["label"] if d["running_now"] else None
    for p in d["mahadashas"]:
        if p["label"] == now_md:
            w(f"Antardashas of {now_md}: " + "; ".join(f"{a['label']} {a['start'][:10]}..{a['end'][:10]}"
                                                       for a in p.get("antardashas", [])))
            break

    if "transits" in r:
        t = r["transits"]
        w(f"\n## Transits at {t['at']}")
        w("; ".join(f"{g.title()} {p['sign_name']} {p['degree']:.1f}°{' R' if p['retrograde'] and g not in ('RAHU', 'KETU') else ''} "
                    f"(H{p['house_from_lagna']} from lagna, H{p['house_from_moon']} from Moon)"
                    for g, p in t["positions"].items()))
        ss = t["sade_sati"]
        w(f"Sade Sati: {'ACTIVE, ' + ss['phase'] if ss['active'] else 'not active'}; Saturn is "
          f"{_ord(ss['saturn_house_from_moon'])} from Moon; ashtama {ss['ashtama_shani']}, kantaka {ss['kantaka_shani']}. "
          f"Lifetime periods: " + ", ".join(f"{p['start']}..{p['end'] or 'beyond range'}" for p in ss["lifetime_periods"]))
        if t["upcoming_ingresses"]:
            w("Upcoming slow-planet sign changes: " + "; ".join(
                f"{i['planet'].title()} -> {i['to']} {i['time'][:10]} (H{i['house_from_lagna']}/Moon H{i['house_from_moon']})"
                for i in t["upcoming_ingresses"][:10]))

    w("\n## Yogas detected by the engine (only these are confirmed; anything else is unconfirmed)")
    ys = [y for y in r.get("yogas", []) if y["present"]]
    if not ys:
        w("None of the catalogued yogas are present.")
    yoga_analysis = r.get("yoga_analysis") or {}
    if yoga_analysis:
        w("Combined yoga synthesis: " + yoga_analysis.get("headline", "") + " " + yoga_analysis.get("summary", ""))
        w(yoga_analysis.get("note", ""))
    for y in ys:
        extra = " [CANCELLED]" if y.get("cancelled") else ""
        strength = y.get("strength") or {}
        quality = (f"; strength {strength.get('label')} {strength.get('score')}/100" if strength else "")
        quality += f"; severity {y['severity']}" if y.get("severity") else ""
        w(f"- {y['name']} ({y['category']}){extra}{quality}: {'; '.join(y['evidence'])}")
        impact = y.get("impact") or {}
        if impact:
            activation = impact.get("activation") or {}
            condition = impact.get("condition") or {}
            w(f"  Personal impact ({impact.get('direction')}): {impact.get('summary')}")
            w(f"  Activation: {activation.get('label')}. {activation.get('reason')}")
            w(f"  Participant condition: {condition.get('label')}. {condition.get('summary')}")
            if impact.get("modifiers"):
                w("  Modifiers: " + " | ".join(impact["modifiers"]))
            for link in impact.get("interactions", []):
                w(f"  Interaction ({link['kind']}): {link['text']}")
            w("  Combined effect: " + impact.get("combined_effect", ""))
    w("Catalogue checked: Pancha Mahapurusha, Gajakesari, Budhaditya, Chandra-Mangala, Kemadruma, Raja/Yogakaraka, "
      "Dhana, Viparita (Harsha/Sarala/Vimala), Neecha Bhanga, Manglik, Kaal Sarp, Parivartana, Adhi, "
      "Sunapha/Anapha/Durudhara, Shubha/Papa Kartari, Guru-Chandala.")

    strengths = r.get("planet_strength") or {}
    if strengths:
        w("\n## Planetary strength heuristic (NOT classical Shadbala)")
        for g, s in strengths.items():
            w(f"- {g.title()}: {s['label']}, {s['score']}/100; " + "; ".join(s["factors"]))
        w("Use these as transparent supporting evidence only; do not present the scores as scientific probabilities.")

    timing = r.get("timing") or {}
    if timing:
        w("\n## Dasha activation periods and slow-transit triggers")
        w(json.dumps({"current": timing.get("current"), "periods": timing.get("periods", [])[:12]}, ensure_ascii=False))

    events = r.get("event_windows") or {}
    if events:
        compact = {topic: {"label": data["label"], "windows": data["windows"][:2], "note": data["note"]}
                   for topic, data in events.items()}
        w("\n## Topical event-window candidates (activation, never guaranteed events)")
        w(json.dumps(compact, ensure_ascii=False))

    if r.get("confidence"):
        w("\n## Reading confidence and birth-time guidance")
        w(json.dumps({"confidence": r["confidence"], "birth_time_guidance": r.get("birth_time_guidance")}, ensure_ascii=False))
    if r.get("engine_summary"):
        w("\n## Engine method summary\n" + json.dumps(r["engine_summary"], ensure_ascii=False))

    av = r.get("ashtakavarga")
    if av:
        w("\n## Sarvashtakavarga by house: " + ", ".join(f"H{x['house']}={x['sav']}" for x in av["sav_by_house"]))

    s = r.get("sensitivity")
    if s:
        w("\n## Birth-time sensitivity (minutes before/after birth until the factor changes)")
        for k, v in s.items():
            if isinstance(v, dict) and "rating" in v:
                w(f"- {k}: {v['rating']} (before {v['before_min']}, after {v['after_min']}"
                  f"{', now ' + v['current'] if 'current' in v else ''})")
        w(f"- Dasha dates shift {s['dasha_shift_per_10_min_days']} days per 10 minutes of birth-time error.")

    p = r["panchang"]
    w(f"\n## Birth panchang: {p['tithi']['paksha']} {p['tithi']['name']}, {p['vara']['name']}, "
      f"nakshatra {p['nakshatra']['name']}, yoga {p['yoga']['name']}, karana {p['karana']['name']}"
      + (f", born during the {p['born_during']}" if p.get("born_during") else "") + ".")
    w(f"Chara karakas: " + ", ".join(f"{k} {v.title()}" for k, v in r["chara_karakas"].items()))
    return "\n".join(out)
