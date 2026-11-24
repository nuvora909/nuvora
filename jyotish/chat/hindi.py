"""Deterministic Devanagari rendering for the offline reader; fact attributes stay canonical."""
from __future__ import annotations

import re

_FACT = re.compile(r"<fact\b([^>]*)>(.*?)</fact>", re.S)
_ATTR = re.compile(r'(\w+)="([^"]*)"')
_TOKEN = r"QQQ\d+QQQ"

_PLANETS = {
    "SUN": "सूर्य", "MOON": "चंद्रमा", "MARS": "मंगल", "MERCURY": "बुध", "JUPITER": "गुरु",
    "VENUS": "शुक्र", "SATURN": "शनि", "RAHU": "राहु", "KETU": "केतु", "LAGNA": "लग्न",
}
_SIGNS = {
    "Aries": "मेष", "Taurus": "वृषभ", "Gemini": "मिथुन", "Cancer": "कर्क", "Leo": "सिंह",
    "Virgo": "कन्या", "Libra": "तुला", "Scorpio": "वृश्चिक", "Sagittarius": "धनु",
    "Capricorn": "मकर", "Aquarius": "कुंभ", "Pisces": "मीन",
}
_HOUSES = {
    "self, body and direction": "व्यक्तित्व, शरीर और जीवन-दिशा",
    "family, speech and savings": "परिवार, वाणी और बचत",
    "effort, courage and siblings": "पराक्रम, साहस और भाई-बहन",
    "home, mother, property and inner peace": "घर, माता, संपत्ति और मानसिक शांति",
    "intelligence, children and creativity": "बुद्धि, संतान और रचनात्मकता",
    "work routines, health issues, debts and competition": "कार्य-दिनचर्या, स्वास्थ्य-समस्याएँ, ऋण और प्रतिस्पर्धा",
    "partnership and marriage": "साझेदारी और विवाह",
    "transformation, shared money and the hidden": "परिवर्तन, साझा धन और गुप्त विषय",
    "fortune, teachers and dharma": "भाग्य, गुरु और धर्म",
    "career, status and visible work": "करियर, प्रतिष्ठा और सार्वजनिक कार्य",
    "gains, networks and ambitions": "लाभ, संपर्क-जाल और महत्वाकांक्षाएँ",
    "expenses, foreign lands, rest and release": "व्यय, विदेश, विश्राम और मुक्ति",
}
_PLANET_MEANINGS = {
    "authority, vitality and self-confidence": "अधिकार, जीवन-शक्ति और आत्मविश्वास",
    "the mind, adaptation and emotional needs": "मन, अनुकूलन और भावनात्मक ज़रूरतें",
    "drive, property, courage and decisiveness": "प्रेरणा, संपत्ति, साहस और निर्णय-क्षमता",
    "intellect, communication and trade": "बुद्धि, संवाद और व्यापार",
    "wisdom, guidance, children and growth": "ज्ञान, मार्गदर्शन, संतान और वृद्धि",
    "relationships, comfort, vehicles and art": "संबंध, सुख-सुविधा, वाहन और कला",
    "discipline, work, endurance and slow results": "अनुशासन, कार्य, धैर्य और धीमे परिणाम",
    "ambition, foreign connections and the unconventional": "महत्वाकांक्षा, विदेशी संबंध और अपारंपरिकता",
    "detachment, intuition and specialised insight": "वैराग्य, अंतर्ज्ञान और विशिष्ट समझ",
}
_TOPICS = {
    "full life reading": "सम्पूर्ण जीवन-पाठ", "career, business and status": "करियर, व्यवसाय और प्रतिष्ठा",
    "marriage and partnerships": "विवाह और साझेदारी", "wealth, savings and gains": "धन, बचत और लाभ",
    "property, home and vehicles": "संपत्ति, घर और वाहन", "education and learning": "शिक्षा और अध्ययन",
    "children and creativity": "संतान और रचनात्मकता", "foreign travel and residence": "विदेश-यात्रा और निवास",
    "spiritual life and inner growth": "आध्यात्मिक जीवन और आंतरिक विकास",
    "health, vitality and resilience": "स्वास्थ्य, जीवन-शक्ति और सहनशीलता",
    "current dasha and transits": "वर्तमान दशा और गोचर", "yearly predictions": "वार्षिक भविष्यवाणी",
    "monthly predictions": "मासिक भविष्यवाणी", "lifetime predictions": "आजीवन भविष्यवाणी",
}
_VERDICTS = {
    "supportive, with several independent factors pointing the same way": "सहायक है; कई स्वतंत्र कारक एक ही दिशा में संकेत दे रहे हैं",
    "constructive but uneven, with real support and a visible qualification": "रचनात्मक लेकिन असमान है; सहयोग के साथ एक स्पष्ट शर्त भी है",
    "challenging but workable, with effort and timing carrying more weight than luck": "चुनौतीपूर्ण लेकिन संभव है; भाग्य से अधिक प्रयास और समय महत्वपूर्ण हैं",
    "mixed with some friction, so selectivity matters more than speed": "मिश्रित और कुछ बाधाओं वाला है, इसलिए जल्दबाज़ी से अधिक चयनात्मकता ज़रूरी है",
    "finely balanced, with neither an easy yes nor a denial": "बारीक संतुलन में है; न स्पष्ट हाँ है और न इनकार",
}
_VARGA_NAMES = {
    "Dashamsha": "दशांश", "Navamsha": "नवांश", "Dwadashamsha": "द्वादशांश", "Hora": "होरा",
    "Chaturthamsha": "चतुर्थांश", "Saptamsha": "सप्तांश", "Chaturvimshamsha": "चतुर्विंशांश",
    "Vimshamsha": "विंशांश",
}
_VARGA_DOMAINS = {
    "career, status": "करियर, प्रतिष्ठा", "marriage, dharma": "विवाह, धर्म", "wealth": "धन",
    "property, fortune": "संपत्ति, भाग्य", "children": "संतान", "education": "शिक्षा",
    "spiritual life": "आध्यात्मिक जीवन",
}
_NAKSHATRAS = {
    "Ashwini": "अश्विनी", "Bharani": "भरणी", "Krittika": "कृत्तिका", "Rohini": "रोहिणी",
    "Mrigashira": "मृगशिरा", "Ardra": "आर्द्रा", "Punarvasu": "पुनर्वसु", "Pushya": "पुष्य",
    "Ashlesha": "आश्लेषा", "Magha": "मघा", "Purva Phalguni": "पूर्व फाल्गुनी",
    "Uttara Phalguni": "उत्तर फाल्गुनी", "Hasta": "हस्त", "Chitra": "चित्रा", "Swati": "स्वाति",
    "Vishakha": "विशाखा", "Anuradha": "अनुराधा", "Jyeshtha": "ज्येष्ठा", "Mula": "मूल",
    "Purva Ashadha": "पूर्वाषाढ़ा", "Uttara Ashadha": "उत्तराषाढ़ा", "Shravana": "श्रवण",
    "Dhanishta": "धनिष्ठा", "Dhanishtha": "धनिष्ठा", "Shatabhisha": "शतभिषा",
    "Purva Bhadrapada": "पूर्व भाद्रपद", "Uttara Bhadrapada": "उत्तर भाद्रपद", "Revati": "रेवती",
}
_YOGAS = {
    "Ruchaka Yoga": "रुचक योग", "Bhadra Yoga": "भद्र योग", "Hamsa Yoga": "हंस योग",
    "Malavya Yoga": "मालव्य योग", "Sasa Yoga": "शश योग", "Gajakesari Yoga": "गजकेसरी योग",
    "Budhaditya Yoga": "बुधादित्य योग", "Chandra-Mangala Yoga": "चंद्र-मंगल योग",
    "Dhana Yoga": "धन योग", "Raja Yoga": "राजयोग", "Anapha Yoga": "अनफा योग",
    "Sunapha Yoga": "सुनफा योग", "Durudhara Yoga": "दुरुधरा योग", "Adhi Yoga": "अधि योग",
}

_LABELS = {
    **{f"a well-anchored {n}{suffix} lord": f"{n}वें भाव का स्वामी मजबूत स्थिति में है"
       for n, suffix in [(1, "st"), (2, "nd"), (3, "rd")] + [(n, "th") for n in range(4, 13)]},
    **{f"dignity of the {n}{suffix} lord": f"{n}वें भाव के स्वामी की गरिमा"
       for n, suffix in [(1, "st"), (2, "nd"), (3, "rd")] + [(n, "th") for n in range(4, 13)]},
    **{f"debilitation of the {n}{suffix} lord": f"{n}वें भाव के स्वामी की नीच स्थिति"
       for n, suffix in [(1, "st"), (2, "nd"), (3, "rd")] + [(n, "th") for n in range(4, 13)]},
    **{f"combustion of the {n}{suffix} lord": f"{n}वें भाव का स्वामी अस्त है"
       for n, suffix in [(1, "st"), (2, "nd"), (3, "rd")] + [(n, "th") for n in range(4, 13)]},
}

_PHRASES = {
    "### Bottom line": "### मुख्य निष्कर्ष",
    "### Prashna — chart at the time of your question": "### प्रश्नावली — आपके प्रश्न के समय की कुंडली",
    "### Core pattern": "### मूल स्वरूप",
    "### Why the chart points this way": "### कुंडली ऐसा संकेत क्यों दे रही है",
    "### Natural significators": "### प्राकृतिक कारक",
    "### What this means in practice": "### इसका व्यावहारिक अर्थ",
    "### What pushes back": "### कौन-से कारक विरोध करते हैं",
    "#### Running periods": "#### चल रही दशाएँ",
    "#### Most relevant windows ahead": "#### आगे की सबसे प्रासंगिक अवधियाँ",
    "#### Slow-transit context": "#### धीमे गोचर का संदर्भ",
    "### Timing — natal promise versus activation": "### समय — जन्म-कुंडली की संभावना और दशा-सक्रियण",
    "### How to use this": "### इसका उपयोग कैसे करें",
    "### Birth-time and decision limits": "### जन्म-समय और निर्णय की सीमाएँ",
    "**Confidence:**": "**विश्वास-स्तर:**",
    "Question asked at": "प्रश्न पूछने का समय",
    "**Location used:**": "**प्रयुक्त स्थान:**",
    "This is the saved chart location because no current location was supplied.": "वर्तमान स्थान उपलब्ध न होने के कारण सहेजी गई कुंडली का स्थान प्रयोग किया गया है।",
    "For this specific decision, the Prashna houses are": "इस विशेष निर्णय के लिए प्रश्नावली के भाव",
    "H1 represents you; the topic houses describe the choice. This is a separate question-time chart, not a replacement for your natal promise or practical checks.": "पहला भाव आपका और विषय-भाव आपके विकल्प का प्रतिनिधित्व करते हैं। यह प्रश्न-समय की अलग कुंडली है; यह जन्म-कुंडली की संभावनाओं या व्यावहारिक जाँच का विकल्प नहीं है।",
    "For **joining this company or accepting this role**": "**इस कंपनी में शामिल होने या यह भूमिका स्वीकार करने** के लिए",
    "For **this decision**": "**इस निर्णय** के लिए",
    "the question-time Prashna is": "प्रश्न-समय की प्रश्नावली",
    "while the natal topic pattern is": "जबकि जन्म-कुंडली का विषय-संबंधी स्वरूप",
    "The Prashna evidence leans **toward waiting or renegotiating rather than joining immediately**.": "प्रश्नावली **तुरंत शामिल होने के बजाय प्रतीक्षा या पुनः बातचीत** की ओर झुकती है।",
    "The Prashna evidence leans **toward waiting rather than committing immediately**.": "प्रश्नावली **तुरंत प्रतिबद्ध होने के बजाय प्रतीक्षा** की ओर झुकती है।",
    "The combined evidence leans **toward joining**, provided the role, manager, pay and written terms check out.": "संयुक्त संकेत **शामिल होने की ओर** हैं, बशर्ते भूमिका, प्रबंधक, वेतन और लिखित शर्तें उचित हों।",
    "The combined evidence leans **toward proceeding**, subject to the practical facts checking out.": "व्यावहारिक तथ्य सही निकलने पर संयुक्त संकेत **आगे बढ़ने की ओर** हैं।",
    "The natal pattern supports the move, but the Prashna confirmation is modest: **join only after checking the specific offer**.": "जन्म-कुंडली इस बदलाव का सहयोग करती है, लेकिन प्रश्नावली की पुष्टि सीमित है: **विशेष प्रस्ताव की जाँच के बाद ही शामिल हों**।",
    "The natal pattern supports proceeding, but the Prashna confirmation is modest.": "जन्म-कुंडली आगे बढ़ने का सहयोग करती है, लेकिन प्रश्नावली की पुष्टि सीमित है।",
    "There is **no clean yes or no**; clarify the role, manager, pay and stability before deciding.": "**स्पष्ट हाँ या नहीं** नहीं है; निर्णय से पहले भूमिका, प्रबंधक, वेतन और स्थिरता स्पष्ट करें।",
    "There is **no clean yes or no**; gather the missing practical facts before deciding.": "**स्पष्ट हाँ या नहीं** नहीं है; निर्णय से पहले लुप्त व्यावहारिक तथ्य जुटाएँ।",
    "This is a rule-based astrological lean, not a guarantee or a substitute for due diligence.": "यह नियम-आधारित ज्योतिषीय झुकाव है, गारंटी या आवश्यक जाँच-पड़ताल का विकल्प नहीं।",
    "The clearest natal support is": "जन्म-कुंडली का सबसे स्पष्ट सहयोग यह है कि",
    "the main natal qualification is": "मुख्य शर्त यह है कि",
    "The clearest support is": "सबसे स्पष्ट सहयोग यह है कि",
    "the main qualification is": "मुख्य शर्त यह है कि",
    "The evidence is mostly neutral": "संकेत अधिकतर तटस्थ हैं",
    ", with no major internal contradiction among the factors examined. ": " और जाँचे गए कारकों में कोई बड़ा आंतरिक विरोधाभास नहीं है। ",
    "This is a reading of tendencies and activation periods, not a promise that an event must occur.": "यह प्रवृत्तियों और सक्रियण-अवधियों का पाठ है, किसी घटना के अवश्य घटित होने का वादा नहीं।",
    "That is a kendra (angular) placement: the house lord can express itself visibly and connect this topic to the larger life direction.": "यह केंद्र भाव में स्थिति है: भाव-स्वामी स्पष्ट रूप से प्रभाव दिखा सकता है और इस विषय को जीवन की बड़ी दिशा से जोड़ सकता है।",
    "That is a trikona (trinal) placement: the house lord can express itself visibly and connect this topic to the larger life direction.": "यह त्रिकोण भाव में स्थिति है: भाव-स्वामी स्पष्ट रूप से प्रभाव दिखा सकता है और इस विषय को जीवन की बड़ी दिशा से जोड़ सकता है।",
    "A difficult-house lord operating through another difficult house can turn pressure into problem-solving, but usually after disruption or adjustment.": "कठिन भाव का स्वामी किसी अन्य कठिन भाव में दबाव को समस्या-समाधान में बदल सकता है, पर सामान्यतः उथल-पुथल या समायोजन के बाद।",
    "The lord is neither especially anchored nor in a dusthana, so surrounding support and timing matter more than the placement alone.": "स्वामी न विशेष रूप से मजबूत है और न दुःस्थान में; इसलिए केवल स्थिति से अधिक आसपास का सहयोग और समय महत्वपूर्ण हैं।",
    "Dignity reinforces it:": "गरिमा इसे मजबूत करती है:",
    "Combustion adds friction:": "अस्त होना बाधा बढ़ाता है:",
    "Its agenda can be overshadowed by authority, urgency or competing priorities.": "अधिकार, जल्दबाज़ी या प्रतिस्पर्धी प्राथमिकताओं से इसके प्रभाव पर साया पड़ सकता है।",
    "In an upachaya (growth-through-effort) house, this is better read as pressure that can become productive with discipline.": "उपचय भाव में, अर्थात् प्रयास से वृद्धि वाले भाव में, इसे ऐसे दबाव के रूप में पढ़ना बेहतर है जो अनुशासन से उपयोगी बन सकता है।",
    "This does not deny results, but it makes consistency and realistic expectations important.": "इससे परिणाम नहीं नहीं मिलते, लेकिन निरंतरता और यथार्थ अपेक्षाएँ महत्वपूर्ण हो जाती हैं।",
    "Protective influence comes from": "सुरक्षात्मक प्रभाव मिलता है",
    "; Jupiter's aspect in particular tends to preserve and enlarge what it touches.": "; विशेषकर गुरु की दृष्टि जिसे छूती है उसे संरक्षित और विस्तारित करने की प्रवृत्ति रखती है।",
    "There is also demanding influence:": "साथ में कठिन प्रभाव भी है:",
    "This favours endurance and structure, but can make the area feel effortful.": "यह धैर्य और संरचना का सहयोग करता है, पर इस क्षेत्र में अधिक प्रयास करना पड़ सकता है।",
    "above the 28-bindu reference, so transits have a comparatively supportive field to work through.": "28 बिंदुओं के संदर्भ से अधिक हैं, इसलिए गोचर को तुलनात्मक रूप से सहायक आधार मिलता है।",
    "below the 28-bindu reference. Helpful periods may still deliver, but usually with less margin for error.": "28 बिंदुओं के संदर्भ से कम हैं। सहायक अवधियाँ फिर भी परिणाम दे सकती हैं, पर गलती की गुंजाइश कम रहती है।",
    "close to the middle range rather than an extreme.": "किसी चरम के बजाय मध्यम सीमा के करीब हैं।",
    "It reinforces the natal promise rather than merely describing the topic.": "यह केवल विषय का वर्णन न करके जन्म-कुंडली की संभावना को मजबूत करता है।",
    "It makes the topic more conditional: support, maturity and timing matter before the promise expresses cleanly.": "इससे विषय अधिक सशर्त हो जाता है: संभावना के स्पष्ट रूप लेने से पहले सहयोग, परिपक्वता और समय महत्वपूर्ण हैं।",
    "It neither clearly overrides nor cancels the house evidence; it adds a secondary, mixed confirmation.": "यह भाव-संकेतों को स्पष्ट रूप से न रद्द करता है और न उन पर भारी पड़ता है; यह द्वितीयक, मिश्रित पुष्टि जोड़ता है।",
    "On this structural comparison, D1 and": "इस संरचनात्मक तुलना में D1 और",
    "both lean constructive, so the divisional chart confirms rather than dilutes the D1 indication.": "दोनों रचनात्मक दिशा में हैं, इसलिए विभाजीय कुंडली D1 के संकेत को कमज़ोर करने के बजाय उसकी पुष्टि करती है।",
    "both require effort or adjustment, so the D1 constraint should not be explained away.": "दोनों में प्रयास या समायोजन चाहिए, इसलिए D1 की सीमा को नज़रअंदाज़ नहीं करना चाहिए।",
    "one layer is more cooperative than the other, so expect mixed expression rather than a simple yes or no.": "एक स्तर दूसरे से अधिक सहयोगी है, इसलिए सरल हाँ या नहीं के बजाय मिश्रित अभिव्यक्ति अपेक्षित है।",
    "at least one layer is neutral or mixed, making this a qualified confirmation rather than a decisive one.": "कम से कम एक स्तर तटस्थ या मिश्रित है, इसलिए यह निर्णायक न होकर सशर्त पुष्टि है।",
    "The strongest pushback is": "सबसे मजबूत विरोधी कारक है",
    "It does not erase the supportive factors; it changes how they are likely to operate. Expect better results from preparation, clear boundaries and realistic sequencing than from treating one favourable placement as sufficient.": "यह सहायक कारकों को मिटाता नहीं, बल्कि उनकी कार्यशैली बदलता है। एक अनुकूल स्थिति को पर्याप्त मानने के बजाय तैयारी, स्पष्ट सीमाओं और यथार्थ क्रम से बेहतर परिणाम अपेक्षित हैं।",
    "No single strong contradictory factor dominates the houses examined. The limitation is different: a balanced chart still needs a relevant dasha and practical action, and balance should not be mistaken for certainty.": "जाँचे गए भावों में कोई एक मजबूत विरोधी कारक प्रमुख नहीं है। सीमा अलग है: संतुलित कुंडली को भी प्रासंगिक दशा और व्यावहारिक कार्रवाई चाहिए; संतुलन को निश्चितता न समझें।",
    "Mahadasha": "महादशा", "Antardasha": "अंतर्दशा", "Pratyantardasha": "प्रत्यंतर्दशा",
    "sets the long-term agenda": "दीर्घकालीन दिशा तय करती है",
    "describes the present delivery channel": "वर्तमान परिणाम-मार्ग बताती है",
    "acts as the short-term trigger": "अल्पकालीन सक्रियण करती है",
    "The repeated lord concentrates the same agenda instead of introducing a new one.": "स्वामी दोहराने से नई दिशा के बजाय उसी विषय पर एकाग्रता बढ़ती है।",
    "layer emphasises": "स्तर इस पर बल देता है:",
    "directly activates": "सीधे सक्रिय करता है:",
    "occupies a core house:": "मुख्य भाव में स्थित है:",
    "supports through": "इनके माध्यम से सहयोग:",
    "occupies a supporting house:": "सहायक भाव में स्थित है:",
    "works indirectly; watch its sub-periods rather than expecting this topic to dominate": "अप्रत्यक्ष रूप से कार्य करता है; इस विषय के प्रमुख होने की अपेक्षा के बजाय इसकी उप-दशाओं को देखें",
    "| Period | Activation | Timing read |": "| अवधि | सक्रियण | समय-पाठ |",
    "Direct activation; moderate confidence": "प्रत्यक्ष सक्रियण; मध्यम विश्वास",
    "Supporting activation; low–moderate confidence": "सहायक सक्रियण; कम से मध्यम विश्वास",
    "Background chapter; use its sub-periods for specific timing": "पृष्ठभूमि का अध्याय; विशिष्ट समय के लिए इसकी उप-दशाएँ देखें",
    "These are **activation windows, not guaranteed events**. A direct period brings the topic forward; whether the result is easy or demanding still depends on the natal evidence above.": "ये **सक्रियण-अवधियाँ हैं, गारंटीशुदा घटनाएँ नहीं**। प्रत्यक्ष दशा विषय को अग्रणी बनाती है; परिणाम सहज होगा या प्रयासपूर्ण, यह ऊपर दिए जन्म-कुंडली संकेतों पर निर्भर है।",
    "No sub-period lord in the selected horizon has a direct house connection to this topic. That argues against forcing a date: use the current-period agenda and transit calendar instead.": "चुनी गई अवधि में किसी उप-दशा स्वामी का इस विषय से प्रत्यक्ष भाव-संबंध नहीं है। इसलिए तारीख थोपने के बजाय वर्तमान दशा की दिशा और गोचर-पंचांग का उपयोग करें।",
    "This directly touches the houses being read, so it can make the topic more visible now.": "यह सीधे पढ़े जा रहे भावों को छूता है, इसलिए विषय अभी अधिक सक्रिय दिख सकता है।",
    "This touches a supporting area rather than the core house, so its effect is likely to be indirect.": "यह मुख्य भाव के बजाय सहायक क्षेत्र को छूता है, इसलिए प्रभाव संभवतः अप्रत्यक्ष होगा।",
    "This is background climate for the question, not the main trigger.": "यह प्रश्न की पृष्ठभूमि है, मुख्य सक्रियण नहीं।",
    "Treat it as a discipline and simplification cycle, not as a curse or a guaranteed loss.": "इसे अनुशासन और सरलीकरण का चक्र समझें, श्राप या निश्चित हानि नहीं।",
    "at the report date.": "रिपोर्ट की तारीख पर।",
    "The engine's slow-transit calendar then marks": "इसके बाद इंजन का धीमा गोचर-पंचांग दर्शाता है:",
    "Use these as review dates around the dasha windows, not standalone promises.": "इन्हें दशा-अवधियों के आसपास समीक्षा की तारीखें मानें, स्वतंत्र वादे नहीं।",
    "Short-term sign changes:": "अल्पकालीन राशि-परिवर्तन:",
    "These colour shorter phases within the dasha; they do not override the natal promise.": "ये दशा के भीतर छोटे चरणों को प्रभावित करते हैं; जन्म-कुंडली की संभावना पर भारी नहीं पड़ते।",
    "The D10 ascendant is": "D10 लग्न", "The D9 ascendant is": "D9 लग्न", "The D7 ascendant is": "D7 लग्न",
    "to birth time": "जन्म-समय के प्रति",
    "minutes away, so that divisional confirmation is provisional.": "मिनट की दूरी पर बदलता है, इसलिए विभाजीय पुष्टि अनंतिम है।",
    "The Moon nakshatra is": "चंद्रमा का नक्षत्र",
    "Dasha dates shift about": "दशा की तारीखें लगभग",
    "days per 10 minutes of birth-time error, so widen the timing windows.": "दिन प्रति 10 मिनट की जन्म-समय त्रुटि से बदलती हैं, इसलिए समय-अवधियाँ चौड़ी रखें।",
    "This is not a medical assessment. Symptoms, screening, medication and treatment belong with a qualified clinician; the chart is used here only to reflect on routines, resilience and stress management.": "यह चिकित्सकीय मूल्यांकन नहीं है। लक्षण, जाँच, दवा और उपचार के लिए योग्य चिकित्सक से परामर्श करें; कुंडली का उपयोग यहाँ केवल दिनचर्या, सहनशीलता और तनाव-प्रबंधन पर विचार के लिए है।",
    "This is not investment, tax or debt advice. Use a qualified financial professional for actual decisions; a favourable astrological window is not evidence that a particular asset or loan is suitable.": "यह निवेश, कर या ऋण-परामर्श नहीं है। वास्तविक निर्णयों के लिए योग्य वित्तीय विशेषज्ञ से सलाह लें; अनुकूल ज्योतिषीय अवधि किसी संपत्ति या ऋण की उपयुक्तता का प्रमाण नहीं।",
    "Nothing here guarantees fertility, pregnancy or a child's outcome. Medical and care decisions belong with qualified professionals.": "यहाँ प्रजनन-क्षमता, गर्भावस्था या संतान के परिणाम की कोई गारंटी नहीं है। चिकित्सा और देखभाल के निर्णय योग्य विशेषज्ञों के साथ करें।",
    "the conclusion rests on D1, dasha and transit evidence": "निष्कर्ष D1, दशा और गोचर के प्रमाणों पर आधारित है",
    ", but a flagged birth-time factor limits precision": ", लेकिन चिह्नित जन्म-समय कारक सटीकता सीमित करता है",
    "; the deterministic reader is transparent about rules but cannot replace astrologer-level judgement": "; नियम-आधारित पाठक के नियम पारदर्शी हैं, लेकिन यह अनुभवी ज्योतिषी के निर्णय का स्थान नहीं ले सकता",
    "agree": "सहमत हैं", "do not fully agree": "पूरी तरह सहमत नहीं हैं", "partly agree": "आंशिक रूप से सहमत हैं",
    "fragile": "अत्यधिक संवेदनशील", "sensitive": "संवेदनशील",
    "results tend to come through adjustment, delay or behind-the-scenes effort rather than a straight line.": "परिणाम सीधी राह से अधिक समायोजन, देरी या पर्दे के पीछे के प्रयास से आते हैं।",
    "so that divisional confirmation is provisional.": "इसलिए विभाजीय पुष्टि अनंतिम है।",
    "D1 and": "D1 और",
    "retention, reserves and family-resource management": "बचत, आरक्षित धन और पारिवारिक संसाधन-प्रबंधन",
    "income channels, networks and gains": "आय के मार्ग, संपर्क-जाल और लाभ",
    "mentors, education and longer-range opportunity": "मार्गदर्शक, शिक्षा और दीर्घकालीन अवसर",
    "structured foundations and consistent study": "संगठित आधार और नियमित अध्ययन",
    "conceptual ability, problem-solving and creative application": "वैचारिक क्षमता, समस्या-समाधान और रचनात्मक अनुप्रयोग",
    "higher learning, teachers and a well-chosen specialisation": "उच्च शिक्षा, शिक्षक और सोच-समझकर चुनी गई विशेषज्ञता",
    "spouse, dharma, strength of planets": "जीवनसाथी, धर्म, ग्रहों की सामर्थ्य",
    "education, learning": "शिक्षा, अध्ययन", "spiritual practice": "आध्यात्मिक साधना",
}

_ACTIONS = {
    "Build around the factors that repeat across D1 and the divisional charts, not around one dramatic placement.": "किसी एक नाटकीय स्थिति के बजाय D1 और विभाजीय कुंडलियों में बार-बार आने वाले कारकों को आधार बनाएँ।",
    "Use the stronger dasha windows for important initiatives and the quieter ones for preparation.": "मजबूत दशा-अवधियों में महत्वपूर्ण पहल और शांत अवधियों में तैयारी करें।",
    "Revisit the reading when the mahadasha changes; the same natal promise is expressed differently by period.": "महादशा बदलने पर पाठ फिर देखें; एक ही जन्म-संभावना हर अवधि में अलग रूप लेती है।",
    "Keep a visible record of results and skills; this makes supportive periods easier to convert into offers or recognition.": "परिणामों और कौशल का स्पष्ट रिकॉर्ड रखें; सहायक अवधियों को प्रस्ताव या पहचान में बदलना आसान होगा।",
    "Prepare qualifications, portfolio and contacts before a strong window instead of waiting for it to arrive.": "मजबूत अवधि की प्रतीक्षा के बजाय पहले से योग्यता, पोर्टफोलियो और संपर्क तैयार करें।",
    "Do not make an irreversible job decision from astrology alone; test the opportunity against role, manager and finances.": "केवल ज्योतिष से अपरिवर्तनीय नौकरी-निर्णय न लें; अवसर को भूमिका, प्रबंधक और आर्थिक स्थिति से परखें।",
    "Discuss expectations, money, family boundaries and conflict habits explicitly; a chart cannot replace that conversation.": "अपेक्षाओं, धन, पारिवारिक सीमाओं और विवाद की आदतों पर खुलकर बात करें; कुंडली उस संवाद का स्थान नहीं ले सकती।",
    "Use supportive periods for introductions, engagement and formal commitment, not as a deadline.": "सहायक अवधियों को परिचय, सगाई और औपचारिक प्रतिबद्धता के लिए उपयोग करें, समय-सीमा के रूप में नहीं।",
    "Do not use a placement or dosha to label a partner or to decide whether to leave or stay.": "साथी को ठहराने या रिश्ते में रहने-छोड़ने का निर्णय किसी स्थिति या दोष के आधार पर न करें।",
    "Track cash flow and reserves first; a favourable wealth indication is not a reason to increase leverage.": "पहले नकदी-प्रवाह और बचत देखें; अनुकूल धन-संकेत अधिक ऋण लेने का कारण नहीं है।",
    "Separate earned income, speculative gains and shared or inherited money; they come from different houses.": "कमाई, सट्टा-लाभ तथा साझा या विरासत का धन अलग समझें; ये अलग भावों से जुड़े हैं।",
    "Use a qualified financial adviser for actual investment, tax and debt decisions.": "वास्तविक निवेश, कर और ऋण के निर्णयों के लिए योग्य वित्तीय सलाहकार से परामर्श करें।",
    "Treat a favourable period as a time for inspection, finance preparation and negotiation, not automatic ownership.": "अनुकूल अवधि को निरीक्षण, वित्त-तैयारी और बातचीत का समय मानें, स्वतः स्वामित्व नहीं।",
    "Check title, legal documents, location and affordability independently of the chart.": "कुंडली से स्वतंत्र रूप से स्वामित्व-अधिकार, कानूनी दस्तावेज़, स्थान और किफ़ायती होना जाँचें।",
    "Distinguish a desire to move from the suitability of a particular property.": "स्थान बदलने की इच्छा और किसी विशेष संपत्ति की उपयुक्तता में अंतर रखें।",
    "Choose a field that matches the repeated learning pattern, then validate it with aptitude and real exposure.": "बार-बार दिखने वाले सीखने के स्वरूप से मेल खाता क्षेत्र चुनें, फिर योग्यता और वास्तविक अनुभव से उसे परखें।",
    "Use supportive periods for applications and examinations; use slower ones for foundations and revision.": "सहायक अवधियों में आवेदन और परीक्षाएँ, धीमी अवधियों में आधार और दोहराव पर ध्यान दें।",
    "Measure progress with work samples and feedback, not only with the reading.": "केवल पाठ से नहीं, कार्य-नमूनों और प्रतिक्रिया से प्रगति मापें।",
    "For fertility, pregnancy or a child's health, rely on qualified medical care rather than a birth chart.": "प्रजनन-क्षमता, गर्भावस्था या संतान-स्वास्थ्य के लिए जन्म-कुंडली के बजाय योग्य चिकित्सा पर भरोसा करें।",
    "Read the fifth house as creativity and mentorship too; its promise is not limited to biological children.": "पाँचवें भाव को रचनात्मकता और मार्गदर्शन से भी पढ़ें; इसकी संभावना केवल जैविक संतान तक सीमित नहीं।",
    "Use supportive periods for planning and preparation without treating them as guarantees.": "सहायक अवधियों में योजना और तैयारी करें, पर उन्हें गारंटी न मानें।",
    "Separate short travel, a work assignment and permanent relocation; they need different practical preparation.": "छोटी यात्रा, कार्य-नियुक्ति और स्थायी स्थानांतरण अलग रखें; तीनों की व्यावहारिक तैयारी अलग है।",
    "Check visas, employment, language and support networks before treating a period as a relocation window.": "किसी अवधि को स्थानांतरण की अवधि मानने से पहले वीज़ा, रोज़गार, भाषा और सहयोग-जाल जाँचें।",
    "Consider whether the move improves the whole life pattern, not only the wish to escape a current difficulty.": "देखें कि स्थानांतरण समग्र जीवन सुधारता है या केवल वर्तमान कठिनाई से बचने की इच्छा है।",
    "Prefer a sustainable practice and a trustworthy teacher over intense but inconsistent effort.": "तीव्र लेकिन अनियमित प्रयास से बेहतर टिकाऊ साधना और विश्वसनीय गुरु चुनें।",
    "Keep spiritual discernment grounded in ethics, evidence and everyday responsibilities.": "आध्यात्मिक विवेक को नैतिकता, प्रमाण और दैनिक जिम्मेदारियों से जोड़े रखें।",
    "Use reflective periods for study and service rather than withdrawing from necessary medical or practical help.": "चिंतनशील अवधियों का उपयोग अध्ययन और सेवा में करें; आवश्यक चिकित्सकीय या व्यावहारिक सहायता से दूर न हों।",
    "Use the reading only to reflect on routines, rest and stress; it cannot diagnose or rule out illness.": "पाठ का उपयोग केवल दिनचर्या, विश्राम और तनाव पर विचार के लिए करें; यह बीमारी का निदान या निषेध नहीं कर सकता।",
    "Seek a qualified clinician for symptoms, screening, medication and treatment decisions.": "लक्षण, जाँच, दवा और उपचार के निर्णयों के लिए योग्य चिकित्सक से मिलें।",
    "Choose sustainable sleep, food and movement habits rather than drastic regimens.": "कठोर नियमों के बजाय टिकाऊ नींद, भोजन और गतिविधि की आदतें चुनें।",
    "Work with the current period's agenda instead of expecting every area of life to move at once.": "जीवन के हर क्षेत्र में एक साथ गति की अपेक्षा के बजाय वर्तमान दशा की दिशा के अनुरूप काम करें।",
    "Use sub-period changes as review points for plans already under way.": "उप-दशा बदलने को चल रही योजनाओं की समीक्षा-बिंदु बनाएँ।",
    "Allow a wider timing margin if the birth-time sensitivity report flags the Moon nakshatra.": "जन्म-समय संवेदनशीलता रिपोर्ट चंद्र-नक्षत्र चिह्नित करे तो समय में अधिक गुंजाइश रखें।",
    "Choose two or three priorities for the year; a transit calendar is useful only when tied to real decisions.": "वर्ष की दो-तीन प्राथमिकताएँ चुनें; गोचर-पंचांग वास्तविक निर्णयों से जुड़ने पर ही उपयोगी है।",
    "Review plans at antardasha and major ingress dates rather than treating every day as equally active.": "हर दिन को समान रूप से सक्रिय मानने के बजाय अंतर्दशा और प्रमुख राशि-प्रवेश की तारीखों पर योजनाओं की समीक्षा करें।",
    "Keep the forecast provisional where birth-time sensitivity affects dasha dates.": "जहाँ जन्म-समय संवेदनशीलता दशा-तारीखों को प्रभावित करे, पूर्वानुमान अनंतिम रखें।",
    "Pick one priority for the month and use the dated periods as planning windows, not fixed event dates.": "महीने की एक प्राथमिकता चुनें और तारीखों वाली अवधियों को योजना-अवधि मानें, निश्चित घटना-तारीख नहीं।",
    "Keep routine decisions reversible around demanding periods and avoid treating a quiet week as a denial.": "कठिन अवधियों के आसपास सामान्य निर्णय बदलने योग्य रखें और शांत सप्ताह को इनकार न मानें।",
    "Recheck the forecast after the next antardasha or pratyantardasha change; short timing is especially birth-time sensitive.": "अगली अंतर्दशा या प्रत्यंतर्दशा बदलने पर पूर्वानुमान फिर जाँचें; अल्पकालीन समय जन्म-समय के प्रति विशेष संवेदनशील है।",
    "Treat each mahadasha as a chapter with an agenda, not a guarantee of marriage, wealth, illness or any other event.": "हर महादशा को एक दिशा वाला अध्याय समझें, विवाह, धन, बीमारी या किसी घटना की गारंटी नहीं।",
    "Build durable skills, relationships and reserves that remain useful when the ruling planet and chapter change.": "ऐसे टिकाऊ कौशल, संबंध और बचत बनाएँ जो स्वामी ग्रह और अध्याय बदलने पर भी उपयोगी रहें।",
    "Return to the detailed yearly reading before making a time-sensitive decision; a lifetime map is deliberately broad.": "समय-संवेदनशील निर्णय से पहले विस्तृत वार्षिक पाठ देखें; आजीवन मानचित्र जानबूझकर व्यापक है।",
}

_PRACTICAL = {
    "Visible ownership, leadership or independent responsibility has the stronger base here. That can be expressed inside a job; it does not automatically mean entrepreneurship. Test a business through a bounded pilot during a direct 10th/11th-house period, with cash flow and demand checked separately.": "स्पष्ट उत्तरदायित्व, नेतृत्व या स्वतंत्र जिम्मेदारी का आधार यहाँ मजबूत है। यह नौकरी के भीतर भी व्यक्त हो सकता है; इसका अर्थ स्वतः उद्यमिता नहीं। प्रत्यक्ष दशम/एकादश भाव की दशा में सीमित परीक्षण से व्यवसाय जाँचें और नकदी-प्रवाह व माँग अलग से परखें।",
    "A structured role is the more reliable foundation because service and status are closely linked. Independent work is not denied, but it should build on an established skill, reputation and network rather than a desire to escape an unsuitable role.": "सेवा और प्रतिष्ठा का घनिष्ठ संबंध होने से संगठित भूमिका अधिक भरोसेमंद आधार है। स्वतंत्र कार्य नहीं नहीं है, लेकिन वह अनुपयुक्त भूमिका से बचने के बजाय स्थापित कौशल, प्रतिष्ठा और संपर्क-जाल पर बना हो।",
    "Distance and foreign connections have the clearer activation channel, while the home base needs a deliberate plan. Separate an extended assignment from permanent relocation: the first tests the opportunity without prematurely disturbing the second.": "दूरी और विदेशी संबंधों का सक्रियण-मार्ग अधिक स्पष्ट है, जबकि घर के आधार के लिए सोची-समझी योजना चाहिए। लंबी नियुक्ति और स्थायी स्थानांतरण अलग रखें; पहला अवसर परखता है बिना दूसरे को समय से पहले प्रभावित किए।",
    "The home base remains an important anchor, so travel may be easier to support than permanent relocation. A move becomes more credible when the career, visa and support-network pieces improve together, not from the 12th-house indication alone.": "घर का आधार महत्वपूर्ण बना रहता है, इसलिए स्थायी स्थानांतरण से अधिक यात्रा का सहयोग आसान हो सकता है। केवल द्वादश भाव से नहीं, करियर, वीज़ा और सहयोग-जाल के साथ सुधरने पर स्थानांतरण अधिक विश्वसनीय बनता है।",
    "The practical reading is about resilience, not disease: stabilise daily routines first, respect recovery periods and use demanding phases as reminders for appropriate screening or clinical advice. No house or period here can diagnose an illness.": "व्यावहारिक पाठ बीमारी के बजाय सहनशीलता के बारे में है: पहले दिनचर्या स्थिर करें, रिकवरी का समय दें और कठिन चरणों को उचित जाँच या चिकित्सकीय सलाह का स्मरण मानें। कोई भाव या दशा बीमारी का निदान नहीं कर सकती।",
}


def _ordinal(value: str) -> str:
    return re.match(r"\d+", value).group(0)


def _planet(name: str) -> str:
    return _PLANETS.get(name.upper(), name)


def _dasha_lords(value: str) -> str:
    return "-".join(_planet(x) for x in value.split("-"))


def _fact_text(kind: str, a: dict, original: str) -> str:
    p = _planet(a.get("planet", ""))
    house = _ordinal(a.get("house", a.get("in_house", "0")))
    chart = a.get("chart", "")
    suffix = f" ({chart})" if chart.startswith("D") else ""
    if kind == "lagna":
        return f"{chart + ' ' if chart.startswith('D') else ''}{_SIGNS.get(a.get('sign'), a.get('sign'))} लग्न"
    if kind == "placement":
        return f"{p} {_SIGNS.get(a.get('sign'), a.get('sign'))} राशि में, {house}वें भाव में{suffix}"
    if kind == "house_lord":
        if "in_house" not in a:
            return f"भाव {house} का स्वामी {_planet(a.get('lord', ''))}"
        return f"{house}वें भाव का स्वामी {_planet(a.get('lord', ''))}, {_ordinal(a['in_house'])}वें भाव में"
    if kind == "aspect":
        if "target" in a:
            return f"{p} की {_planet(a['target'])} पर दृष्टि"
        return f"{p} की {house}वें भाव पर दृष्टि"
    if kind == "conjunction":
        names = [_planet(x.strip()) for x in re.split(r",| and ", a.get("planets", ""))]
        return " और ".join(names) + " की युति"
    if kind == "dignity":
        status = {"exalted": "उच्च का", "debilitated": "नीच का", "own": "अपनी राशि में",
                  "moolatrikona": "मूलत्रिकोण में", "great friend": "अधिमित्र राशि में", "friend": "मित्र राशि में",
                  "neutral": "सम राशि में", "enemy": "शत्रु राशि में", "great enemy": "अधिशत्रु राशि में"}.get(a.get("status"), a.get("status"))
        return f"{p} {status} है{suffix}"
    if kind == "combust":
        return f"{p} अस्त है" if a.get("value") == "true" else f"{p} अस्त नहीं है"
    if kind == "retrograde":
        return f"{p} वक्री है" if a.get("value") == "true" else f"{p} वक्री नहीं है"
    if kind == "sav":
        return f"{house}वें भाव में सर्वाष्टकवर्ग के {a.get('value')} बिंदु"
    if kind == "dasha":
        period = _dasha_lords(a.get("lords", ""))
        if a.get("start") and a.get("end"):
            return f"{period} दशा ({a['start']} से {a['end']} तक)"
        return f"{period} दशा"
    if kind == "transit":
        origin = "लग्न" if a.get("from", "lagna") == "lagna" else "चंद्रमा"
        return f"{p} का {_SIGNS.get(a.get('sign'), a.get('sign'))} राशि में गोचर, {origin} से {house}वें भाव में"
    if kind == "sade_sati":
        return "साढ़ेसाती चल रही है" if a.get("active") == "true" else "साढ़ेसाती नहीं चल रही है"
    if kind == "nakshatra":
        name = _NAKSHATRAS.get(a.get("name"), a.get("name"))
        pada = f", चरण {a['pada']}" if a.get("pada") else ""
        return f"{p} {name} नक्षत्र में{pada}" if p else f"{name} नक्षत्र{pada}"
    if kind == "yoga":
        return _YOGAS.get(a.get("name"), a.get("name", original).replace("Yoga", "योग"))
    if kind == "strength":
        label = {"strong": "बलवान", "clear": "स्पष्ट बल में", "adequate": "पर्याप्त बल में", "weak": "कमज़ोर"}.get(a.get("label"), a.get("label"))
        return f"{p} {label} ({a.get('score')}/100)"
    if kind == "sensitivity":
        rating = _PHRASES.get(a.get("rating"), a.get("rating"))
        factor = a.get("factor", "")
        if factor.endswith("_lagna"):
            number = {"navamsha_lagna": 9, "dashamsha_lagna": 10, "saptamsha_lagna": 7}.get(factor)
            label = f"D{number} लग्न" if number else "लग्न"
        else:
            label = "चंद्रमा का नक्षत्र"
        return f"{label} जन्म-समय के प्रति {rating} है"
    return original


def _regex_rules(text: str) -> str:
    q = f"({_TOKEN})"
    rules = [
        (r"For \*\*(.+?)\*\*, the chart is", r"\1 के लिए, कुंडली"),
        (r"\*\*Confidence:\*\* low", "**विश्वास-स्तर:** कम"),
        (r"\*\*Confidence:\*\* moderate", "**विश्वास-स्तर:** मध्यम"),
        (r"\*\*Confidence:\*\* high", "**विश्वास-स्तर:** उच्च"),
        (r"The clearest channel for progress is (.+?), while (.+?) needs more deliberate management\. Use the stronger area to support the weaker one instead of expecting every part of the topic to develop at the same speed\.",
         r"प्रगति का सबसे स्पष्ट मार्ग \1 है, जबकि \2 को अधिक सचेत प्रबंधन चाहिए। विषय के हर पहलू में एक गति की अपेक्षा के बजाय मजबूत क्षेत्र से कमज़ोर क्षेत्र को सहारा दें।"),
        (r"The main area to work consciously is (.+?); the evidence is mixed rather than one-sided\.",
         r"सचेत रूप से काम करने का मुख्य क्षेत्र \1 है; संकेत एकतरफा न होकर मिश्रित हैं।"),
        (r"The more useful wealth lever is (.+?)\. Treat earning, saving and speculation as different processes: a good gains period cannot compensate for weak reserves, and no dasha makes an unsuitable investment safe\.",
         r"धन का अधिक उपयोगी मार्ग \1 है। कमाई, बचत और सट्टे को अलग प्रक्रियाएँ मानें: अच्छी लाभ-अवधि कमज़ोर बचत की भरपाई नहीं कर सकती और कोई दशा अनुपयुक्त निवेश को सुरक्षित नहीं बनाती।"),
        (r"The learning pattern is best approached through (.+?)\. Choose courses by testing that strength in real work; use the slower periods for revision and credentials rather than interpreting them as a denial of education\.",
         r"सीखने के स्वरूप को \1 के माध्यम से आगे बढ़ाना बेहतर है। वास्तविक कार्य में इस क्षमता को परखकर पाठ्यक्रम चुनें; धीमी अवधियों को शिक्षा का इनकार मानने के बजाय दोहराव और प्रमाणपत्र के लिए उपयोग करें।"),
        (r"benefic aspects to the (\d+)(?:st|nd|rd|th) house", r"\1वें भाव पर शुभ दृष्टियाँ"),
        (r"demanding aspects to the (\d+)(?:st|nd|rd|th) house", r"\1वें भाव पर कठिन दृष्टियाँ"),
        (r"benefic support inside the (\d+)(?:st|nd|rd|th) house", r"\1वें भाव में शुभ ग्रहों का सहयोग"),
        (r"productive pressure in the (\d+)(?:st|nd|rd|th) house", r"\1वें भाव में उपयोगी दबाव"),
        (r"malefic pressure on the (\d+)(?:st|nd|rd|th) house", r"\1वें भाव पर अशुभ दबाव"),
        (r"above-average SAV support in the (\d+)(?:st|nd|rd|th) house", r"\1वें भाव में औसत से अधिक सर्वाष्टकवर्ग सहयोग"),
        (r"lower SAV support in the (\d+)(?:st|nd|rd|th) house", r"\1वें भाव में कम सर्वाष्टकवर्ग सहयोग"),
        (r"average SAV support in the (\d+)(?:st|nd|rd|th) house", r"\1वें भाव में औसत सर्वाष्टकवर्ग सहयोग"),
        (r"a neutral setting for the (\d+)(?:st|nd|rd|th) lord", r"\1वें भाव के स्वामी की तटस्थ स्थिति"),
        (r"the (\d+)(?:st|nd|rd|th) lord works through a demanding house", r"\1वें भाव का स्वामी कठिन भाव में कार्य करता है"),
        (r"the (\d+)(?:st|nd|rd|th) lord falls in a demanding house", r"\1वें भाव का स्वामी कठिन भाव में है"),
        (r"The (\w+) layer emphasises", r"\1 स्तर इस पर बल देता है:"),
        (rf"Within Nuvora's transparent strength heuristic, {q}\. This is not classical Shadbala or a probability; the placement, dignity, house and condition factors above explain the rating\.",
         r"नुवोरा के पारदर्शी बल-आकलन में \1। यह शास्त्रीय षड्बल या संभाव्यता नहीं है; ऊपर दिए गए स्थान, गरिमा, भाव और स्थिति के कारक इस रेटिंग को समझाते हैं।"),
        (rf"The Prashna ascendant is {q}, and the question-time Moon is {q}\.",
         r"प्रश्नावली का लग्न \1 है और प्रश्न-समय का चंद्रमा \2 है।"),
        (r"\*\*Prashna H(\d+):\*\*", r"**प्रश्नावली भाव \1:**"),
        (rf"The (\d+)(?:st|nd|rd|th) house \(([^)]+)\) begins with {q}\.",
         r"\1वें भाव (\2) में \3 है।"),
        (r"\*\*H(\d+) — ([^*]+)\.\*\*", r"**भाव \1 — \2।**"),
        (r"Its lord works through the (\d+)(?:st|nd|rd|th) house, a dusthana:",
         r"इसका स्वामी \1वें भाव में है, जो दुःस्थान है:"),
        (rf"Dignity is the qualification: {q}, so the lord needs support from other factors rather than being read as automatically strong\.",
         r"गरिमा मुख्य शर्त है: \1, इसलिए स्वामी को अपने-आप मजबूत मानने के बजाय अन्य कारकों के सहयोग की ज़रूरत है।"),
        (rf"Benefic occupation supports the house through (.+?)\.", r"भाव में शुभ ग्रहों की स्थिति \1 के माध्यम से सहयोग देती है।"),
        (rf"The house also contains (.+?)\. In an upachaya", r"इस भाव में \1 भी हैं। उपचय"),
        (rf"The house carries greater pressure from (.+?)\. This does not", r"भाव पर \1 से अधिक दबाव है। This does not"),
        (rf"The house has {q},", r"भाव में \1,"),
        (rf"For D(\d+) ([^ ]+) \(([^)]+)\), the chart has {q}\.",
         r"D\1 \2 (\3) के लिए, कुंडली में \4 है।"),
        (rf"The same planet, (\w+), rules both the D(\d+) ascendant and its focus house; it appears as {q}\.",
         r"एक ही ग्रह, \1, D\2 लग्न और उसके केंद्र-भाव दोनों का स्वामी है; यह \3 है।"),
        (rf"The D(\d+) lagna lord appears as {q}, while the (\d+)(?:st|nd|rd|th) lord of D\1 appears as {q}\.",
         r"D\1 लग्न का स्वामी \2 है, जबकि D\1 के \3वें भाव का स्वामी \4 है।"),
        (r"For D(\d+) ", r"विभाजीय-कुंडली पुष्टि — D\1 "),
        (r"### Divisional-chart confirmation — D(\d+)", r"### विभाजीय-कुंडली पुष्टि — D\1"),
        (r"(\w+) entering (\w+) on (\d{4}-\d{2}-\d{2}) \((\d+)(?:st|nd|rd|th) from lagna, (\d+)(?:st|nd|rd|th) from Moon\)",
         r"\1 का \2 राशि में \3 को प्रवेश (लग्न से \4वाँ, चंद्रमा से \5वाँ)"),
        (r"(\w+) enters (\w+) on (\d{4}-\d{2}-\d{2}) \((\d+)(?:st|nd|rd|th) from lagna\)",
         r"\1 का \2 राशि में \3 को प्रवेश (लग्न से \4वाँ)"),
        (r"it changes ([\d.]+) minutes away", r"यह \1 मिनट की दूरी पर बदलता है"),
        (r"D(\d+) is more birth-time dependent than D1 and has no dedicated sensitivity metric in this report; use it as secondary confirmation rather than the sole basis for a decision\.",
         r"D\1, D1 से अधिक जन्म-समय पर निर्भर है और इस रिपोर्ट में इसका अलग संवेदनशीलता माप नहीं है; निर्णय का एकमात्र आधार न बनाकर द्वितीयक पुष्टि के रूप में उपयोग करें।"),
        (r"setting \((\d+)(?:st|nd|rd|th) phase\)", r"समाप्ति चरण (\1/3)"),
        (r"rising \((\d+)(?:st|nd|rd|th) phase\)", r"प्रारंभिक चरण (\1/3)"),
        (r"peak \((\d+)(?:st|nd|rd|th) phase\)", r"मध्य चरण (\1/3)"),
    ]
    for pattern, replacement in rules:
        text = re.sub(pattern, replacement, text)
    return text


# Phrasing used by the current classic offline composition (headings were renamed after the table above).
_PHRASES_CURRENT = {
    "### In a nutshell": "### मुख्य निष्कर्ष",
    "### What the chart shows": "### कुंडली ऐसा संकेत क्यों दे रही है",
    "### The planets at play": "### प्राकृतिक कारक",
    "### What this means for you": "### इसका व्यावहारिक अर्थ",
    "### What to watch": "### कौन-से कारक विरोध करते हैं",
    "### Timing — when things may activate": "### समय — कब सक्रियता आ सकती है",
    "### How to use this reading": "### इसका उपयोग कैसे करें",
    "### A note on timing and decisions": "### जन्म-समय और निर्णय की सीमाएँ",
    "### Your chart's foundation": "### मूल स्वरूप",
    "### Foreign interest and adjustment": "### विदेश की रुचि और अनुकूलन",
    "### D4 cross-check": "### D4 से पुष्टि",
    "### Practical checks": "### व्यावहारिक जाँच",
    "**Right now:**": "**अभी:**",
    "**Windows ahead:**": "**आगे की अवधियाँ:**",
    "**Transit context:**": "**गोचर का संदर्भ:**",
    "**A gentle reminder:**": "**एक विनम्र स्मरण:**",
    "A gentle reminder": "एक विनम्र स्मरण",
    "above the 28-bindu reference. This is one supportive factor, not a guarantee.":
        "28 बिंदुओं के संदर्भ-स्तर से ऊपर है। यह एक सहायक कारक है, गारंटी नहीं।",
    "below the 28-bindu reference. Treat this as a qualification, not a prediction of failure.":
        "28 बिंदुओं के संदर्भ-स्तर से नीचे है। इसे एक शर्त के रूप में देखें, असफलता की भविष्यवाणी के रूप में नहीं।",
    "close to the middle range rather than an extreme.": "जो किसी अति के बजाय मध्य स्तर के करीब है।",
    "This is one supportive factor, not a guarantee": "यह एक सहायक कारक है, गारंटी नहीं",
    "Treat this as a qualification, not a prediction of failure": "इसे एक शर्त के रूप में देखें, असफलता की भविष्यवाणी के रूप में नहीं",
    "The ruling planet sits in a prominent or supportive house, connecting this topic to other important parts of life.":
        "भाव-स्वामी एक प्रमुख या सहायक भाव में बैठा है, जो इस विषय को जीवन के अन्य महत्वपूर्ण क्षेत्रों से जोड़ता है।",
    "The lord's placement is not a strong support or obstacle by itself, so the surrounding factors matter more.":
        "भाव-स्वामी की स्थिति अपने-आप में न बड़ा सहारा है न बाधा, इसलिए आसपास के कारक अधिक महत्वपूर्ण हैं।",
    "This can bring friction, delays, or extra effort in this area.": "इससे इस क्षेत्र में घर्षण, विलंब या अतिरिक्त प्रयास की ज़रूरत आ सकती है।",
    "This strengthens the ruling planet's ability to support the topic:": "इससे भाव-स्वामी की इस विषय को सहयोग देने की क्षमता बढ़ती है:",
    "can add a protective influence, but it does not remove other conditions": "एक सुरक्षात्मक प्रभाव जोड़ सकता है, पर अन्य शर्तों को समाप्त नहीं करता",
    "The house carries greater pressure from": "इस भाव पर अधिक दबाव है:",
    "This adds pressure and can make results less straightforward; it is not a denial by itself.":
        "इससे दबाव बढ़ता है और परिणाम सीधे नहीं रहते; यह अपने-आप में इनकार नहीं है।",
    "Its lord is placed in the": "इसका स्वामी स्थित है",
    "house, a traditionally demanding area; progress may need extra planning or behind-the-scenes effort.":
        "भाव में, जो परंपरागत रूप से कठिन क्षेत्र है; प्रगति के लिए अतिरिक्त योजना या पर्दे के पीछे का प्रयास चाहिए।",
    "The clearest support comes from": "सबसे स्पष्ट सहयोग यहाँ से आता है:",
    "The main qualification is": "मुख्य शर्त यह है:",
    "The main thing to watch is": "सबसे अधिक ध्यान देने योग्य बात है",
    "It doesn't cancel out the supportive factors, but it changes how they express themselves.":
        "यह सहायक कारकों को समाप्त नहीं करता, पर उनके प्रकट होने का ढंग बदल देता है।",
    "You'll get better results by preparing well, setting clear boundaries, and pacing yourself realistically — not by counting on one favourable placement.":
        "अच्छी तैयारी, स्पष्ट सीमाएँ और यथार्थवादी गति से बेहतर परिणाम मिलेंगे — किसी एक अनुकूल स्थिति पर निर्भर रहने से नहीं।",
    "with a birth-time factor limiting precision": "जन्म-समय से जुड़ा एक कारक सटीकता को सीमित करता है",
    "based on D1, dasha, and transit evidence": "D1, दशा और गोचर के प्रमाणों पर आधारित",
    "the reading follows transparent rules but can't replace an astrologer's judgement or your own discernment":
        "यह पाठ पारदर्शी नियमों पर चलता है, पर किसी ज्योतिषी के विवेक या आपकी अपनी समझ का विकल्प नहीं है",
    "This isn't investment, tax, or debt advice. Please consult a qualified financial professional for actual decisions. A favourable astrological window doesn't mean a particular asset or loan is right for you.":
        "यह निवेश, कर या ऋण की सलाह नहीं है। वास्तविक निर्णयों के लिए किसी योग्य वित्तीय विशेषज्ञ से परामर्श करें। अनुकूल ज्योतिषीय अवधि का अर्थ यह नहीं कि कोई विशेष संपत्ति या ऋण आपके लिए सही है।",
    "Nothing here guarantees fertility, pregnancy, or a child's outcome. Medical and care decisions belong with qualified professionals.":
        "यहाँ कुछ भी प्रजनन, गर्भावस्था या संतान के परिणाम की गारंटी नहीं देता। चिकित्सा और देखभाल के निर्णय योग्य विशेषज्ञों के साथ लें।",
    "This isn't a medical assessment. Symptoms, screening, medication, and treatment belong with a qualified clinician. The chart is here to help you reflect on routines, resilience, and stress management.":
        "यह चिकित्सकीय आकलन नहीं है। लक्षण, जाँच, दवा और उपचार के निर्णय योग्य चिकित्सक के साथ लें। कुंडली केवल दिनचर्या, सहनशीलता और तनाव-प्रबंधन पर विचार करने में मदद करती है।",
    "This isn't immigration or visa advice. The chart can highlight themes, but visa eligibility, work routes, finances, and family needs need separate, practical verification.":
        "यह आप्रवासन या वीज़ा की सलाह नहीं है। कुंडली विषयों को उजागर कर सकती है, पर वीज़ा-पात्रता, काम के रास्ते, धन और परिवार की ज़रूरतों की अलग व्यावहारिक जाँच चाहिए।",
    "The chart shows foreign themes, but a lasting move depends on how those indicators combine with your home and career picture — a 12th-house placement alone doesn't guarantee permanent settlement.":
        "कुंडली में विदेश से जुड़े विषय दिखते हैं, पर स्थायी बदलाव इस पर निर्भर करता है कि ये संकेत घर और करियर के चित्र से कैसे जुड़ते हैं — केवल 12वें भाव की स्थिति स्थायी बसने की गारंटी नहीं है।",
    "can make foreign settings more prominent in the chart, but it's not proof of a move.":
        "कुंडली में विदेशी परिवेश को अधिक प्रमुख बना सकता है, पर यह बदलाव का प्रमाण नहीं है।",
    "points to everyday routines and work demands as part of how adjustment might feel.":
        "दिखाता है कि रोज़मर्रा की दिनचर्या और काम की माँगें अनुकूलन के अनुभव का हिस्सा होंगी।",
    "Neither placement tells you which country, visa route, or outcome to expect.":
        "कोई भी स्थिति यह नहीं बताती कि कौन-सा देश, वीज़ा मार्ग या परिणाम अपेक्षित है।",
    "Before making plans, confirm visa eligibility, a realistic work or study route, finances, housing, family needs, and support at the destination. Treat the chart as a reflection tool, not a substitute for those checks.":
        "योजना बनाने से पहले वीज़ा-पात्रता, काम या पढ़ाई का यथार्थवादी मार्ग, धन, आवास, परिवार की ज़रूरतें और गंतव्य पर सहयोग की पुष्टि करें। कुंडली को विचार का साधन मानें, इन जाँचों का विकल्प नहीं।",
    "short trips": "छोटी यात्राएँ", "long-distance journeys": "लंबी दूरी की यात्राएँ",
    "foreign stays": "विदेश-प्रवास", "home and settlement": "घर और स्थायी निवास",
    "the indicators are mixed": "संकेत मिश्रित हैं", "with a birth-time limitation": "जन्म-समय की सीमा के साथ",
    "Treat D4 as secondary, especially if the recorded birth time is uncertain.":
        "D4 को द्वितीयक प्रमाण मानें, विशेषकर यदि दर्ज जन्म-समय अनिश्चित हो।",
}

# The classic bottom line: "For your question[ about <topic>], the chart leans <verdict>."
_CURRENT_VERDICTS = {
    "well-supported, with several factors pointing the same way": "सुदृढ़ सहयोग की ओर है; कई कारक एक ही दिशा में संकेत दे रहे हैं",
    "somewhat supportive, with a clear qualification": "कुछ हद तक सहायक है, पर एक स्पष्ट शर्त के साथ",
    "challenging, with significant friction to manage": "चुनौतीपूर्ण है; संभालने योग्य बड़ा घर्षण है",
    "mixed, with some friction": "मिश्रित है, कुछ बाधाओं के साथ",
    "mixed or balanced, without a clear yes or no": "मिश्रित या संतुलित है; न स्पष्ट हाँ है न ना",
}


def _bottom_line_rules(text: str) -> str:
    text = re.sub(r"The (\d+)(?:st|nd|rd|th) lord is ", r"\1वें भाव का स्वामी: ", text)
    for verdict, hindi in _CURRENT_VERDICTS.items():
        text = re.sub(rf"For your question about ([^,]+), the chart leans {re.escape(verdict)}\.",
                      lambda m: f"{_TOPICS.get(m.group(1), m.group(1))} से जुड़े आपके प्रश्न पर कुंडली का झुकाव {hindi}।", text)
        text = text.replace(f"For your question, the chart leans {verdict}.", f"आपके प्रश्न पर कुंडली का झुकाव {hindi}।")
        text = text.replace(f"The chart leans {verdict} on foreign travel or settlement.",
                            f"विदेश-यात्रा या स्थायी निवास पर कुंडली का झुकाव {hindi}।")
    return text


def translate_reading(text: str) -> str:
    facts = []

    def protect(match):
        attrs = match.group(1)
        values = dict(_ATTR.findall(attrs))
        facts.append(f'<fact{attrs}>{_fact_text(values.get("kind", ""), values, match.group(2))}</fact>')
        return f"QQQ{len(facts) - 1}QQQ"

    text = _FACT.sub(protect, text)
    text = _bottom_line_rules(text)
    text = _regex_rules(text)
    for source, target in _PRACTICAL.items():
        text = text.replace(source, target)
    phrases = {**_HOUSES, **_PLANET_MEANINGS, **_TOPICS, **_VERDICTS, **_LABELS, **_PHRASES, **_ACTIONS,
               **_PHRASES_CURRENT}
    for source in sorted(phrases, key=len, reverse=True):
        text = text.replace(source, phrases[source])
    text = re.sub(r"\b(\d+)(?:st|nd|rd|th) house\b", r"\1वाँ भाव", text)
    for name, hindi in {**_VARGA_DOMAINS, **_VARGA_NAMES}.items():
        text = text.replace(name, hindi)
    for name, hindi in {**_PLANETS, **_SIGNS}.items():
        text = re.sub(rf"\b{name.title()}\b", hindi, text)
    text = re.sub(r"(?<=[^\d])\.(?=\s|$)", "।", text)
    for index, fact in enumerate(facts):
        text = text.replace(f"QQQ{index}QQQ", fact)
    return text
