"""Nuvora Jyotish HTTP API + static UI.

Run:  .venv/Scripts/python -m uvicorn server.app:app --port 8600     (from D:/nuvora/jyotish)
Keep the origin private behind HTTPS. Chat sessions remain process-local; use one worker until moved to shared storage.
"""
from __future__ import annotations

import asyncio
import copy
import hashlib
import inspect
import json
import re
import secrets
import threading
from contextlib import asynccontextmanager
from collections import OrderedDict
from io import BytesIO
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from pypdf import PdfReader, PdfWriter

from chat import llm as llm_mod
from chat.context import build_context
from chat.jobs import ReadingJobs, public_job
from chat.prompt import REPAIR_PROMPT, SYSTEM_PROMPT
from .accounts import (account_state, delete_account_records, has_report_entitlement, refund_question,
                       refund_tarot_question, release_kundli_slot, require_user, reserve_kundli_slot,
                       reserve_question, reserve_tarot_question, _same_origin,
                       router as accounts_router)
from .google_auth import router as google_auth_router
from .admin import router as admin_router
from chat.session import ChatSession
from chat.topics import (ANALYSIS_MODES, MODE_QUESTIONS, PRECOMPUTE_QUESTIONS, PROMPT_LIBRARY,
                         QUICK_QUESTIONS, deep_prompt, is_decision_question)
from vedic import ENGINE_VERSION, BirthInput, Options, analyse
from vedic.matching import match_charts
from vedic.places import search as place_search, warm_index as warm_place_index
from vedic.astro import default_ephemeris
from vedic.transits import warm_ingress_cache
from .report_content import build_report
from .report_pdf import render_pdf
from .report_products import PRODUCTS
from .tarot_reading import interpret as interpret_tarot

llm_mod.load_env_file()

ROOT = Path(__file__).resolve().parent.parent
STATIC = Path(__file__).resolve().parent / "static"
MAX_SESSIONS = 200
_LOCKED_TOPIC_RE = re.compile(r"\byogas?\b|\bashtakavarga\b|birth[- ]time (?:check|sensitivity|accuracy)|time of birth (?:accuracy|sensitivity)|planet(?:ary)? strength|event windows?|योग|अष्टकवर्ग|जन्म\s*समय|ग्रह\s*बल", re.I)

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Build the city index before serving requests, not while a visitor waits for autocomplete.
    await asyncio.to_thread(warm_place_index)
    # Slow-planet sign changes are shared by every chart; fill that cache in the background so the
    # first visitors don't pay for it. Charts requested meanwhile simply compute the blocks they need.
    threading.Thread(target=lambda: warm_ingress_cache(default_ephemeris()), name="ingress-warmup",
                     daemon=True).start()
    yield


app = FastAPI(title="Nuvora Jyotish", version=ENGINE_VERSION, docs_url="/api/docs", redoc_url=None,
              lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")
app.include_router(accounts_router)
app.include_router(google_auth_router)
app.include_router(admin_router)
_sessions: "OrderedDict[str, tuple[int, ChatSession]]" = OrderedDict()
_lock = threading.Lock()
answer_jobs = ReadingJobs()


class DeleteAccountRequest(BaseModel):
    confirmation: str = Field(..., pattern=r"^DELETE MY ACCOUNT$")


class TarotRequest(BaseModel):
    question: str = Field(..., min_length=5, max_length=1000)
    spread: Literal[1, 3, 7] = 3
    language: Literal["en", "hi", "hi-Latn"] = "en"
    ai_consent: bool = False

    @field_validator("question")
    @classmethod
    def clean_question(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 5:
            raise ValueError("Write a question with at least five characters")
        return value


@app.delete("/api/auth/account")
def delete_account(req: DeleteAccountRequest, request: Request, response: Response,
                   user: dict = Depends(require_user)):
    _same_origin(request)
    user_id = user["id"]
    delete_account_records(user_id)
    with _lock:
        for chart_id, entry in list(_sessions.items()):
            if entry[0] == user_id:
                _sessions.pop(chart_id, None)
    answer_jobs.forget_user(user_id)
    response.delete_cookie("nuvora_session", path="/", httponly=True, samesite="lax")
    return {"ok": True}


class ChartRequest(BaseModel):
    name: str = Field("", max_length=80)
    gender: str | None = Field(None, max_length=20)
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str = Field(..., pattern=r"^\d{1,2}:\d{2}(:\d{2})?$")
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    tz: str | None = Field(None, max_length=64)
    utc_offset_hours: float | None = Field(None, ge=-14, le=14)
    place: str = Field("", max_length=160)
    kundli_id: str | None = Field(None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    language: str = Field("en", pattern=r"^(en|hi|hi-Latn)$")
    ai_consent: bool = False
    node: str = "TRUE"
    dasha_year: str = "julian"
    node_aspects: bool = True

    @field_validator("node")
    @classmethod
    def _node(cls, v):
        v = v.upper()
        if v not in ("TRUE", "MEAN"):
            raise ValueError("node must be TRUE or MEAN")
        return v

    @field_validator("dasha_year")
    @classmethod
    def _year(cls, v):
        if v not in ("julian", "gregorian", "savana"):
            raise ValueError("dasha_year must be julian, gregorian or savana")
        return v


class ChatRequest(BaseModel):
    chart_id: str = Field(..., min_length=8, max_length=64)
    message: str = Field(..., min_length=1, max_length=4000)
    language: str = Field("en", pattern=r"^(en|hi|hi-Latn)$")


class WarmRequest(BaseModel):
    chart_id: str = Field(..., min_length=8, max_length=64)
    language: str = Field("en", pattern=r"^(en|hi|hi-Latn)$")


class MatchRequest(BaseModel):
    person1: ChartRequest
    person2: ChartRequest


class ReportPdfRequest(BaseModel):
    chart_id: str = Field(..., min_length=8, max_length=64)
    product: str = Field("core", pattern=r"^[a-z0-9_]{1,32}$")
    person2: ChartRequest | None = None


@app.get("/api/status")
def status():
    acc_path = ROOT / "reports" / "accuracy.json"
    acc = json.loads(acc_path.read_text(encoding="utf-8")) if acc_path.exists() else None
    from .accounts import _purchase_terms
    return {"engine": ENGINE_VERSION, "llm": llm_mod.status(), "accuracy": acc,
            "support_email": _purchase_terms()["support_email"],
            "attribution": "Place data: GeoNames.org (CC BY 4.0). Ephemeris: NASA JPL DE440s."}


@app.post("/api/tarot/read")
def tarot_read(req: TarotRequest, request: Request, user: dict = Depends(require_user)):
    _same_origin(request)
    reserve_tarot_question(user["id"])
    try:
        reader = llm_mod.get_llm() if req.ai_consent else None
        result = interpret_tarot(req.question, req.spread, req.language, reader, req.ai_consent)
    except Exception:
        refund_tarot_question(user["id"])
        raise HTTPException(502, "The Tarot reading could not be completed; your free question was restored.") from None
    state = account_state(user["id"])
    return {**result, "usage": state["tarot"], "language": req.language,
            "ai_available": bool(llm_mod.status().get("configured"))}


@app.get("/api/analysis-modes")
def analysis_modes():
    """Single source of truth for the deep-analysis launcher in the static client."""
    return {"modes": [{"key": key, "label": label, "description": description,
                       "question": MODE_QUESTIONS[key]}
                      for key, label, description in ANALYSIS_MODES],
            "library": PROMPT_LIBRARY, "suggestions": QUICK_QUESTIONS}


@app.get("/api/places")
def places(q: str = Query(..., min_length=2, max_length=80), limit: int = Query(8, ge=1, le=20)):
    return {"results": place_search(q, limit)}


def _calculate_chart(req: ChartRequest):
    y, m, d = map(int, req.date.split("-"))
    hms = [int(x) for x in req.time.split(":")] + [0]
    if not (0 <= hms[0] <= 23 and 0 <= hms[1] <= 59 and 0 <= hms[2] <= 59):
        raise HTTPException(400, "Invalid time")
    if not req.tz and req.utc_offset_hours is None:
        raise HTTPException(400, "Provide a timezone (pick a city) or a UTC offset")
    birth = BirthInput(year=y, month=m, day=d, hour=hms[0], minute=hms[1], second=hms[2], lat=req.lat, lon=req.lon,
                       tz_name=req.tz or None, utc_offset_hours=None if req.tz else req.utc_offset_hours,
                       name=req.name.strip(), gender=req.gender, place=req.place.strip())
    try:
        return analyse(birth, Options(node=req.node, dasha_year=req.dasha_year, node_aspects=req.node_aspects))
    except ValueError as e:
        raise HTTPException(400, str(e)) from None


def _free_chart_preview(report: dict) -> dict:
    """Only birth details are public; the full report stays server-side for the two free chat answers."""
    return {"birth": copy.deepcopy(report.get("birth", {}))}


def _chart_key(req: ChartRequest) -> str:
    payload = req.model_dump(exclude={"language"})
    cfg = llm_mod.LLMConfig.from_env()
    payload["engine"] = ENGINE_VERSION
    payload["model"] = cfg.model if cfg and req.ai_consent else "offline"
    payload["provider"] = cfg.provider if cfg and req.ai_consent else "offline"
    payload["endpoint"] = cfg.base_url if cfg and req.ai_consent else "offline"
    prompt_material = "\n".join((
        SYSTEM_PROMPT,
        REPAIR_PROMPT,
        json.dumps(PROMPT_LIBRARY, ensure_ascii=False, sort_keys=True),
        json.dumps(PRECOMPUTE_QUESTIONS, ensure_ascii=False),
        inspect.getsource(deep_prompt),
        inspect.getsource(build_context),
        inspect.getsource(ChatSession.ask),
        inspect.getsource(ChatSession._topic_evidence),
        (Path(__file__).resolve().parent.parent / "chat" / "topics.py").read_text(encoding="utf-8"),
        (Path(__file__).resolve().parent.parent / "chat" / "golden.py").read_text(encoding="utf-8"),
        (Path(__file__).resolve().parent.parent / "chat" / "offline.py").read_text(encoding="utf-8"),
    ))
    payload["reader_prompt"] = hashlib.sha256(prompt_material.encode("utf-8")).hexdigest()
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _background_runner(sess: ChatSession, question: str, language: str):
    def run():
        fresh = ChatSession(sess.chart, sess.report, llm=sess.llm)
        return fresh.ask(question, language)
    return run


def _prewarm(user_id: int, req: ChartRequest, sess: ChatSession, language: str) -> int:
    if not sess.llm:
        return 0
    chart_key = _chart_key(req)
    count = 0
    for question in PRECOMPUTE_QUESTIONS:
        if is_decision_question(question):
            continue
        job = answer_jobs.submit(user_id, chart_key, question, language,
                                 _background_runner(sess, question, language))
        if not job.from_cache:
            count += 1
    return count


def _user_session(chart_id: str, user_id: int) -> ChatSession | None:
    with _lock:
        entry = _sessions.get(chart_id)
        if entry and entry[0] == user_id:
            _sessions.move_to_end(chart_id)
            return entry[1]
    return None


@app.post("/api/chart")
def chart(req: ChartRequest, user: dict = Depends(require_user)):
    kundli_id = req.kundli_id or ("k" + secrets.token_urlsafe(12))
    reserved = reserve_kundli_slot(user["id"], kundli_id)
    try:
        c, full_report = _calculate_chart(req)
        paid = account_state(user["id"])["subscription"]["active"]
        client_report = full_report if paid else _free_chart_preview(full_report)
        sess = ChatSession(c, full_report, use_env_llm=req.ai_consent)
        sess.chart_request = req
        sess.full_report = full_report
        cid = secrets.token_urlsafe(16)
        with _lock:
            _sessions[cid] = (user["id"], sess)
            while len(_sessions) > MAX_SESSIONS:
                _sessions.popitem(last=False)
        prepared = _prewarm(user["id"], req, sess, req.language) if paid else 0
    except Exception:
        if reserved:
            release_kundli_slot(user["id"], kundli_id)
        raise
    return {"chart_id": cid, "kundli_id": kundli_id, "report": client_report,
            "access": {"premium": paid, "report_preview_percent": 100 if paid else 0,
                       "locked_sections": [] if paid else ["summary", "chart", "planets", "dashas", "transits", "yogas", "ashtakavarga", "birth_time", "strength", "timing", "events"]},
            "chat": {"mode": "llm" if sess.llm else "offline",
                     "label": sess.reader_label(),
                     "preparing": prepared}}


@app.post("/api/reports/pdf")
def report_pdf(req: ReportPdfRequest, user: dict = Depends(require_user)):
    sess = _user_session(req.chart_id, user["id"])
    if sess is None or not hasattr(sess, "chart"):
        raise HTTPException(404, "Chart session expired; please recalculate the chart")
    if req.product != "core" and req.product not in PRODUCTS:
        raise HTTPException(400, "Unknown report product")
    if req.product == "core":
        if not account_state(user["id"])["subscription"]["active"]:
            raise HTTPException(402, "Choose a pass to unlock the core Kundli PDF")
    elif not has_report_entitlement(user["id"], req.product):
        raise HTTPException(402, "Purchase this standalone report to unlock its instant PDF")
    full_report = getattr(sess, "full_report", sess.report)
    c2 = r2 = None
    if req.product == "match":
        if req.person2 is None:
            raise HTTPException(400, "Provide the second person's birth details for matchmaking")
        c2, r2 = _calculate_chart(req.person2)
    try:
        title, subtitle, sections = build_report(req.product, sess.chart, full_report, c2, r2)
        content = render_pdf(title, subtitle, sections)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    safe_name = re.sub(r"[^a-z0-9_-]+", "-", req.product.lower()).strip("-")
    return Response(content, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="nuvora-{safe_name}-kundli.pdf"',
        "Cache-Control": "private, no-store",
    })


@app.post("/api/reports/sample")
def report_sample(req: ReportPdfRequest, user: dict = Depends(require_user)):
    """Return one product-specific page from the same chart-derived PDF layout."""
    sess = _user_session(req.chart_id, user["id"])
    if sess is None or not hasattr(sess, "chart"):
        raise HTTPException(404, "Chart session expired; please recalculate the chart")
    if req.product not in PRODUCTS:
        raise HTTPException(400, "Unknown report product")
    full_report = getattr(sess, "full_report", sess.report)
    c2 = r2 = None
    sample_note = "Preview from your currently selected calculated chart."
    if req.product == "match":
        sample_partner = req.person2 or ChartRequest(
            name="Illustrative sample person", date="1992-05-16", time="12:00", lat=28.6139, lon=77.2090,
            tz="Asia/Kolkata", place="New Delhi (illustrative sample)")
        c2, r2 = _calculate_chart(sample_partner)
        if req.person2 is None:
            sample_note = "Illustrative sample page; the second chart is an example, not a partner forecast."
    try:
        title, subtitle, sections = build_report(req.product, sess.chart, full_report, c2, r2)
        sample_section = next((item for item in sections if item.get("sample")), sections[-1])
        complete_pdf = render_pdf(title, sample_note, [sample_section])
        reader = PdfReader(BytesIO(complete_pdf))
        if len(reader.pages) < 2:
            raise RuntimeError("Sample PDF did not include its report page")
        writer = PdfWriter()
        writer.add_page(reader.pages[1])
        output = BytesIO()
        writer.write(output)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    safe_name = re.sub(r"[^a-z0-9_-]+", "-", req.product.lower()).strip("-")
    return Response(output.getvalue(), media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="nuvora-{safe_name}-sample.pdf"',
        "Cache-Control": "private, no-store",
    })


@app.post("/api/match")
def match(req: MatchRequest, user: dict = Depends(require_user)):
    if not has_report_entitlement(user["id"], "match"):
        raise HTTPException(402, "Purchase the matchmaking report to unlock compatibility analysis")
    c1, r1 = _calculate_chart(req.person1)
    c2, r2 = _calculate_chart(req.person2)
    return match_charts(c1, c2, r1, r2)


@app.post("/api/chat")
def chat(req: ChatRequest, user: dict = Depends(require_user)):
    sess = _user_session(req.chart_id, user["id"])
    if sess is None:
        raise HTTPException(404, "Chart session expired; please recalculate the chart")
    if not account_state(user["id"])["subscription"]["active"] and _LOCKED_TOPIC_RE.search(req.message):
        raise HTTPException(402, "Yogas, Ashtakavarga, and birth-time analysis are premium sections. This question was not deducted from your free allowance.")
    reserved_free = reserve_question(user["id"])
    try:
        if not sess.llm:
            return {**sess.ask(req.message, req.language), "status": "ready", "cached": False}
        chart_req = getattr(sess, "chart_request", None)
        chart_key = (_chart_key(chart_req) if chart_req else hashlib.sha256(
            f"{user['id']}:{req.chart_id}".encode("utf-8")).hexdigest())
        use_cache = req.message in PRECOMPUTE_QUESTIONS and not is_decision_question(req.message)
        job = answer_jobs.submit(user["id"], chart_key, req.message, req.language,
                                 lambda: sess.ask(req.message, req.language), use_cache=use_cache,
                                 on_error=(lambda: refund_question(user["id"])) if reserved_free else None,
                                 interactive=True)
        result = public_job(job)
        if result["status"] == "preparing":
            return JSONResponse(result, status_code=202)
        return result
    except Exception:
        if reserved_free:
            refund_question(user["id"])
        raise


@app.post("/api/chat/warm")
def warm_chat(req: WarmRequest, user: dict = Depends(require_user)):
    sess = _user_session(req.chart_id, user["id"])
    if sess is None:
        raise HTTPException(404, "Chart session expired; please recalculate the chart")
    if not sess.llm or not account_state(user["id"])["subscription"]["active"]:
        return {"status": "idle", "preparing": 0}
    chart_req = getattr(sess, "chart_request", None)
    if chart_req is None:
        return {"status": "idle", "preparing": 0}
    return {"status": "preparing", "preparing": _prewarm(user["id"], chart_req, sess, req.language)}


@app.get("/api/chat/jobs/{job_id}")
def chat_job(job_id: str, user: dict = Depends(require_user)):
    job = answer_jobs.get(job_id, user["id"])
    if job is None:
        raise HTTPException(404, "Reading job expired; please ask again")
    return public_job(job)


@app.exception_handler(Exception)
def _unhandled(request, exc):
    # never leak internals (or config) in error bodies
    return JSONResponse({"detail": "Internal error"}, status_code=500)


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/admin")
def admin_page():
    # The page is an empty shell; all data comes from the admin-only API.
    return FileResponse(STATIC / "admin.html", headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex"})
