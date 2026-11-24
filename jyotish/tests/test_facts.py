"""Verifier, renderer and chat-loop tests on the 1990-01-01 12:00 IST Delhi chart.
Includes deliberately wrong claims: the checker must catch every one of them."""
from datetime import datetime, timezone

import pytest

from chat.facts import extract_and_verify
from chat.llm import LLMError
from chat.offline import offline_answer
from chat.prashna import build_prashna
from chat.quality import score_reading
from chat.render import render
from chat.session import ChatSession
from chat.tools import run_tool
from chat.topics import ANALYSIS_MODES, MODE_QUESTIONS, TOPICS, detect_topic
from vedic import BirthInput, analyse

NOW = datetime(2026, 11, 14, 6, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def cr():
    b = BirthInput(year=1990, month=1, day=1, hour=12, minute=0, lat=28.6139, lon=77.2090, tz_name="Asia/Kolkata")
    return analyse(b, now=NOW)


def one(text, cr):
    rep = extract_and_verify(text, *cr)
    assert len(rep.checks) == 1, [c.as_dict() for c in rep.checks]
    return rep.checks[0]


TRUE_TAGS = [
    '<fact kind="lagna" sign="Pisces">Pisces ascendant</fact>',
    '<fact kind="lagna" sign="Meena">Meena lagna</fact>',
    '<fact kind="placement" planet="Saturn" sign="Sagittarius" house="10">x</fact>',
    '<fact kind="placement" planet="Shani" sign="Dhanu" house="10th">x</fact>',
    '<fact kind="placement" planet="Venus" sign="Aries" chart="D9">x</fact>',
    '<fact kind="lagna" sign="Scorpio" chart="navamsha">x</fact>',
    '<fact kind="house_lord" house="7" lord="Mercury" in_house="11">x</fact>',
    '<fact kind="aspect" planet="Jupiter" house="10">x</fact>',
    '<fact kind="aspect" planet="Jupiter" target="Saturn">x</fact>',
    '<fact kind="aspect" planet="Mars" target="Moon">x</fact>',          # 4th aspect from the 9th lands on the 12th
    '<fact kind="conjunction" planets="Sun,Saturn">x</fact>',
    '<fact kind="conjunction" planets="Mercury, Venus and Rahu">x</fact>',
    '<fact kind="dignity" planet="Mars" status="own">x</fact>',
    '<fact kind="dignity" planet="Mercury" status="exalted" chart="D10">x</fact>',
    '<fact kind="vargottama" planet="Mercury" value="true">x</fact>',
    '<fact kind="avastha" planet="Mercury" status="Mrita">x</fact>',
    '<fact kind="dignity" planet="Jupiter" status="great enemy">x</fact>',
    '<fact kind="retrograde" planet="Jupiter" value="true">x</fact>',
    '<fact kind="retrograde" planet="Saturn" value="false">x</fact>',
    '<fact kind="combust" planet="Saturn" value="true">x</fact>',
    '<fact kind="nakshatra" planet="Moon" name="Dhanishtha" pada="4">x</fact>',
    '<fact kind="nakshatra" planet="Lagna" name="Uttara Bhadrapada">x</fact>',
    '<fact kind="dasha" lords="Saturn" start="2024-02" end="2043-02">x</fact>',
    '<fact kind="dasha" lords="Saturn-Mercury" start="2027-02">x</fact>',
    '<fact kind="dasha" lords="Saturn-Saturn" running="2026-11-14">x</fact>',
    '<fact kind="yoga" name="Dhana Yoga" present="true">x</fact>',
    '<fact kind="yoga" name="Gajakesari" present="false">x</fact>',
    '<fact kind="transit" planet="Saturn" sign="Pisces" house="2" from="moon">x</fact>',
    '<fact kind="sade_sati" active="true">x</fact>',
    '<fact kind="sade_sati" start="2020-01">x</fact>',
    '<fact kind="karaka" role="Atmakaraka" planet="Saturn">x</fact>',
    '<fact kind="karaka" role="Darakaraka" planet="Mercury">x</fact>',
    '<fact kind="sav" house="10" value="32">x</fact>',
    '<fact kind="panchang" limb="tithi" name="Shukla Panchami">x</fact>',
    '<fact kind="panchang" limb="vara" name="Monday">x</fact>',
    '<fact kind="panchang" limb="karana" name="Bava">x</fact>',
    '<fact kind="sensitivity" factor="dashamsha_lagna" rating="fragile">x</fact>',
]

FALSE_TAGS = [
    '<fact kind="lagna" sign="Aries">x</fact>',
    '<fact kind="placement" planet="Saturn" house="7">x</fact>',
    '<fact kind="placement" planet="Saturn" sign="Sagittarius" house="9">x</fact>',   # half right is wrong
    '<fact kind="placement" planet="Venus" sign="Taurus" chart="D9">x</fact>',
    '<fact kind="house_lord" house="10" lord="Saturn">x</fact>',
    '<fact kind="house_lord" house="7" lord="Mercury" in_house="4">x</fact>',
    '<fact kind="aspect" planet="Mars" target="Sun">x</fact>',          # Mars (9th) aspects 12, 3, 4 only
    '<fact kind="conjunction" planets="Sun,Moon">x</fact>',
    '<fact kind="dignity" planet="Mars" status="exalted">x</fact>',
    '<fact kind="dignity" planet="Mercury" status="debilitated" chart="D10">x</fact>',
    '<fact kind="vargottama" planet="Mercury" value="false">x</fact>',
    '<fact kind="avastha" planet="Mercury" status="Bala">x</fact>',
    '<fact kind="dignity" planet="Jupiter" status="own">x</fact>',
    '<fact kind="retrograde" planet="Mars" value="true">x</fact>',
    '<fact kind="combust" planet="Mercury" value="true">x</fact>',
    '<fact kind="nakshatra" planet="Moon" name="Shatabhisha">x</fact>',
    '<fact kind="nakshatra" planet="Moon" name="Dhanishta" pada="1">x</fact>',
    '<fact kind="dasha" lords="Saturn" start="2026-01">x</fact>',
    '<fact kind="dasha" lords="Saturn-Saturn" running="2030-06-01">x</fact>',
    '<fact kind="yoga" name="Gajakesari" present="true">x</fact>',
    '<fact kind="yoga" name="Kaal Sarp Dosha">x</fact>',
    '<fact kind="yoga" name="Dhana" present="false">x</fact>',
    '<fact kind="transit" planet="Saturn" sign="Aquarius">x</fact>',
    '<fact kind="sade_sati" active="false">x</fact>',
    '<fact kind="karaka" role="Atmakaraka" planet="Sun">x</fact>',
    '<fact kind="sav" house="10" value="28">x</fact>',
    '<fact kind="panchang" limb="tithi" name="Krishna Panchami">x</fact>',
    '<fact kind="panchang" limb="vara" name="Friday">x</fact>',
    '<fact kind="sensitivity" factor="lagna_sign" rating="fragile">x</fact>',
]


@pytest.mark.parametrize("tag", TRUE_TAGS)
def test_true_tags_verified(tag, cr):
    c = one(tag, cr)
    assert c.verdict == "verified", c.as_dict()


@pytest.mark.parametrize("tag", FALSE_TAGS)
def test_false_tags_contradicted(tag, cr):
    c = one(tag, cr)
    assert c.verdict == "contradicted", c.as_dict()
    assert c.engine, "contradiction must carry the engine's value"


def test_out_of_scope_is_unverifiable(cr):
    for tag in ('<fact kind="yoga" name="Saraswati Yoga">x</fact>', '<fact kind="shadbala" planet="Sun">x</fact>',
                '<fact kind="placement" planet="Pluto" house="1">x</fact>'):
        assert one(tag, cr).verdict == "unverifiable"


def test_free_text_scan(cr):
    rep = extract_and_verify("Saturn is in the 10th house. Mars is exalted. Your 10th lord is Jupiter. "
                             "Jupiter is retrograde. Venus is in Leo. Mercury is combust.", *cr)
    got = {(c.kind, c.text): c.verdict for c in rep.checks}
    assert got[("placement", "Saturn is in the 10th house")] == "verified"
    assert got[("dignity", "Mars is exalted")] == "contradicted"
    assert got[("house_lord", "10th lord is Jupiter")] == "verified"
    assert got[("retrograde", "Jupiter is retrograde")] == "verified"
    assert got[("placement", "Venus is in Leo")] == "contradicted"
    assert got[("combust", "Mercury is combust")] == "contradicted"
    assert all(c.source == "scan" for c in rep.checks)


def test_scan_skips_varga_transit_and_conditional_sentences(cr):
    rep = extract_and_verify("In the navamsha Venus is in Aries. Saturn is currently transiting Pisces, "
                             "Saturn in Pisces. If Mars is exalted it would be strong.", *cr)
    assert rep.checks == []


def test_tags_are_not_double_counted_by_scan(cr):
    rep = extract_and_verify('<fact kind="placement" planet="Saturn" house="10">Saturn is in the 10th house</fact>.', *cr)
    assert len(rep.checks) == 1 and rep.checks[0].source == "tag"


def test_render_is_safe(cr):
    text = ('Hello <script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)> '
            '<fact kind="dignity" planet="Mars" status="exalted">Mars <b>exalted</b></fact> <fact kind="x">unclosed')
    rep = extract_and_verify(text, *cr)
    html = render(text, rep)
    assert "<script" not in html and "<img" not in html and "<b>" not in html
    assert 'href="javascript' not in html
    assert 'class="fact bad"' in html and "fact-fix" in html
    assert "&lt;fact" not in html


def test_offline_answers_fully_verified(cr):
    for q in ["How is my career?", "When will I marry?", "Overview of my chart", "money and wealth",
              "my health", "children", "settling abroad", "what does this year hold"]:
        rep = extract_and_verify(offline_answer(*cr, q), *cr)
        s = rep.summary()
        assert s["total"] >= 5 and s["verified"] == s["total"], (q, [c.as_dict() for c in rep.checks
                                                                       if c.verdict != "verified"])


@pytest.mark.parametrize("key", list(MODE_QUESTIONS))
def test_all_offline_hindi_readings_are_fully_verified(key, cr):
    text = offline_answer(*cr, MODE_QUESTIONS[key], language="hi")
    rep = extract_and_verify(text, *cr)
    bad = [c.as_dict() for c in rep.checks if c.verdict != "verified"]
    assert rep.summary()["total"] >= (8 if key == "foreign" else 20) and not bad, (key, bad)
    # Foreign residence has its own structure (short trip / stay / settlement, then practical checks).
    headings = (("### मुख्य निष्कर्ष", "### कुंडली ऐसा संकेत क्यों दे रही है", "### व्यावहारिक जाँच", "**विश्वास-स्तर:**")
                if key == "foreign" else
                ("### मुख्य निष्कर्ष", "### कुंडली ऐसा संकेत क्यों दे रही है",
                 "### कौन-से कारक विरोध करते हैं", "### इसका उपयोग कैसे करें", "**विश्वास-स्तर:**"))
    for heading in headings:
        assert heading in text, (key, heading)
    assert "the chart is" not in text and "How to use this" not in text


def test_hindi_offline_session_needs_no_ai_and_keeps_prashna_verified(cr):
    s = ChatSession(*cr, use_env_llm=False)
    out = s.ask("How is my career?", language="hi")
    assert out["mode"] == "offline" and out["language"] == "hi"
    assert out["language_notice"] is None
    assert out["label"].startswith("ऑफ़लाइन")
    assert out["summary"]["verified"] == out["summary"]["total"]
    assert "मुख्य निष्कर्ष" in out["text"] and "विभाजीय-कुंडली पुष्टि — D10" in out["text"]

    out = s.ask("shall i join addictive learning or not", language="hi")
    assert "प्रश्नावली — आपके प्रश्न के समय की कुंडली" in out["text"]
    assert "इस कंपनी में शामिल होने या यह भूमिका स्वीकार करने" in out["text"]
    assert out["language_notice"] is None
    assert out["summary"]["verified"] == out["summary"]["total"]
    assert any(c["attrs"].get("chart") == "Prashna" for c in out["checks"])


def test_joining_company_is_not_misread_as_education():
    assert detect_topic("shall i join addictive learning or not").key == "career"
    assert detect_topic("should I join a learning course").key == "education"


def test_joining_decision_uses_question_time_prashna(cr):
    asked_at = datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc)
    prashna = build_prashna(cr[0], asked_at)
    text = offline_answer(*cr, "shall i join addictive learning or not", question_time=asked_at, prashna=prashna)
    assert "joining this company or accepting this role" in text
    assert "### Prashna — chart at the time of your question" in text
    assert "2026-11-18 06:00:00 UTC" in text
    assert "saved chart location" in text
    assert "For **education and learning**" not in text
    rep = extract_and_verify(text, *cr, (prashna.chart, prashna.report))
    assert not [c.as_dict() for c in rep.checks if c.verdict != "verified"]
    prashna_checks = [c for c in rep.checks if c.attrs.get("chart") == "Prashna"]
    assert len(prashna_checks) >= 6
    assert prashna.chart.time.utc == asked_at


@pytest.mark.parametrize("key", list(MODE_QUESTIONS))
def test_all_deep_readings_are_structured_and_fully_verified(key, cr):
    text = offline_answer(*cr, MODE_QUESTIONS[key])
    rep = extract_and_verify(text, *cr)
    bad = [c.as_dict() for c in rep.checks if c.verdict != "verified"]
    assert rep.summary()["total"] >= 10 and not bad, (key, bad)
    for heading in ("### The short answer", "### Why the chart says this", "### What pushes back",
                    "### Timing", "### What to do with this", "**Confidence:**"):
        assert heading in text, (key, heading)
    assert "chart score" not in text.lower() and "simple textbook weighting" not in text.lower()
    n = TOPICS[key].varga
    if n:
        assert f"### Divisional-chart confirmation — D{n}" in text
    quality = score_reading(text)
    assert quality["score"] >= 85, (key, quality["score"], quality["issues"])


def test_analysis_mode_api_uses_shared_blueprints():
    from server.app import analysis_modes
    modes = analysis_modes()["modes"]
    assert len(modes) == len(ANALYSIS_MODES) == 14
    assert {"year", "month", "lifetime"} <= {m["key"] for m in modes}
    assert {m["key"] for m in modes} == set(MODE_QUESTIONS)
    assert all(m["question"] == MODE_QUESTIONS[m["key"]] and m["description"] for m in modes)


def test_tools(cr):
    import json
    chart = cr[0]
    v = json.loads(run_tool(chart, "get_varga", {"n": 10}))
    assert v["lagna"] == "Pisces" and v["planets"]["Moon"]["sign"] == "Aries"
    d = json.loads(run_tool(chart, "get_dasha", {"start": "2027-01-01", "end": "2028-01-01", "depth": 2}))
    assert [p["lords"] for p in d["periods"]] == ["Saturn-Saturn", "Saturn-Mercury"]
    t = json.loads(run_tool(chart, "get_transits", {"date": "2026-11-14"}))
    assert t["positions"]["Saturn"]["sign"] == "Pisces" and t["sade_sati_active"] is True
    i = json.loads(run_tool(chart, "get_ingresses", {"planet": "Jupiter", "start": "2027-01-01", "end": "2028-01-01"}))
    assert [x["to"] for x in i["ingresses"]][:2] == ["Cancer", "Leo"]
    assert "error" in json.loads(run_tool(chart, "get_varga", {"n": 5}))
    assert "error" in json.loads(run_tool(chart, "nope", {}))


class FakeLLM:
    """Scripted model: calls a tool, then answers with one wrong fact, then fixes it when asked."""
    class cfg:
        model = "fake"

    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def complete(self, system, messages, tools):
        self.calls.append(messages[-1])
        if self.fail:
            raise LLMError("fake HTTP 500")
        last = messages[-1]
        if last["role"] == "user" and "automatic check" not in last["content"]:
            return {"text": "", "tool_calls": [{"id": "t1", "name": "get_varga", "args": {"n": 10}}], "usage": {}}
        if last["role"] == "tool":
            return {"text": 'Your <fact kind="dignity" planet="Mars" status="exalted">exalted Mars</fact> and '
                            '<fact kind="placement" planet="Saturn" house="10">Saturn in the 10th</fact>.',
                    "tool_calls": [], "usage": {}}
        assert "Mars" in last["content"] and "Own sign" in last["content"]   # repair prompt carries engine value
        return {"text": 'Your <fact kind="dignity" planet="Mars" status="own">Mars in its own sign</fact> and '
                        '<fact kind="placement" planet="Saturn" house="10">Saturn in the 10th</fact>.',
                "tool_calls": [], "usage": {}}


def test_session_tool_loop_and_repair(cr):
    s = ChatSession(*cr, llm=FakeLLM())
    out = s.ask("career?")
    assert out["mode"] == "llm" and out["repairs"] == 1
    assert out["summary"] == {"total": 2, "verified": 2, "contradicted": 0, "unverifiable": 0}
    assert out["tools_used"][0]["tool"] == "get_varga"
    assert "CHART CONTEXT" in s.system and "Pisces" in s.system
    assert "Analysis blueprint: Career" in s.llm.calls[0]["content"]
    assert "Prefetched engine evidence" in s.llm.calls[0]["content"]
    assert '"chart": "D10"' in s.llm.calls[0]["content"]
    assert "Pratyantardasha periods" in s.llm.calls[0]["content"]
    assert s.history[0] == {"role": "user", "content": "career?"}   # private instructions do not pollute chat history


def test_prediction_horizons_prefetch_the_right_evidence(cr):
    from chat.topics import detect_topic
    s = ChatSession(*cr, use_env_llm=False)
    monthly = s._topic_evidence(detect_topic(MODE_QUESTIONS["month"]))
    assert "Pratyantardasha periods" in monthly and "Sun sign changes" in monthly
    assert "Mars sign changes" in monthly
    lifetime = s._topic_evidence(detect_topic(MODE_QUESTIONS["lifetime"]))
    assert "Mahadasha periods" in lifetime and "Pratyantardasha periods" not in lifetime
    assert '"chart": "D9"' in lifetime


def test_session_falls_back_offline_on_provider_error(cr):
    out = ChatSession(*cr, llm=FakeLLM(fail=True)).ask("career?")
    assert out["mode"] == "offline" and "HTTP 500" in out["error"] and out["summary"]["contradicted"] == 0


def test_session_rejects_live_answer_that_stays_contradicted(cr):
    class WrongLLM:
        class cfg:
            model = "wrong"

        def complete(self, system, messages, tools):
            return {"text": '<fact kind="dignity" planet="Mars" status="exalted">Exalted Mars</fact>.',
                    "tool_calls": [], "usage": {}}

    out = ChatSession(*cr, llm=WrongLLM()).ask("career?")
    assert out["mode"] == "offline" and out["repairs"] == 2
    assert "Live answer rejected" in out["error"] and out["summary"]["contradicted"] == 0
