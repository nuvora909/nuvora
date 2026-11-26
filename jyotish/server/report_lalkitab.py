"""Lal Kitab: the fixed-house chart, pakka ghar, Lal Kitab dignities, karmic debts (rin) and remedies (upay).

In Lal Kitab the 1st house is always Aries and each planet keeps the house it occupies in the birth chart, so
the house — not the sign — carries the reading. Only widely published rules are used here; areas where Lal Kitab
sources disagree (node dignities, the annual rotation table) are left out rather than guessed."""
from __future__ import annotations

from reportlab.lib.units import mm

from . import report_visuals as V
from .report_content import BUL, CALL, FLOW, H, NOTE, P, TABLE, _join, chapter, ordinal, pname

GRAHAS = ["SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN", "RAHU", "KETU"]
PAKKA_GHAR = {"SUN": {1}, "MOON": {4}, "MARS": {3, 8}, "MERCURY": {7}, "JUPITER": {2, 5, 9, 12}, "VENUS": {7},
              "SATURN": {8, 10}, "RAHU": {12}, "KETU": {6}}
LK_EXALTED = {"SUN": 1, "MOON": 2, "MARS": 10, "MERCURY": 6, "JUPITER": 4, "VENUS": 12, "SATURN": 7}
LK_DEBILITATED = {"SUN": 7, "MOON": 8, "MARS": 4, "MERCURY": 12, "JUPITER": 10, "VENUS": 6, "SATURN": 1}
HOUSE_THEME = {1: "self and status", 2: "family wealth and in-laws", 3: "siblings and courage",
               4: "mother, home and peace", 5: "children and intelligence", 6: "maternal relatives and enemies",
               7: "spouse and partnerships", 8: "longevity and sudden events", 9: "father, fortune and religion",
               10: "career and father's standing", 11: "income and elder siblings", 12: "expenses, sleep and losses"}

# (name, planets, houses, meaning, customary remedy) — the commonly published Lal Kitab rin rules
RINS = [
    ("Pitra Rin (ancestral debt)", {"VENUS", "MERCURY", "RAHU"}, {2, 5, 9, 12},
     "unfulfilled duties of the family line, often felt as obstacles despite effort",
     "Family members contribute equal shares of money, donated together on one day for a religious or charitable cause."),
    ("Swa Rin (debt to oneself)", {"VENUS", "SATURN", "RAHU", "KETU"}, {5},
     "past neglect of one's own duties or traditions, felt as setbacks in one's own plans",
     "Perform a havan (fire ritual) with contributions collected from the family."),
    ("Matri Rin (debt to the mother)", {"KETU"}, {4},
     "neglect of the mother or mother-figures, felt as unrest at home",
     "Collect silver from blood relatives and float it in running water on one day."),
    ("Stri Rin (debt to women)", {"SUN", "RAHU", "KETU"}, {2, 7},
     "mistreatment of a woman in the family line, felt in marriage and family harmony",
     "Feed cows (traditionally 100) on a single day, with contributions from the family."),
    ("Bandhu Rin (debt to relatives)", {"MERCURY", "KETU"}, {1, 8},
     "broken trust with relatives or friends, felt as disputes and unreliable support",
     "Collect money from the family and donate it to a hospital or for medicines on one day."),
    ("Behen Rin (debt to sisters and daughters)", {"MOON"}, {3, 6},
     "unkindness to sisters or daughters, felt as obstacles to the native's peace",
     "Distribute yellow-coloured items to young girls, with contributions from the family."),
    ("Nirdayi Rin (debt of cruelty)", {"SUN", "MOON", "MARS"}, {10, 11},
     "harshness toward the weak in the family line, felt as reversals in career",
     "Feed labourers and serve those in need, with family contributions, on one day."),
    ("Ajanma Rin (debt to the unborn)", {"SUN", "VENUS", "MARS"}, {12},
     "harm to unborn life in the family line, felt as hidden obstacles",
     "Collect a coconut from each family member and float them in running water on one day."),
    ("Kudrati Rin (debt to nature)", {"MOON", "MARS"}, {6},
     "harm to animals or nature in the family line, felt as unexpected troubles",
     "Feed stray dogs and other animals regularly, as a family practice."),
]

UPAY = {
    "SUN": ["Offer water to the rising Sun.", "Begin important work after eating something sweet with water.",
            "Respect your father and senior colleagues; avoid accepting gifts you have not earned."],
    "MOON": ["Keep a small piece of silver with you.", "Take the blessings of your mother or an elderly woman before important work.",
             "Offer milk or water at the root of a banyan tree."],
    "MARS": ["Distribute sweets (traditionally sweet bread) on Tuesdays.", "Keep a red handkerchief with you.",
             "Avoid anger and needless arguments with brothers."],
    "MERCURY": ["Feed green fodder to cows.", "Keep your teeth and speech clean; avoid harsh words.",
                "Respect your sisters, daughters and paternal aunts."],
    "JUPITER": ["Apply a saffron or turmeric tilak on the forehead.", "Respect teachers, elders and saints.",
                "Offer water to a peepal tree (not on Sundays)."],
    "VENUS": ["Feed and care for cows.", "Respect your spouse and keep married life honest.",
              "Donate curd, ghee or camphor at a place of worship."],
    "SATURN": ["Feed crows and help labourers.", "Donate mustard oil on Saturdays.",
               "Avoid alcohol, non-vegetarian food and dishonest dealings."],
    "RAHU": ["Keep a square piece of silver with you.", "Float barley (washed in milk) or coal in running water.",
             "Respect in-laws and avoid electrical or blue items as gifts."],
    "KETU": ["Feed stray dogs.", "Donate a black-and-white blanket.", "Respect your sons, nephews and maternal uncles."],
}


def lal_kitab(ctx) -> dict:
    houses = {g: ctx.planet(g)["house"] for g in GRAHAS}
    status = {}
    for g, h in houses.items():
        if g in LK_EXALTED and h == LK_EXALTED[g]:
            status[g] = ("Exalted (uchcha)", "good")
        elif g in LK_DEBILITATED and h == LK_DEBILITATED[g]:
            status[g] = ("Debilitated (neech)", "caution")
        elif h in PAKKA_GHAR[g]:
            status[g] = ("In its pakka ghar", "good")
        else:
            status[g] = ("Ordinary placement", "neutral")
    rins = []
    for name, planets, hs, meaning, remedy in RINS:
        who = [g for g in planets if houses[g] in hs]
        if who:
            rins.append({"name": name, "planets": who, "meaning": meaning, "remedy": remedy})
    weak = [g for g in GRAHAS if status[g][0].startswith("Debilitated")]
    for r in rins:
        weak += [g for g in r["planets"] if g not in weak]
    return {"houses": houses, "status": status, "rins": rins, "weak": weak}


def lal_kitab_chapter(ctx, brk=True):
    lk = lal_kitab(ctx)
    placements = {}
    for g, h in lk["houses"].items():
        placements.setdefault(h, []).append(V.ABBR[g])
    chart = V.KundliChart(0, placements, "Lal Kitab chart (house 1 = Aries)", 72 * mm)
    rows = [[pname(g), str(h), _join([str(x) for x in sorted(PAKKA_GHAR[g])]), lk["status"][g][0],
             HOUSE_THEME[h][:1].upper() + HOUSE_THEME[h][1:]]
            for g, h in lk["houses"].items()]
    blocks = [
        P("Lal Kitab ('the red book') is a 20th-century school of astrology and remedies from North India. Its chart "
          "fixes Aries in the 1st house and places every planet in the house it occupies in your birth chart, so the "
          "house, not the sign, carries the meaning. It is best known for practical, inexpensive remedies (upay)."),
        FLOW(chart, 3),
        H("Planets in the Lal Kitab chart"),
        TABLE(["Planet", "House", "Pakka ghar", "Lal Kitab status", "Area of life"], rows, [.8, .5, .9, 1.4, 1.8], 8,
              highlight=[(i, 3, lk["status"][g][1] if lk["status"][g][1] != "neutral" else "info")
                         for i, g in enumerate(lk["houses"]) if lk["status"][g][1] != "neutral"]),
        NOTE("Pakka ghar is a planet's permanent house in Lal Kitab. A planet there, or in its Lal Kitab exaltation "
             "house, gives its results easily; in its debilitation house it needs remedies."),
        H("Karmic debts (Rin)"),
    ]
    if lk["rins"]:
        blocks.append(P("Lal Kitab reads certain placements as debts carried over from the family line. They are not "
                        "curses: each has a simple shared remedy, traditionally done once by the whole family together."))
        for r in lk["rins"]:
            formed = _join([f"{pname(g)} in your {ordinal(lk['houses'][g])} house" for g in r["planets"]])
            blocks.append(CALL(r["name"], [f"**Formed by** {formed}. Traditionally associated with {r['meaning']}.",
                                           f"**Customary remedy:** {r['remedy']}"], "gold", "Indicated"))
    else:
        blocks.append(CALL("No karmic debt indicated", "None of the nine Lal Kitab rin patterns is formed in your chart.",
                           "good", "Clear"))
    blocks.append(H("Remedies (Upay) for your chart"))
    if lk["weak"]:
        blocks.append(P(f"These remedies are for the planets Lal Kitab marks for attention in your chart: "
                        f"{_join([pname(g) for g in lk['weak']])}."))
        for g in lk["weak"]:
            blocks += [H(f"{pname(g)} · {ordinal(lk['houses'][g])} house"), BUL(UPAY[g])]
    else:
        blocks.append(P("No planet is debilitated in Lal Kitab terms and no rin is formed, so no specific remedy is "
                        "required. The general rules below still apply."))
    blocks += [
        H("How Lal Kitab remedies are done"),
        BUL(["Do one remedy at a time, for 43 days without a break; restart if you miss a day.",
             "Do remedies in daylight, between sunrise and sunset.",
             "A remedy for a debt (rin) is done once, together with the family, as described.",
             "Remedies are done by the person themselves (or by parents for a young child).",
             "Lal Kitab remedies are acts of discipline and charity; never stop medical treatment or professional "
             "advice because of them."]),
        NOTE("Lal Kitab sources differ on some details; this chapter uses the most widely published rules and omits "
             "node dignities and the annual (varshphal) rotation, where traditions disagree."),
    ]
    return chapter("Lal Kitab", blocks, "The fixed-house chart, pakka ghar, karmic debts and practical remedies.", brk=brk)
