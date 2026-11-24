"""Interpretive text used by the PDF reports: signs, nakshatras, dasha lords, transits, remedies and gems.

Traditional Parashari associations written in plain language. Everything chart-specific is decided in
report_content.py; this module only holds the reference meanings it draws on."""

SIGN_ELEMENT = ["Fire", "Earth", "Air", "Water"] * 3
SIGN_MODE = ["Movable", "Fixed", "Dual"] * 4

LAGNA_TEXT = [
    "Aries rising meets life head-on: quick to start, direct, competitive and happiest when there is something to lead or win. The lesson is to finish as strongly as you begin.",
    "Taurus rising builds slowly and keeps what it builds: steady, sensual, loyal and practical about money and comfort. Its strength is endurance; its trap is resisting change for too long.",
    "Gemini rising lives through the mind: curious, articulate, adaptable and quick to connect people and ideas. It thrives on variety and needs focus to turn talent into depth.",
    "Cancer rising leads with feeling: protective, intuitive, family-minded and deeply attached to home and belonging. Emotional security is the engine of everything else.",
    "Leo rising carries natural presence: warm, proud, generous and drawn to visible roles where it can create and lead. It does best when its pride serves a purpose larger than itself.",
    "Virgo rising improves whatever it touches: analytical, careful, service-minded and attentive to detail and health. Its gift is competence; its risk is excessive self-criticism.",
    "Libra rising seeks balance and fairness: diplomatic, aesthetic, relationship-oriented and good at negotiation. Life moves through partnerships, so choosing them well matters.",
    "Scorpio rising goes deep: intense, private, resilient and drawn to research, crisis and transformation. It has great staying power and must learn to trust as well as to protect.",
    "Sagittarius rising looks for meaning: optimistic, principled, outspoken and fond of learning, travel and teaching. Its growth comes from turning belief into disciplined action.",
    "Capricorn rising is built for the long climb: disciplined, practical, reserved and ambitious for lasting results. Recognition often comes later in life and tends to last.",
    "Aquarius rising thinks in systems and communities: independent, idealistic, inventive and loyal to causes and friends. It needs room to be different and a structure to make ideas real.",
    "Pisces rising lives with an open heart: imaginative, compassionate, intuitive and spiritually inclined. It absorbs its surroundings easily, so boundaries and routine protect its gifts.",
]

MOON_TEXT = [
    "An Aries Moon reacts quickly and honestly; feelings flare and settle fast. You need independence, action and a challenge to feel emotionally alive.",
    "A Taurus Moon (the Moon's exaltation sign) is emotionally steady and comfort-loving. You need security, routine, good food and loyal people around you.",
    "A Gemini Moon processes feelings by talking and thinking them through. You need conversation, variety and mental stimulation to feel at ease.",
    "A Cancer Moon (the Moon's own sign) is sensitive, caring and memory-rich. You need a safe home base and people to nurture and be nurtured by.",
    "A Leo Moon needs warmth, appreciation and a little stage of its own. You feel best when your loyalty and generosity are recognised.",
    "A Virgo Moon finds calm in order and usefulness. You need practical routines, clear plans and work that lets you help.",
    "A Libra Moon looks for harmony and companionship. You feel settled when relationships are fair and surroundings are beautiful.",
    "A Scorpio Moon (the Moon's debilitation sign) feels intensely and privately. You need trust, depth and time alone to process; resilience grows through life's tests.",
    "A Sagittarius Moon is buoyant and freedom-loving. You need meaning, open horizons, learning and honest people around you.",
    "A Capricorn Moon is emotionally reserved and responsible. You feel secure through achievement, structure and being relied upon; allow yourself rest as well as duty.",
    "An Aquarius Moon is detached in feeling but loyal in friendship. You need space, ideas and a community or cause to belong to.",
    "A Pisces Moon is tender, intuitive and imaginative. You need quiet, creativity and spiritual or artistic outlets, and protection from absorbing others' moods.",
]

SIGN_SHORT = ["energetic and direct", "steady and loyal", "communicative and curious", "caring and protective",
              "proud and generous", "practical and precise", "balanced and refined", "intense and private",
              "principled and expansive", "disciplined and responsible", "independent and idealistic",
              "gentle and intuitive"]

NAKSHATRA_TEXT = {
    "Ashwini": "ruled by Ketu, symbol the horse's head: speed, healing and a pioneering start.",
    "Bharani": "ruled by Venus, deity Yama: endurance, responsibility and carrying life's heavier loads with grace.",
    "Krittika": "ruled by the Sun, deity Agni: sharp judgement, purification and the courage to cut through.",
    "Rohini": "ruled by the Moon, deity Brahma: growth, beauty, creativity and magnetic charm.",
    "Mrigashira": "ruled by Mars, symbol the deer's head: gentle curiosity and a lifelong search.",
    "Ardra": "ruled by Rahu, deity Rudra: storms that clear the air; intellect sharpened by upheaval.",
    "Punarvasu": "ruled by Jupiter, deity Aditi: renewal, optimism and the ability to return and rebuild.",
    "Pushya": "ruled by Saturn, deity Brihaspati: nourishment, dependability and quiet wisdom.",
    "Ashlesha": "ruled by Mercury, deity the Nagas: penetrating insight, strategy and emotional depth.",
    "Magha": "ruled by Ketu, deity the Pitris: lineage, dignity and natural authority.",
    "Purva Phalguni": "ruled by Venus, deity Bhaga: enjoyment, affection, creativity and rest.",
    "Uttara Phalguni": "ruled by the Sun, deity Aryaman: loyalty, contracts, friendship and service.",
    "Hasta": "ruled by the Moon, deity Savitar: skilled hands, wit and practical cleverness.",
    "Chitra": "ruled by Mars, deity Vishvakarma: design, craftsmanship and striking presence.",
    "Swati": "ruled by Rahu, deity Vayu: independence, flexibility and commerce.",
    "Vishakha": "ruled by Jupiter, deities Indra and Agni: determined ambition and goal-focus.",
    "Anuradha": "ruled by Saturn, deity Mitra: devotion, friendship and success through cooperation.",
    "Jyeshtha": "ruled by Mercury, deity Indra: seniority, protection and responsibility for others.",
    "Mula": "ruled by Ketu, deity Nirriti: going to the root; research, truth-seeking and letting go.",
    "Purva Ashadha": "ruled by Venus, deity Apas: conviction, persuasion and invincible spirit.",
    "Uttara Ashadha": "ruled by the Sun, deities the Vishvadevas: lasting victory built on principle.",
    "Shravana": "ruled by the Moon, deity Vishnu: listening, learning and connecting people.",
    "Dhanishta": "ruled by Mars, deities the Vasus: rhythm, wealth, music and group success.",
    "Shatabhisha": "ruled by Rahu, deity Varuna: healing, research and an independent mind.",
    "Purva Bhadrapada": "ruled by Jupiter, deity Aja Ekapada: intensity, idealism and transformation.",
    "Uttara Bhadrapada": "ruled by Saturn, deity Ahirbudhnya: depth, patience and spiritual steadiness.",
    "Revati": "ruled by Mercury, deity Pushan: gentleness, guidance and safe journeys.",
}

PLANET_NATURE = {
    "SUN": "authority, vitality, father figures and self-confidence",
    "MOON": "the mind, emotional needs, mother and adaptability",
    "MARS": "drive, courage, property, siblings and decisive action",
    "MERCURY": "intellect, communication, trade, skills and analysis",
    "JUPITER": "wisdom, teachers, children, growth and good fortune",
    "VENUS": "relationships, comfort, art, vehicles and pleasure",
    "SATURN": "discipline, work, endurance, responsibility and slow results",
    "RAHU": "ambition, foreign connections, innovation and the unconventional",
    "KETU": "detachment, intuition, spirituality and specialised insight",
}

DASHA_TEXT = {
    "SUN": "a period about visibility, authority, health of the body and relations with father or seniors; recognition comes through taking responsibility.",
    "MOON": "a period about emotions, home, mother, public dealings and mental peace; outcomes follow your emotional steadiness.",
    "MARS": "a period of energy and initiative: property, siblings, competition, technical work and courage; channel heat into effort, not conflict.",
    "MERCURY": "a period of learning, trade, writing, networking and skills; many small opportunities reward adaptability and clear communication.",
    "JUPITER": "a period of growth, guidance and expansion: learning, children, mentors, faith and finances tend to open up.",
    "VENUS": "a period for relationships, comfort, creativity, vehicles and finance; harmony and enjoyment rise, as does the need for moderation.",
    "SATURN": "a long period of discipline and consolidation: work, duty and patience build durable results, often after delay.",
    "RAHU": "a period of ambition and unusual opportunity, foreign links and rapid change; ground big appetites in clear ethics.",
    "KETU": "a period of introspection, detachment and specialised skill; outer life may simplify while inner insight deepens.",
}

JUPITER_FROM_MOON = {
    1: ("mixed", "Jupiter over your Moon: growth of outlook, but also restlessness, relocation or expense; keep commitments realistic."),
    2: ("good", "Jupiter 2nd from your Moon: classically favourable for income, family harmony and speech."),
    3: ("mixed", "Jupiter 3rd from your Moon: results come through effort; avoid scattering energy."),
    4: ("mixed", "Jupiter 4th from your Moon: domestic or property matters need care; inner peace takes work."),
    5: ("good", "Jupiter 5th from your Moon: favourable for intellect, children, creativity and good counsel."),
    6: ("mixed", "Jupiter 6th from your Moon: competition, health routines and debts need attention."),
    7: ("good", "Jupiter 7th from your Moon: favourable for partnerships, marriage talks and public dealings."),
    8: ("mixed", "Jupiter 8th from your Moon: a period of hidden hurdles; research and caution pay."),
    9: ("good", "Jupiter 9th from your Moon: classically favourable for fortune, mentors, travel and faith."),
    10: ("mixed", "Jupiter 10th from your Moon: changes in work or status; good outcomes need deliberate effort."),
    11: ("good", "Jupiter 11th from your Moon: classically favourable for gains, friends and fulfilled wishes."),
    12: ("mixed", "Jupiter 12th from your Moon: expenses, travel and spiritual pursuits; protect savings."),
}

SATURN_FROM_MOON = {
    1: ("hard", "Saturn over your Moon (Sade Sati peak): heavy responsibilities and emotional load; slow, steady effort works."),
    2: ("hard", "Saturn 2nd from your Moon (Sade Sati, setting): family and financial responsibilities; consolidate and speak carefully."),
    3: ("good", "Saturn 3rd from your Moon: classically favourable; persistent effort, courage and skills pay off."),
    4: ("hard", "Saturn 4th from your Moon (Kantaka Shani): pressure on home, property or peace of mind; plan, don't react."),
    5: ("mixed", "Saturn 5th from your Moon: worry about children or decisions; avoid speculation."),
    6: ("good", "Saturn 6th from your Moon: classically favourable; you outlast competition, debts and illness with routine."),
    7: ("mixed", "Saturn 7th from your Moon: relationships and partnerships need patience and fair terms."),
    8: ("hard", "Saturn 8th from your Moon (Ashtama Shani): a testing time for health and stability; avoid risky moves."),
    9: ("mixed", "Saturn 9th from your Moon: luck feels slower; principles and mentors are tested."),
    10: ("mixed", "Saturn 10th from your Moon: heavy workload and accountability; results come with persistence."),
    11: ("good", "Saturn 11th from your Moon: classically favourable for steady gains and support from networks."),
    12: ("hard", "Saturn 12th from your Moon (Sade Sati, rising): expenses, sleep and letting go; prepare and simplify."),
}

REMEDY = {
    "SUN": {"day": "Sunday", "mantra": "Om Suryaya Namah", "charity": "wheat or jaggery", "practice": "offer water to the rising Sun; keep promises to elders and seniors"},
    "MOON": {"day": "Monday", "mantra": "Om Somaya Namah", "charity": "rice, milk or white cloth", "practice": "regular sleep, time near water, and care for your mother or mother-figures"},
    "MARS": {"day": "Tuesday", "mantra": "Om Angarakaya Namah", "charity": "red lentils", "practice": "daily physical exercise; channel anger into disciplined effort"},
    "MERCURY": {"day": "Wednesday", "mantra": "Om Budhaya Namah", "charity": "green moong or study books", "practice": "study, journalling and honest, careful speech in trade"},
    "JUPITER": {"day": "Thursday", "mantra": "Om Gurave Namah", "charity": "chana dal, turmeric or books", "practice": "respect teachers, learn something meaningful and support education"},
    "VENUS": {"day": "Friday", "mantra": "Om Shukraya Namah", "charity": "white sweets, rice or curd", "practice": "kindness in relationships, art or music, and moderation in pleasures"},
    "SATURN": {"day": "Saturday", "mantra": "Om Shanaischaraya Namah", "charity": "black sesame or mustard oil, or help to labourers and the elderly", "practice": "punctuality, steady routines and service without expectation"},
    "RAHU": {"day": "Saturday", "mantra": "Om Rahave Namah", "charity": "blankets to those in need", "practice": "avoid shortcuts and intoxicants; keep your ambitions ethical"},
    "KETU": {"day": "Tuesday", "mantra": "Om Ketave Namah", "charity": "feeding stray dogs or a multicoloured blanket", "practice": "meditation and letting go of what is complete"},
}

GEM = {
    "SUN": {"stone": "Ruby (Manik)", "alt": "red garnet or red spinel", "metal": "gold or copper", "finger": "ring finger", "day": "Sunday morning"},
    "MOON": {"stone": "Natural pearl (Moti)", "alt": "moonstone", "metal": "silver", "finger": "little finger", "day": "Monday morning"},
    "MARS": {"stone": "Red coral (Moonga)", "alt": "carnelian", "metal": "gold or copper", "finger": "ring finger", "day": "Tuesday morning"},
    "MERCURY": {"stone": "Emerald (Panna)", "alt": "peridot or green tourmaline", "metal": "gold or silver", "finger": "little finger", "day": "Wednesday morning"},
    "JUPITER": {"stone": "Yellow sapphire (Pukhraj)", "alt": "citrine or yellow topaz", "metal": "gold", "finger": "index finger", "day": "Thursday morning"},
    "VENUS": {"stone": "Diamond (Heera) or white sapphire", "alt": "white zircon or opal", "metal": "silver or platinum", "finger": "middle or little finger", "day": "Friday morning"},
    "SATURN": {"stone": "Blue sapphire (Neelam)", "alt": "amethyst or iolite", "metal": "silver or panchdhatu", "finger": "middle finger", "day": "Saturday evening"},
    "RAHU": {"stone": "Hessonite (Gomed)", "alt": "orange zircon", "metal": "silver or panchdhatu", "finger": "middle finger", "day": "Saturday evening"},
    "KETU": {"stone": "Cat's eye (Lehsunia)", "alt": "tiger's eye", "metal": "silver or panchdhatu", "finger": "little or middle finger", "day": "Tuesday or Thursday"},
}

RUDRAKSHA = {
    "SUN": ("1 or 12 mukhi", "Shiva / Surya", "confidence, leadership and vitality"),
    "MOON": ("2 mukhi", "Ardhanarishvara", "emotional balance and harmony in relationships"),
    "MARS": ("3 mukhi", "Agni", "courage, energy and release of past burdens"),
    "MERCURY": ("4 mukhi", "Brahma", "learning, memory and articulate speech"),
    "JUPITER": ("5 mukhi", "Kalagni Rudra", "wisdom, calm and general well-being"),
    "VENUS": ("6 mukhi", "Kartikeya", "willpower, charm and balance in pleasures"),
    "SATURN": ("7 mukhi", "Mahalakshmi", "patience, stability and steady prosperity"),
    "RAHU": ("8 mukhi", "Ganesha", "removing obstacles and clear judgement"),
    "KETU": ("9 mukhi", "Durga", "inner strength and fearlessness"),
}

KAAL_SARP_NAMES = {1: "Anant", 2: "Kulik", 3: "Vasuki", 4: "Shankhpal", 5: "Padma", 6: "Mahapadma", 7: "Takshak",
                   8: "Karkotak", 9: "Shankhachood", 10: "Ghatak", 11: "Vishdhar", 12: "Sheshnag"}

TOPIC_GUIDANCE = {
    "career": {
        "good": ["Ask for responsibility in the windows above; the chart rewards visible ownership.",
                 "Build one signature skill that matches the career outlet described above.",
                 "Document wins — recognition follows evidence."],
        "work": ["Choose roles with structure and a clear ladder over glamorous but unstable ones.",
                 "Use quieter periods to train and certify; act decisively in the dated windows.",
                 "Guard against overcommitting when pressure rises — consistency beats bursts."],
    },
    "marriage": {
        "good": ["Use the windows above for introductions, family conversations and commitments.",
                 "Look for a partner whose temperament matches the 7th-house picture described above.",
                 "Keep communication explicit about money, family roles and timelines."],
        "work": ["Patience pays: rushed decisions are the main risk in this chart.",
                 "Discuss expectations early — family duties, finances and where you will live.",
                 "Compatibility checks are useful, but values and respect matter more than any score."],
    },
    "money": {
        "good": ["Automate savings first; this chart grows wealth through steady accumulation.",
                 "Use the gain windows for negotiations, raises and investments you have researched.",
                 "Diversify — strong periods are best used to build reserves for slower ones."],
        "work": ["Keep a six-month buffer and avoid speculation or lending money casually.",
                 "Grow income through skill and effort rather than shortcuts.",
                 "Review commitments and debts each quarter; small leaks matter here."],
    },
    "property": {
        "good": ["Property or home decisions in the windows above tend to settle well.",
                 "Check documents and title carefully — a supported chart still needs due diligence.",
                 "Improving your current home is also a valid use of a property window."],
        "work": ["Rent or wait rather than stretch finances for a purchase.",
                 "Verify legal papers twice and avoid disputed property.",
                 "Peace at home comes first: invest in the household's harmony before its square footage."],
    },
    "education": {
        "good": ["Pursue the higher qualification or certification you have been considering.",
                 "Teaching or mentoring others will deepen your own learning.",
                 "Time major exams or admissions to the windows above where possible."],
        "work": ["Structured courses with deadlines suit you better than open-ended study.",
                 "Revise steadily; results improve with routine more than with last-minute effort.",
                 "Choose subjects that connect directly to your work or goals."],
    },
    "children": {
        "good": ["Family planning conversations sit well in the windows above.",
                 "Time spent teaching and guiding young people is especially rewarding.",
                 "Creative projects are another expression of this house — nurture them."],
        "work": ["Patience and medical guidance matter more than any timing indication.",
                 "Avoid pressure on yourself or your partner; the chart speaks of timing, not worth.",
                 "Creative and mentoring outlets also fulfil this area of the chart."],
    },
    "health": {
        "good": ["Keep the routines that already work: sleep, movement and regular meals.",
                 "Use strong periods to build fitness reserves for demanding ones.",
                 "Annual check-ups remain wise even when vitality is good."],
        "work": ["Build simple daily routines: sleep, hydration, movement and stress release.",
                 "Seek professional advice early when symptoms appear; this report is not a diagnosis.",
                 "Reduce overwork during demanding transit periods listed in the year-by-year chapter."],
    },
    "foreign": {
        "good": ["Applications for study, work or travel abroad are well placed in the windows above.",
                 "Foreign clients, languages and remote work are natural extensions of this chart.",
                 "Prepare documents early so you can move when the window opens."],
        "work": ["Treat foreign plans as projects with backups rather than single bets.",
                 "Short trips and remote collaboration may suit you better than permanent moves.",
                 "Check visas, contracts and finances carefully before committing."],
    },
    "spiritual": {
        "good": ["A daily practice — even ten minutes — will grow quickly in this chart.",
                 "Pilgrimage, study of scripture or time with a teacher is especially fruitful.",
                 "Service is a natural spiritual outlet for you."],
        "work": ["Keep practice simple and regular rather than intense and occasional.",
                 "Doubt is part of the path here; study and discussion help.",
                 "Grounded service steadies the mind when inner life feels unsettled."],
    },
}
