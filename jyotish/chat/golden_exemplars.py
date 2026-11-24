"""Hand-written golden readings: the quality bar the AI reader is shown and tested against.

These are not generated. Each one was written as an experienced Parashari astrologer would answer,
for one fixed reference chart, then checked fact-by-fact by the same verifier that checks live
answers (tests/test_golden.py fails if any tag stops matching the engine or the quality score drops).

Reference chart: "Aarav", 1 January 1990, 12:00 IST, New Delhi (28.6139 N, 77.2090 E), Lahiri,
whole-sign houses, true node; question date 24 November 2026. The same chart is cross-checked
against an independent Swiss-Ephemeris product in tests/test_known_chart.py.

What makes them golden:
- the first paragraph answers the question with a calibrated lean and a central theme;
- every chart fact is followed by what it means for the person (cause, not catalogue);
- the strongest counterweight is named and explained, not buried;
- timing windows come from dasha activation x Jupiter-Saturn double transit, each with its reason;
- next steps are concrete and within the person's control; confidence describes evidence quality.
"""
from __future__ import annotations

from datetime import datetime, timezone

REFERENCE_BIRTH = dict(year=1990, month=1, day=1, hour=12, minute=0, lat=28.6139, lon=77.2090,
                       tz_name="Asia/Kolkata", name="Aarav", place="New Delhi, India")
REFERENCE_ASKED_AT = datetime(2026, 11, 24, 6, 0, tzinfo=timezone.utc)

EXEMPLARS: dict[str, dict[str, str]] = {}

EXEMPLARS["career"] = {
    "question": "How does my career look, and when will it move forward?",
    "answer": """### The short answer

Your career is supported, and its shape is distinctive: it grows from a stable base rather than from frequent change. The chart ties your professional standing to foundations — education, property, institutions or work you can run from a settled place — and to building something that lasts. The catch is pace: this is a slow-maturing career that rewards consolidation more than early speed.

### Why the chart says this

The pivotal factor is <fact kind="house_lord" house="10" lord="Jupiter" in_house="4">your 10th lord Jupiter sitting in the 4th house</fact>. When the planet that rules your career sits in the house of home, learning and inner security, work tends to grow out of a secure base: an institution you stay with, a field connected to education or property, or a role anchored in one place. Jupiter also rules your <fact kind="lagna" sign="Pisces">Pisces ascendant</fact>, so career and identity are run by the same planet — what you do and who you are are hard to separate.

Two factors back this up. <fact kind="sav" house="10" value="32">Your 10th house carries 32 Ashtakavarga bindus</fact>, well above the average of 28, which means transits through your career house tend to land constructively. And <fact kind="conjunction" planets="Sun,Saturn">the Sun and Saturn together in your 10th house</fact> give a career built on responsibility and authority. Saturn is also your <fact kind="karaka" role="Atmakaraka" planet="Saturn">Atmakaraka</fact>, the planet of the soul's central lesson, so work is not just a job for you; it is where your character gets tested and recognised.

### What pushes back

<fact kind="dignity" planet="Jupiter" status="debilitated" chart="D9">Jupiter is debilitated in your navamsha</fact>, the chart of maturity. That is why recognition can lag behind effort: the promise is real, but it has to be consolidated rather than trusted to carry you on its own. And <fact kind="combust" planet="Saturn" value="true">Saturn is combust</fact>, very close to the Sun, so your work can sit in the shadow of a dominant manager, institution or someone else's agenda for years before it becomes visibly yours.

The career chart agrees with the main picture: <fact kind="placement" planet="Jupiter" sign="Virgo" house="7" chart="D10">Jupiter, ruler of the D10 ascendant, sits in the 7th house of D10</fact>, which favours clients, partners and consulting over solitary work. Treat it as secondary evidence, because <fact kind="sensitivity" factor="dashamsha_lagna" rating="fragile">the D10 ascendant is fragile to birth time</fact>.

### Timing

You are in <fact kind="dasha" lords="Saturn" start="2024-02-09" end="2043-02-09">Saturn's major period (2024 to 2043)</fact>, and Saturn sits in your 10th house — so these two decades are career-defining whether you push or not. Three windows stand out, because in each a career-linked period coincides with Jupiter and Saturn reaching your career house or its lord together, the classical double-transit trigger:

1. **Now until late January 2027**, inside <fact kind="dasha" lords="Saturn-Saturn" start="2024-02-09" end="2027-02-12">Saturn–Saturn</fact>: <fact kind="transit" planet="Jupiter" sign="Leo" date="2026-12-25">Jupiter in Leo</fact> and <fact kind="transit" planet="Saturn" sign="Pisces" date="2026-12-25">Saturn in Pisces</fact> both reach your 10th house. This suits a promotion conversation, a change of role or a formal commitment.
2. **February to July 2028**, inside <fact kind="dasha" lords="Saturn-Mercury" start="2027-02-12" end="2029-10-22">Saturn–Mercury</fact>: <fact kind="transit" planet="Jupiter" sign="Leo" date="2028-05-12">Jupiter in Leo</fact> and <fact kind="transit" planet="Saturn" sign="Aries" date="2028-05-12">Saturn in Aries</fact> touch both your 10th house and its lord. Mercury sits in your 11th house of gains, so this window favours income and networks more than titles.
3. **October 2029 to January 2030**, inside <fact kind="dasha" lords="Saturn-Ketu" start="2029-10-22" end="2030-12-01">Saturn–Ketu</fact>: a shorter trigger, better for specialising or narrowing your focus than for expansion.

### What to do with this

- Choose depth over breadth: stay long enough in one field or institution to own a body of work.
- Before late January 2027, put your case for more responsibility on record — documented results, not goodwill.
- Use 2027 to build skills and contacts, so the 2028 window has something to convert.
- If a business idea appears, test it as a partnership or consultancy first; the career chart favours working with clients.

**Confidence:** moderate — the birth chart, the career chart, the running dasha and the double transits all point the same way, but the D10 and the exact dates depend on a birth time that is only reliable to a few minutes.""",
}

EXEMPLARS["marriage"] = {
    "question": "What does my chart say about marriage, and when could it happen?",
    "answer": """### The short answer

Partnership is well supported in your chart, and it is likely to come through your wider circle — friends, colleagues, communities and shared goals — rather than out of nowhere. The main qualification is timing and temperament: commitment matures with time, and it works best with someone who treats the relationship as a shared project.

### Why the chart says this

<fact kind="house_lord" house="7" lord="Mercury" in_house="11">Your 7th lord Mercury sits in the 11th house</fact>, the house of friends, networks and ambitions. Classically this connects a partner with your social and professional circle, and it tends to make partnership a source of gains and fulfilled goals rather than a retreat from them. Mercury is also your <fact kind="karaka" role="Darakaraka" planet="Mercury">Darakaraka</fact>, the planet that describes the partner in the Jaimini system, which reinforces the picture of someone communicative, practical and intellectually engaged.

Two things make this signature steadier than it first looks. <fact kind="vargottama" planet="Mercury" value="true">Mercury is vargottama</fact>, holding the same sign in the birth chart and the navamsha, which gives its promises staying power. And <fact kind="sav" house="7" value="30">your 7th house carries 30 Ashtakavarga bindus</fact>, above average, so supportive transits through the partnership house tend to work in your favour.

### What pushes back

<fact kind="aspect" planet="Saturn" house="7">Saturn aspects your 7th house</fact>. Saturn's influence slows things down and asks for seriousness: early relationships may feel heavy or conditional, and a lasting commitment usually arrives once you and your partner both have your footing. <fact kind="retrograde" planet="Mercury" value="true">Mercury is retrograde</fact>, which often shows reconsideration — a connection that returns, or a decision you revisit before you are sure.

The navamsha, the classical marriage chart, only partly agrees: its 7th lord <fact kind="placement" planet="Venus" sign="Aries" house="6" chart="D9">Venus sits in the 6th house of the navamsha</fact>, a house of routines and friction, so day-to-day fairness — chores, money, family duties — needs explicit handling. Hold this lightly too, since <fact kind="sensitivity" factor="navamsha_lagna" rating="fragile">the navamsha ascendant is fragile to birth time</fact>.

### Timing

The clearest chapter is <fact kind="dasha" lords="Saturn-Mercury" start="2027-02-12" end="2029-10-22">Saturn–Mercury (February 2027 to October 2029)</fact>, because Mercury rules your 7th house and is your Darakaraka: the period brings partnership questions to the front. Inside it, two transits sharpen the timing:

1. From late November 2027, <fact kind="transit" planet="Jupiter" sign="Virgo" house="7" from="lagna" date="2027-12-15">Jupiter transits Virgo, your 7th house</fact>, which classically opens the door to introductions and proposals.
2. **July to December 2028** is the strongest window: <fact kind="transit" planet="Jupiter" sign="Virgo" date="2028-10-01">Jupiter in Virgo</fact> and <fact kind="transit" planet="Saturn" sign="Aries" date="2028-10-01">Saturn in Aries</fact> both reach your 7th lord — the double transit that classically turns a promising period into a formal step.

Later, <fact kind="dasha" lords="Saturn-Venus" start="2030-12-01" end="2034-01-30">Saturn–Venus (2030 to 2034)</fact> brings Venus, the natural significator of partnership, into play; it suits deepening a commitment more than starting one.

### What to do with this

- Let your existing circle work for you: introductions through friends, colleagues and communities fit your chart better than chance meetings.
- Talk through money, family expectations and household roles early; the navamsha says those everyday details decide the long run.
- If a past connection resurfaces, give it a fair second look, but decide on present facts, not nostalgia.
- Treat 2027–2028 as the period to be open and available, not as a deadline.

**Confidence:** moderate — the birth chart, the running dasha and the double transit agree, but the navamsha is only partly supportive and depends on a birth time accurate to a couple of minutes.""",
}

EXEMPLARS["money"] = {
    "question": "Will I build wealth, and where does my money really come from?",
    "answer": """### The short answer

Your wealth picture is strong, and it is built on principle and expertise rather than luck or speculation. Money comes most reliably through knowledge, mentors, teaching, law, advice or work that spans distance, and it grows steadily over the long Saturn period you are now in. The weak spot is not earning; it is holding on to what you earn.

### Why the chart says this

<fact kind="house_lord" house="2" lord="Mars" in_house="9">Your 2nd lord Mars sits in the 9th house</fact>, linking your savings and family resources with fortune, mentors and higher learning. Mars is also strong: <fact kind="dignity" planet="Mars" status="own">Mars is in its own sign</fact>, and <fact kind="dignity" planet="Mars" status="own" chart="D9">it stays in its own sign in the navamsha</fact>. A wealth lord that is strong in both charts tends to deliver more with age, not less — your financial base should be noticeably firmer in your forties than in your thirties.

Your gains house is crowded with ambition: <fact kind="placement" planet="Mercury" sign="Capricorn" house="11">Mercury</fact>, <fact kind="placement" planet="Venus" sign="Capricorn" house="11">Venus</fact> and <fact kind="placement" planet="Rahu" sign="Capricorn" house="11">Rahu all sit in your 11th house</fact>. That gives several income channels — networks, technology, creative or client work — and an appetite for growth. The engine also confirms a <fact kind="yoga" name="Dhana" present="true">Dhana yoga</fact> formed by your ascendant lord and your gains lord, and it is active in the current period.

### What pushes back

<fact kind="sav" house="12" value="20">Your 12th house has only 20 Ashtakavarga bindus</fact>, the lowest in your chart, and it holds your Moon. The 12th is the house of spending, so money leaks through expenses, generosity, travel or comfort-driven purchases unless saving is automatic. And <fact kind="combust" planet="Saturn" value="true">Saturn, your 11th lord, is combust</fact>: your gains are tied to an employer or institution, and others may take visible credit for income you help generate.

### Timing

You are in <fact kind="dasha" lords="Saturn" start="2024-02-09" end="2043-02-09">Saturn's major period</fact>, and Saturn rules your 11th house of gains, so this is a long accumulation chapter — slow but cumulative. Two windows stand out:

1. **February to July 2028**, inside <fact kind="dasha" lords="Saturn-Mercury" start="2027-02-12" end="2029-10-22">Saturn–Mercury</fact>: Mercury sits in your gains house, and <fact kind="transit" planet="Jupiter" sign="Leo" date="2028-05-12">Jupiter in Leo</fact> with <fact kind="transit" planet="Saturn" sign="Aries" date="2028-05-12">Saturn in Aries</fact> both reach your 2nd house — a double transit on the house of savings, good for a raise, a better contract or a significant purchase you have planned for.
2. **2031**, inside <fact kind="dasha" lords="Saturn-Venus" start="2030-12-01" end="2034-01-30">Saturn–Venus</fact>: Venus also sits in your gains house, and the double transit returns to your 2nd lord, favouring consolidation — paying down debt, building reserves.

### What to do with this

- Automate saving before spending; your chart's weak point is outflow, not inflow.
- Invest in expertise you can charge for — certifications, publications, advisory work — since the 9th-house link pays through knowledge.
- Keep written records of the value you create at work, so combust-Saturn credit leaks are visible.
- Use the 2028 window for negotiated income gains, and take investment decisions with a qualified financial adviser, never from a transit alone.

**Confidence:** moderate — the birth chart, the navamsha, the dasha and the transits agree strongly, but exact dates shift by about two to three weeks for every ten minutes of birth-time error.""",
}

EXEMPLARS["general"] = {
    "question": "Give me a full reading of my life: who I am, my strengths and weaknesses, and the chapter I am in now.",
    "answer": """### The short answer

Yours is a chart of quiet depth and slow-built authority. You are reflective, principled and happiest with a secure base, and your life asks you to turn that inner steadiness into responsibility in the outside world. You are now in the most career-defining chapter of your life, and the pressure of the last few years is about to lift.

### Who you are

<fact kind="lagna" sign="Pisces">Your Pisces ascendant</fact> gives sensitivity, imagination and a strong sense of meaning. Its ruler, <fact kind="house_lord" house="1" lord="Jupiter" in_house="4">Jupiter, sits in your 4th house</fact>, so your sense of self rests on home, learning and emotional security: when your base is settled, you function at your best, and when it is not, everything else wobbles.

Your Moon is private. <fact kind="placement" planet="Moon" sign="Aquarius" house="12">The Moon in Aquarius in your 12th house</fact> gives a mind that needs solitude and space to process, an interest in the inner life, and often a pull toward distant places. People may see you as calm; inwardly you think a great deal.

Your strongest planet is <fact kind="placement" planet="Mars" sign="Scorpio" house="9">Mars in Scorpio in your 9th house</fact>, in its own sign and <fact kind="vargottama" planet="Mars" value="true">vargottama</fact>. This is conviction: you defend what you believe, you learn by going deep, and your fortune improves when you act on principle rather than convenience.

### Your strengths and your lesson

Your 10th house holds <fact kind="conjunction" planets="Sun,Saturn">the Sun with Saturn</fact>, and Saturn is your <fact kind="karaka" role="Atmakaraka" planet="Saturn">Atmakaraka</fact>, the planet of the soul's central lesson. Your life's work is to earn authority slowly and carry responsibility well. Your 11th house holds Mercury, Venus and Rahu, giving a wide network and real ambition.

The counterweight is your ascendant lord itself. <fact kind="dignity" planet="Jupiter" status="great enemy">Jupiter is in a great enemy's sign</fact> and <fact kind="dignity" planet="Jupiter" status="debilitated" chart="D9">debilitated in the navamsha</fact>, so self-belief can lag behind ability. Overthinking and waiting for certainty are your typical traps; deliberate commitments are the cure.

### The chapter you are in

<fact kind="dasha" lords="Saturn" start="2024-02-09" end="2043-02-09">Saturn's major period runs from 2024 to 2043</fact>. Because Saturn sits in your 10th house and is your Atmakaraka, these years build your reputation and test your patience in equal measure. Alongside it, <fact kind="sade_sati" active="true">you are in the last phase of Sade Sati</fact>, Saturn's long transit around your Moon, which <fact kind="sade_sati" end="2028-02-23">ends in February 2028</fact>. Much of the heaviness of recent years belongs to that transit; expect noticeably more room to breathe after it.

The next turning point is <fact kind="dasha" lords="Saturn-Mercury" start="2027-02-12" end="2029-10-22">Saturn–Mercury (2027 to 2029)</fact>. Mercury rules your 4th and 7th houses, so home and partnership become the stage for Saturn's lessons, and a Jupiter–Saturn double transit on your ascendant lord in the second half of 2028 makes that the likeliest time for a visible change of direction.

### How to use this

- Protect your base first: a settled home and routine are not a luxury in your chart, they are fuel.
- Commit to one long project at work and let Saturn's slow compounding do its job.
- Give your Moon its quiet: regular solitude, reflection or retreat keeps your judgement clear.
- Treat 2028 as the year to make the move you have been preparing for.

**Confidence:** moderate — the core pattern rests on robust factors (the ascendant and Moon sign are stable to birth time), while the navamsha and the precise dates depend on a birth time accurate to a few minutes.""",
}

EXEMPLARS["year"] = {
    "question": "What does the next 12 months hold for me?",
    "answer": """### The short answer

The coming year is a year of transition from strain to structure. Saturn's long pressure on your mind and body is ending, your career has a live window right now, and from February 2027 the focus shifts toward home, partnership and income through your network. Expect the second half of the year to feel lighter than the first.

### The backdrop

You are in <fact kind="dasha" lords="Saturn" start="2024-02-09" end="2043-02-09">Saturn's major period</fact>, with Saturn in your career house, so work stays the spine of the year. <fact kind="sade_sati" active="true">Sade Sati is in its final phase</fact>, and <fact kind="transit" planet="Saturn" sign="Pisces" house="1" from="lagna" date="2026-11-24">Saturn is crossing your ascendant</fact>: that explains tiredness, a sense of carrying too much, and a need to simplify. It is a discipline cycle, not a punishment, and it lifts in stages through 2027.

### Phase by phase

**December 2026 to mid-February 2027** — <fact kind="dasha" lords="Saturn-Saturn-Jupiter" start="2026-09-18" end="2027-02-12">the Saturn–Saturn–Jupiter sub-period</fact>. Jupiter rules both your ascendant and your career house, and <fact kind="transit" planet="Jupiter" sign="Leo" date="2026-12-25">Jupiter in Leo</fact> works with Saturn to touch your 10th house, so this is the year's best moment for a career conversation: ask, propose, apply.

**February to June 2027** — <fact kind="dasha" lords="Saturn-Mercury-Mercury" start="2027-02-12" end="2027-07-01">Saturn–Mercury–Mercury</fact> begins a new chapter. Mercury rules your 4th and 7th houses, so home, family and partnership step forward. <fact kind="transit" planet="Jupiter" sign="Cancer" house="5" from="lagna" date="2027-03-15">Jupiter moves into your 5th house</fact>, which favours learning, creative work and anything involving children.

**June to October 2027** — Saturn briefly enters Aries, your 2nd house, from early June, so money and family conversations become practical: budgets, obligations, who pays for what. <fact kind="transit" planet="Jupiter" sign="Leo" house="6" from="lagna" date="2027-08-01">Jupiter in your 6th house</fact> helps you fix routines and health habits; use it.

**From late November 2027** — <fact kind="transit" planet="Jupiter" sign="Virgo" house="7" from="lagna" date="2027-12-15">Jupiter enters your 7th house</fact>, opening the year's partnership window, inside <fact kind="dasha" lords="Saturn-Mercury-Venus" start="2027-08-28" end="2028-02-07">Saturn–Mercury–Venus</fact>, when Venus, the planet of relationships, takes the short-term lead.

### What to do with this

- Make your career move before mid-February 2027, while the double transit is active.
- Simplify commitments through mid-2027; drop what Saturn has shown you cannot carry.
- Set up the family budget conversation before Saturn's move into your 2nd house in June.
- Put relationships, introductions and commitments on the agenda from December 2027.

**Confidence:** moderate — the dasha and transit layers agree, but sub-period dates shift by roughly two to three weeks for every ten minutes of birth-time error, so treat each boundary as a band, not a day.""",
}

EXEMPLARS["health"] = {
    "question": "What does my chart say about my health, energy and resilience?",
    "answer": """### The short answer

Your constitution is resilient, and it is closely tied to emotional security: when your home life and inner life are settled, your energy holds up well. The areas that need care are rest, sleep and the stress that work puts on your body, especially until Saturn's heavy transit eases in early 2028. Nothing here diagnoses or rules out any illness.

### Why the chart says this

<fact kind="sav" house="1" value="30">Your ascendant carries 30 Ashtakavarga bindus</fact>, above average, which points to good underlying stamina. Its ruler, <fact kind="house_lord" house="1" lord="Jupiter" in_house="4">Jupiter, sits in your 4th house</fact> of home and emotional security, so your physical resilience depends unusually strongly on how settled you feel. Stress at home shows up in the body; a calm base restores you quickly.

Your 6th house of daily health routines is ruled by the Sun, and <fact kind="house_lord" house="6" lord="Sun" in_house="10">the Sun sits in your 10th house</fact> of career. Your routines are shaped by work: long hours, responsibility and performance pressure decide whether you eat, sleep and move well. When work is under control, so is your health.

### What needs care

<fact kind="placement" planet="Moon" sign="Aquarius" house="12">Your Moon sits in the 12th house</fact>, the house of sleep, rest and withdrawal, which has <fact kind="sav" house="12" value="20">only 20 Ashtakavarga bindus</fact>, the lowest in your chart. Your mind needs more recovery time than most, and poor sleep or isolation drains you faster than physical effort does.

The current pressure comes from transit: <fact kind="transit" planet="Saturn" sign="Pisces" house="1" from="lagna" date="2026-11-24">Saturn is crossing your ascendant</fact> during <fact kind="sade_sati" active="true">the last phase of Sade Sati</fact>. Saturn on the ascendant classically brings fatigue, stiffness and a feeling of carrying weight. It lifts when Sade Sati <fact kind="sade_sati" end="2028-02-23">ends in February 2028</fact>.

### Timing

From mid-2027, <fact kind="transit" planet="Jupiter" sign="Leo" house="6" from="lagna" date="2027-08-01">Jupiter moves through your 6th house</fact>, the most supportive time of the next few years to build lasting habits — a sleep schedule, a training routine, an overdue check-up. After February 2028 Saturn's weight comes off your ascendant, and energy should feel more freely available.

### What to do with this

- Protect sleep as non-negotiable; it is your chart's weakest link and your fastest recovery.
- Set firm limits on work hours, since your routines follow your job.
- Use mid-2027 onward to establish one sustainable exercise habit and a regular health screening.
- See a qualified doctor for any persistent symptom; the chart describes tendencies, not diagnoses.

**Confidence:** moderate — the ascendant and Moon sign are stable to birth time, and the transit picture is exact, but health has many causes a birth chart cannot see.""",
}

EXEMPLARS["foreign"] = {
    "question": "Will I travel or settle abroad?",
    "answer": """### The short answer

Travel abroad is supported in your chart, and it is most likely to come through work: postings, assignments or opportunities your career opens. Permanent settlement is a different question, and there the chart is more conditional, because your home base pulls strongly. Expect journeys and work-linked stays to be easier than a lasting move.

### Why the chart says this

The key factor is <fact kind="house_lord" house="12" lord="Saturn" in_house="10">your 12th lord Saturn sitting in the 10th house</fact>. The 12th is the house of foreign lands; when its ruler sits in the career house, time abroad tends to arrive as part of your work, not as an escape from it. Saturn is strong where it matters for the long run: <fact kind="dignity" planet="Saturn" status="exalted" chart="D9">it is exalted in the navamsha</fact>, so this link tends to strengthen with age.

Long journeys are well backed. <fact kind="house_lord" house="9" lord="Mars" in_house="9">Your 9th lord Mars sits in its own 9th house</fact>, the house of distant travel and higher learning, which gives a natural confidence about going far. Short trips are easier still: <fact kind="sav" house="3" value="31">your 3rd house has 31 Ashtakavarga bindus</fact>, well above average.

Your mind is drawn outward too: <fact kind="placement" planet="Moon" sign="Aquarius" house="12">the Moon in the 12th house</fact> gives an inner pull toward distant places and is comfortable with the solitude that comes with living away.

### What pushes back

<fact kind="sav" house="12" value="20">Your 12th house has only 20 bindus</fact>, the lowest in your chart, so stays abroad cost more — money, energy and adjustment — than they look on paper. And your roots are strong: <fact kind="placement" planet="Jupiter" sign="Gemini" house="4">Jupiter, your ascendant lord, sits in the 4th house of home</fact>, so a settled base matters deeply to you, which argues for travel and temporary stays over a permanent move. <fact kind="combust" planet="Saturn" value="true">Saturn is combust</fact>, so an employer or institution may decide where and when you go.

The property-and-settlement chart (D4) does not fully agree with the main picture, which is another reason to treat permanent relocation as open rather than likely.

### Timing

1. **Now until late January 2027**, inside <fact kind="dasha" lords="Saturn-Saturn" start="2024-02-09" end="2027-02-12">Saturn–Saturn</fact>: the period lord rules your 12th house, and <fact kind="transit" planet="Jupiter" sign="Leo" date="2026-12-25">Jupiter in Leo</fact> with <fact kind="transit" planet="Saturn" sign="Pisces" date="2026-12-25">Saturn in Pisces</fact> both reach your 12th lord — a double transit that favours a work-related trip or offer.
2. **February to June 2031**, inside <fact kind="dasha" lords="Saturn-Venus" start="2030-12-01" end="2034-01-30">Saturn–Venus</fact>: Venus rules your 3rd house of journeys, and <fact kind="transit" planet="Jupiter" sign="Sagittarius" date="2031-04-16">Jupiter in Sagittarius</fact> with <fact kind="transit" planet="Saturn" sign="Taurus" date="2031-04-16">Saturn in Taurus</fact> reach your 12th house and its lord together, the stronger window for a longer stay.

### What to do with this

- Let your career carry you: ask about international projects, transfers or clients before planning a move on your own.
- Test life abroad with an assignment or a few months' stay before committing permanently.
- Budget generously for any stay; your chart's weak point abroad is cost, not opportunity.
- Check visa eligibility, a realistic work route, housing and family needs separately; the chart cannot name a country or promise a visa.

**Confidence:** moderate — the birth chart, the dasha and the double transits agree on travel, but the D4 disagrees on settlement and depends on a precise birth time.""",
}

EXEMPLARS["education"] = {
    "question": "What should I study, and how will my education go?",
    "answer": """### The short answer

Your learning picture is mixed in an interesting way: you are built for depth, mentors and higher study, but conventional classroom routines suit you less well than self-directed, specialised or distance learning. The best results come when study is tied to a practical goal — a credential or skill that pays — and pursued with a teacher you respect.

### Why the chart says this

<fact kind="placement" planet="Jupiter" sign="Gemini" house="4">Jupiter, the planet of teachers, sits in your 4th house of education</fact>, and that house carries <fact kind="sav" house="4" value="30">30 Ashtakavarga bindus</fact>, above average. This is a learner who grows through good guidance: the right mentor changes your results more than the right syllabus.

<fact kind="house_lord" house="4" lord="Mercury" in_house="11">The 4th lord Mercury sits in your 11th house</fact> of gains and networks, so education works best when it connects to income, peers or a clear professional goal. <fact kind="vargottama" planet="Mercury" value="true">Mercury is vargottama</fact>, which makes skills you learn stick — practical, applied knowledge is your strength.

Higher learning is the strongest part of the picture: <fact kind="house_lord" house="9" lord="Mars" in_house="9">your 9th lord Mars sits in its own 9th house</fact>, favouring postgraduate study, law, research, philosophy or any field you pursue with conviction.

### What pushes back

<fact kind="house_lord" house="5" lord="Moon" in_house="12">Your 5th lord Moon sits in the 12th house</fact>, the house of retreat, so your intelligence works best in quiet, private conditions — research, online or overseas study — and less well under exam-hall pressure. <fact kind="dignity" planet="Moon" status="debilitated" chart="D9">The Moon is debilitated in the navamsha</fact>, which shows concentration and confidence that come and go; structure has to do what mood cannot. <fact kind="placement" planet="Ketu" sign="Cancer" house="5">Ketu in your 5th house</fact> adds intuition and an appetite for unusual subjects, along with impatience for rote learning.

The education chart (D24) only partly agrees and changes within minutes of birth time, so treat it as background.

### Timing

<fact kind="dasha" lords="Saturn-Mercury" start="2027-02-12" end="2029-10-22">Saturn–Mercury (February 2027 to October 2029)</fact> is your clearest study period, because Mercury rules your 4th house of education. Inside it, **July to December 2028** stands out: <fact kind="transit" planet="Jupiter" sign="Virgo" date="2028-10-10">Jupiter in Virgo</fact> and <fact kind="transit" planet="Saturn" sign="Aries" date="2028-10-10">Saturn in Aries</fact> both reach your 4th house or its lord, a double transit that suits exams, admissions or completing a qualification.

### What to do with this

- Choose a course with a clear practical payoff and a teacher whose work you admire.
- Study in quiet, regular blocks; protect a private space for it.
- Plan applications or certification exams for 2028.
- Use short, scheduled reviews to steady concentration instead of relying on motivation.

**Confidence:** low — the higher-learning signals are clear, but the core learning houses are mixed and the D24 depends on a birth time accurate to a few minutes.""",
}

EXEMPLARS["property"] = {
    "question": "Will I own property, and when is a good time to buy?",
    "answer": """### The short answer

Property ownership is strongly supported in your chart, and it is likely to come through your earnings and network rather than a windfall — a home bought as income grows, often with an eye to its value as an asset. The friction is process: paperwork, approvals or disputes can slow things down, so a careful purchase works better than a fast one.

### Why the chart says this

<fact kind="house_lord" house="4" lord="Mercury" in_house="11">Your 4th lord Mercury sits in the 11th house</fact> of gains, linking property with income and networks: property tends to follow a rise in earnings and can become an investment rather than only a home. <fact kind="placement" planet="Jupiter" sign="Gemini" house="4">Jupiter, your ascendant lord, sits in your 4th house</fact>, which brings growth and protection to home life, and the house carries <fact kind="sav" house="4" value="30">30 Ashtakavarga bindus</fact>, above average.

Mars, the natural significator of land and property, is strong: <fact kind="dignity" planet="Mars" status="own">Mars is in its own sign</fact> in your 9th house of fortune, so property can also come with family support or an inheritance-linked opportunity. And <fact kind="placement" planet="Venus" sign="Capricorn" house="11">Venus in your 11th house</fact> ties vehicles and comforts to rising income.

### What pushes back

Your 4th house is under three demanding aspects: <fact kind="aspect" planet="Mars" house="4">Mars</fact>, <fact kind="aspect" planet="Saturn" house="4">Saturn</fact> and <fact kind="aspect" planet="Sun" house="4">the Sun</fact> all aspect it. Mars brings renovation, effort or disagreement; Saturn brings delay and paperwork; the Sun brings authority — permits, approvals and official checks. None of this denies ownership, but it rewards patience, inspection and clean documentation.

The property chart (D4) does not fully agree: there, the planet ruling both its ascendant and its home house sits in a house of shared money, a hint that loans or joint ownership will be part of the story.

### Timing

<fact kind="sade_sati" active="true">Sade Sati is still active</fact> and <fact kind="sade_sati" end="2028-02-23">ends in February 2028</fact>, so major commitments sit better after that. The best window follows: inside <fact kind="dasha" lords="Saturn-Mercury" start="2027-02-12" end="2029-10-22">Saturn–Mercury</fact>, ruled by your 4th lord, **July to December 2028** brings <fact kind="transit" planet="Jupiter" sign="Virgo" date="2028-10-10">Jupiter in Virgo</fact> and <fact kind="transit" planet="Saturn" sign="Aries" date="2028-10-10">Saturn in Aries</fact> to your 4th house or its lord at the same time — a double transit for a purchase or move.

### What to do with this

- Build your deposit through 2027 and get loan pre-approval ready for 2028.
- Inspect title, permits and approvals carefully; your chart's friction is in the paperwork.
- If you buy jointly or with a loan, agree the terms in writing in advance.
- Treat a 2028 purchase as a planned investment, and check affordability with a qualified adviser.

**Confidence:** moderate — the birth chart, dasha and double transit agree, but the D4 only partly does and depends on an exact birth time.""",
}

EXEMPLARS["children"] = {
    "question": "What does my chart say about children?",
    "answer": """### The short answer

The chart supports children and creative legacy, with a recognisable pattern: things tend to come later than expected, after some patience or a detour, and parenting asks you to let a child be quite different from you. Nothing here predicts fertility or a child's health; those questions belong with medical professionals.

### Why the chart says this

The strongest support comes from the house that classically confirms the 5th — the 9th, which is the 5th counted from the 5th. <fact kind="house_lord" house="9" lord="Mars" in_house="9">Your 9th lord Mars sits in its own 9th house</fact>, and <fact kind="dignity" planet="Mars" status="own" chart="D9">it stays in its own sign in the navamsha</fact>, a durable support for children and for passing on your values.

The children's chart (D7) agrees: <fact kind="placement" planet="Jupiter" sign="Leo" house="9" chart="D7">its ascendant lord Jupiter sits in the 9th house of D7</fact> together with its 5th lord Mars, a favourable link between the self and children in that chart. Jupiter is also your <fact kind="karaka" role="Putrakaraka" planet="Jupiter">Putrakaraka</fact>, the planet that signifies children in the Jaimini system, so its condition matters.

### What pushes back

<fact kind="house_lord" house="5" lord="Moon" in_house="12">Your 5th lord Moon sits in the 12th house</fact>, which traditionally shows delay, distance or sacrifice around children — a child who studies or lives far away, or a longer path to parenthood. <fact kind="placement" planet="Ketu" sign="Cancer" house="5">Ketu in the 5th house</fact> adds an unconventional note: a child with an independent or spiritual streak, or a creative life that does not follow the usual timeline. <fact kind="sav" house="5" value="24">The 5th house has 24 Ashtakavarga bindus</fact>, below average, so this area responds to patience and planning rather than chance.

Hold the D7 lightly: <fact kind="sensitivity" factor="saptamsha_lagna" rating="fragile">the D7 ascendant is fragile to birth time</fact>.

### Timing

<fact kind="dasha" lords="Saturn-Ketu" start="2029-10-22" end="2030-12-01">Saturn–Ketu (October 2029 to December 2030)</fact> activates your 5th house directly, since Ketu sits there, and **May to September 2030** adds a double transit: <fact kind="transit" planet="Jupiter" sign="Libra" date="2030-07-12">Jupiter in Libra</fact> and <fact kind="transit" planet="Saturn" sign="Taurus" date="2030-07-12">Saturn in Taurus</fact> both reach your 5th house or its lord. <fact kind="dasha" lords="Saturn-Venus" start="2030-12-01" end="2034-01-30">Saturn–Venus</fact> continues the theme, with another double transit in mid-2031.

### What to do with this

- If children are part of your plans, involve qualified medical advice early rather than waiting on timing.
- Give creative projects, teaching or mentoring real room; your 5th house expresses itself through them too.
- Expect a child to follow their own path, and treat that independence as a strength.
- Use 2030 as a planning horizon, never as a deadline.

**Confidence:** moderate — the 9th house, the D7 and the timing agree, but the D7 depends on a birth time accurate to a few minutes and fertility depends on far more than a chart.""",
}

EXEMPLARS["spiritual"] = {
    "question": "What is my spiritual path, and when will it deepen?",
    "answer": """### The short answer

Your spiritual life is self-directed and practical: you grow through conviction, discipline and duty rather than through belief alone. There is a strong inward pull in your chart toward solitude and reflection, and the task is to keep that pull nourishing rather than letting it become withdrawal.

### Why the chart says this

<fact kind="house_lord" house="9" lord="Mars" in_house="9">Your 9th lord Mars sits in its own 9th house</fact>, the house of dharma and teachers, and <fact kind="vargottama" planet="Mars" value="true">Mars is vargottama</fact>, steady in both main charts. Yours is a path of action: practice, service and standing by your principles teach you more than reading about them, and teachers who demand effort suit you better than gentle ones.

<fact kind="placement" planet="Moon" sign="Aquarius" house="12">The Moon in your 12th house</fact> gives a natural pull toward meditation, retreat and the inner life, and <fact kind="aspect" planet="Jupiter" house="12">Jupiter aspects that house</fact>, so wisdom guides the letting go. <fact kind="placement" planet="Ketu" sign="Cancer" house="5">Ketu in the 5th house</fact> adds intuitive intelligence and a feel for mantra or contemplative practice.

Underneath it all, Saturn is your <fact kind="karaka" role="Atmakaraka" planet="Saturn">Atmakaraka</fact>: your soul's lesson is patience, responsibility and detachment learned through work, so ordinary duty is itself part of your practice.

### What pushes back

<fact kind="sav" house="12" value="20">Your 12th house has only 20 Ashtakavarga bindus</fact>, the lowest in your chart, and <fact kind="aspect" planet="Saturn" house="12">Saturn also aspects it</fact>. Retreat can tip into isolation, low mood or avoidance if it is not anchored in routine and relationships. Distinguish rest that restores you from withdrawal that drains you.

The spiritual chart (D20) only partly agrees and is highly sensitive to birth time, so it adds colour, not confirmation.

### Timing

<fact kind="dasha" lords="Saturn" start="2024-02-09" end="2043-02-09">Saturn's major period</fact> is itself a maturing chapter, because Saturn is your Atmakaraka. The clearest inward period is <fact kind="dasha" lords="Saturn-Ketu" start="2029-10-22" end="2030-12-01">Saturn–Ketu (late 2029 to 2030)</fact>, since Ketu sits in your 5th house; **September to December 2030** adds a double transit, with <fact kind="transit" planet="Jupiter" sign="Scorpio" date="2030-10-27">Jupiter in Scorpio</fact> and <fact kind="transit" planet="Saturn" sign="Taurus" date="2030-10-27">Saturn in Taurus</fact> reaching your 9th house or its lord — a good time for a retreat, a teacher or a long-term commitment to practice.

### What to do with this

- Keep a daily practice short and fixed rather than long and occasional.
- Choose one teacher or tradition and give it years, not weeks.
- Pair solitude with service, so retreat stays connected to people.
- Seek professional support if withdrawal starts to feel like low mood rather than rest.

**Confidence:** low — the 9th-house and Moon signatures are clear, but the overall promise is mixed and the D20 depends on an exact birth time.""",
}

# Topics without a dedicated exemplar borrow the closest one: the point is reasoning style, not content.
TOPIC_FALLBACK = {"timing": "year", "month": "year", "lifetime": "general"}


def exemplar_for(topic_key: str) -> tuple[str, dict[str, str]]:
    key = topic_key if topic_key in EXEMPLARS else TOPIC_FALLBACK.get(topic_key, "general")
    return key, EXEMPLARS[key]
