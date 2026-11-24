"""Static Vedic astrology tables (Parashari). Indices: signs 0=Aries .. 11=Pisces."""

SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
         "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
SIGNS_SA = ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
            "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena"]

GRAHAS = ["SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN", "RAHU", "KETU"]
SEVEN = GRAHAS[:7]

SIGN_LORD = ["MARS", "VENUS", "MERCURY", "MOON", "SUN", "MERCURY",
             "VENUS", "MARS", "JUPITER", "SATURN", "SATURN", "JUPITER"]

# (sign, exact degree of deepest exaltation)
EXALTATION = {"SUN": (0, 10.0), "MOON": (1, 3.0), "MARS": (9, 28.0), "MERCURY": (5, 15.0),
              "JUPITER": (3, 5.0), "VENUS": (11, 27.0), "SATURN": (6, 20.0),
              # Node exaltation varies by tradition; Taurus/Scorpio is the most common Parashari usage.
              "RAHU": (1, 20.0), "KETU": (7, 20.0)}
DEBILITATION = {p: ((s + 6) % 12, d) for p, (s, d) in EXALTATION.items()}

# (sign, start deg, end deg)
MOOLATRIKONA = {"SUN": (4, 0, 20), "MOON": (1, 3, 30), "MARS": (0, 0, 12), "MERCURY": (5, 15, 20),
                "JUPITER": (8, 0, 10), "VENUS": (6, 0, 15), "SATURN": (10, 0, 20)}

OWN_SIGNS = {"SUN": {4}, "MOON": {3}, "MARS": {0, 7}, "MERCURY": {2, 5}, "JUPITER": {8, 11},
             "VENUS": {1, 6}, "SATURN": {9, 10}, "RAHU": {10}, "KETU": {7}}

# Naisargika (natural) relationships, BPHS.
NATURAL_FRIENDS = {
    "SUN": {"MOON", "MARS", "JUPITER"}, "MOON": {"SUN", "MERCURY"},
    "MARS": {"SUN", "MOON", "JUPITER"}, "MERCURY": {"SUN", "VENUS"},
    "JUPITER": {"SUN", "MOON", "MARS"}, "VENUS": {"MERCURY", "SATURN"},
    "SATURN": {"MERCURY", "VENUS"},
}
NATURAL_ENEMIES = {
    "SUN": {"VENUS", "SATURN"}, "MOON": set(), "MARS": {"MERCURY"}, "MERCURY": {"MOON"},
    "JUPITER": {"MERCURY", "VENUS"}, "VENUS": {"SUN", "MOON"}, "SATURN": {"SUN", "MOON", "MARS"},
}

NATURAL_BENEFICS = {"JUPITER", "VENUS"}  # Moon & Mercury are conditional; handled in yogas
NATURAL_MALEFICS = {"SUN", "MARS", "SATURN", "RAHU", "KETU"}

# Special (graha drishti) aspects as house offsets counted inclusively (7 = opposite).
SPECIAL_ASPECTS = {"MARS": (4, 7, 8), "JUPITER": (5, 7, 9), "SATURN": (3, 7, 10),
                   # Rahu/Ketu 5-7-9 is widely used in modern Parashari practice; configurable.
                   "RAHU": (5, 7, 9), "KETU": (5, 7, 9)}

# Combustion orbs in degrees (from Sun). Second value applies when retrograde.
COMBUSTION = {"MOON": (12, 12), "MARS": (17, 17), "MERCURY": (14, 12), "JUPITER": (11, 11),
              "VENUS": (10, 8), "SATURN": (15, 15)}

NAKSHATRAS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu",
              "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta",
              "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha",
              "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada",
              "Uttara Bhadrapada", "Revati"]
NAK_SPAN = 360.0 / 27.0
PADA_SPAN = NAK_SPAN / 4.0

DASHA_ORDER = ["KETU", "VENUS", "SUN", "MOON", "MARS", "RAHU", "JUPITER", "SATURN", "MERCURY"]
DASHA_YEARS = {"KETU": 7, "VENUS": 20, "SUN": 6, "MOON": 10, "MARS": 7,
               "RAHU": 18, "JUPITER": 16, "SATURN": 19, "MERCURY": 17}
NAK_LORD = [DASHA_ORDER[i % 9] for i in range(27)]

TITHIS = ["Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami",
          "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi"]
YOGAS_27 = ["Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma",
            "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra",
            "Siddhi", "Vyatipata", "Variyana", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha",
            "Shukla", "Brahma", "Indra", "Vaidhriti"]
KARANAS_MOVABLE = ["Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti"]
VARAS = ["Ravivara (Sunday)", "Somavara (Monday)", "Mangalavara (Tuesday)",
         "Budhavara (Wednesday)", "Guruvara (Thursday)", "Shukravara (Friday)",
         "Shanivara (Saturday)"]
VARA_LORD = ["SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN"]

CHARA_KARAKAS = ["Atmakaraka", "Amatyakaraka", "Bhratrikaraka", "Matrikaraka",
                 "Putrakaraka", "Gnatikaraka", "Darakaraka"]

# Ashtakavarga benefic houses (BPHS). Key = planet whose BAV it is; inner key = contributor.
ASHTAKAVARGA = {
    "SUN": {"SUN": [1, 2, 4, 7, 8, 9, 10, 11], "MOON": [3, 6, 10, 11], "MARS": [1, 2, 4, 7, 8, 9, 10, 11],
            "MERCURY": [3, 5, 6, 9, 10, 11, 12], "JUPITER": [5, 6, 9, 11], "VENUS": [6, 7, 12],
            "SATURN": [1, 2, 4, 7, 8, 9, 10, 11], "LAGNA": [3, 4, 6, 10, 11, 12]},
    "MOON": {"SUN": [3, 6, 7, 8, 10, 11], "MOON": [1, 3, 6, 7, 10, 11], "MARS": [2, 3, 5, 6, 9, 10, 11],
             "MERCURY": [1, 3, 4, 5, 7, 8, 10, 11], "JUPITER": [1, 4, 7, 8, 10, 11, 12],
             "VENUS": [3, 4, 5, 7, 9, 10, 11], "SATURN": [3, 5, 6, 11], "LAGNA": [3, 6, 10, 11]},
    "MARS": {"SUN": [3, 5, 6, 10, 11], "MOON": [3, 6, 11], "MARS": [1, 2, 4, 7, 8, 10, 11],
             "MERCURY": [3, 5, 6, 11], "JUPITER": [6, 10, 11, 12], "VENUS": [6, 8, 11, 12],
             "SATURN": [1, 4, 7, 8, 9, 10, 11], "LAGNA": [1, 3, 6, 10, 11]},
    "MERCURY": {"SUN": [5, 6, 9, 11, 12], "MOON": [2, 4, 6, 8, 10, 11], "MARS": [1, 2, 4, 7, 8, 9, 10, 11],
                "MERCURY": [1, 3, 5, 6, 9, 10, 11, 12], "JUPITER": [6, 8, 11, 12],
                "VENUS": [1, 2, 3, 4, 5, 8, 9, 11], "SATURN": [1, 2, 4, 7, 8, 9, 10, 11],
                "LAGNA": [1, 2, 4, 6, 8, 10, 11]},
    "JUPITER": {"SUN": [1, 2, 3, 4, 7, 8, 9, 10, 11], "MOON": [2, 5, 7, 9, 11], "MARS": [1, 2, 4, 7, 8, 10, 11],
                "MERCURY": [1, 2, 4, 5, 6, 9, 10, 11], "JUPITER": [1, 2, 3, 4, 7, 8, 10, 11],
                "VENUS": [2, 5, 6, 9, 10, 11], "SATURN": [3, 5, 6, 12], "LAGNA": [1, 2, 4, 5, 6, 7, 9, 10, 11]},
    "VENUS": {"SUN": [8, 11, 12], "MOON": [1, 2, 3, 4, 5, 8, 9, 11, 12], "MARS": [3, 5, 6, 9, 11, 12],
              "MERCURY": [3, 5, 6, 9, 11], "JUPITER": [5, 8, 9, 10, 11], "VENUS": [1, 2, 3, 4, 5, 8, 9, 10, 11],
              "SATURN": [3, 4, 5, 8, 9, 10, 11], "LAGNA": [1, 2, 3, 4, 5, 8, 9, 11]},
    "SATURN": {"SUN": [1, 2, 4, 7, 8, 10, 11], "MOON": [3, 6, 11], "MARS": [3, 5, 6, 10, 11, 12],
               "MERCURY": [6, 8, 9, 10, 11, 12], "JUPITER": [5, 6, 11, 12], "VENUS": [6, 11, 12],
               "SATURN": [3, 5, 6, 11], "LAGNA": [1, 3, 4, 6, 10, 11]},
}
BAV_TOTALS = {"SUN": 48, "MOON": 49, "MARS": 39, "MERCURY": 54, "JUPITER": 56, "VENUS": 52, "SATURN": 39}

VARGAS = [1, 2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60]
VARGA_NAMES = {1: "Rashi", 2: "Hora", 3: "Drekkana", 4: "Chaturthamsha", 7: "Saptamsha",
               9: "Navamsha", 10: "Dashamsha", 12: "Dwadashamsha", 16: "Shodashamsha",
               20: "Vimshamsha", 24: "Chaturvimshamsha", 27: "Bhamsha", 30: "Trimshamsha",
               40: "Khavedamsha", 45: "Akshavedamsha", 60: "Shashtiamsha"}
VARGA_DOMAIN = {1: "body, overall life", 2: "wealth", 3: "siblings, courage", 4: "property, fortune",
                7: "children", 9: "spouse, dharma, strength of planets", 10: "career, status",
                12: "parents", 16: "vehicles, comforts", 20: "spiritual practice",
                24: "education, learning", 27: "strengths & weaknesses", 30: "misfortunes, health",
                40: "maternal legacy", 45: "paternal legacy, character", 60: "past karma, overall"}
