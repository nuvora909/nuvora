"""Account sessions, question entitlements, and one-time checkout."""
from __future__ import annotations

import base64, calendar, hashlib, hmac, json, os, re, secrets, sqlite3, threading, time, urllib.error, urllib.request, uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

from .report_products import OFFER_END_ISO, PRODUCTS, catalogue as report_catalogue, price as report_price
from . import youpi

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("NUVORA_AUTH_DB", str(ROOT / "data" / "nuvora.sqlite3")))
if not DB_PATH.is_absolute(): DB_PATH = ROOT / DB_PATH
SESSION_COOKIE, SESSION_DAYS, FREE_QUESTION_LIMIT = "nuvora_session", 30, 2
PASSWORD_ITERATIONS = 310_000
router = APIRouter()
_db_lock = threading.Lock()
_initialized_path: str | None = None
_login_lock = threading.Lock()
_login_failures: dict[str, list[float]] = {}
_token_lock = threading.Lock()
_token: str | None = None
_token_expiry = 0.0

class AuthBody(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=12, max_length=128)
    country_code: str | None = Field(None, max_length=8)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", value): raise ValueError("Enter a valid email address")
        return value

    @field_validator("country_code")
    @classmethod
    def normalize_country(cls, value: str | None) -> str | None:
        if not value or not value.strip(): return None
        value = value.strip().upper()
        if value == "OTHER": return "GB"
        if value not in ("IN", "GB"): raise ValueError("Choose India or UK / international billing")
        return value

class PlanBody(BaseModel):
    plan: Literal["week", "six_months", "year"]

class CaptureBody(BaseModel):
    order_id: str = Field(..., min_length=5, max_length=100, pattern=r"^[A-Za-z0-9-]+$")

class ReportOrderBody(BaseModel):
    product: Literal["life_1", "life_5", "life_10", "life_20", "sade_sati", "dosha", "match", "marriage", "rudraksha", "gemstone"]

def _now() -> datetime: return datetime.now(timezone.utc).replace(microsecond=0)
def _now_iso() -> str: return _now().isoformat(timespec="seconds")

def init_db() -> None:
    global _initialized_path
    path = str(Path(DB_PATH).resolve())
    if _initialized_path == path and Path(path).exists(): return
    with _db_lock:
        if _initialized_path == path and Path(path).exists(): return
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, timeout=10)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
                    google_sub TEXT UNIQUE, google_email_verified_at TEXT, auth_provider TEXT NOT NULL DEFAULT 'password'
                        CHECK(auth_provider IN ('password','google')), country_code TEXT NOT NULL DEFAULT 'GB',
                    free_questions_used INTEGER NOT NULL DEFAULT 0 CHECK(free_questions_used >= 0),
                    plan TEXT, plan_expires_at TEXT, kundli_slots INTEGER NOT NULL DEFAULT 1 CHECK(kundli_slots >= 1), created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
                CREATE TABLE IF NOT EXISTS google_auth_replays (
                    google_sub TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS google_auth_replays_expiry_idx ON google_auth_replays(expires_at);
                CREATE TABLE IF NOT EXISTS billing_orders (
                    local_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    paypal_order_id TEXT UNIQUE, plan TEXT NOT NULL CHECK(plan IN ('week','six_months','year','month','annual','life_1','life_5','life_10','life_20','sade_sati','dosha','match','marriage','rudraksha','gemstone')),
                    purchase_type TEXT NOT NULL DEFAULT 'pass' CHECK(purchase_type IN ('pass','kundli_slot','report')),
                    currency TEXT NOT NULL, amount TEXT NOT NULL, status TEXT NOT NULL,
                    capture_id TEXT UNIQUE, created_at TEXT NOT NULL, paid_at TEXT,
                    provider TEXT NOT NULL DEFAULT 'paypal', provider_payment_id TEXT,
                    gateway_status TEXT, settlement_state TEXT, utr TEXT, updated_at TEXT);
                CREATE INDEX IF NOT EXISTS billing_user_idx ON billing_orders(user_id, created_at);
                CREATE TABLE IF NOT EXISTS saved_kundlis (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    client_id TEXT NOT NULL, created_at TEXT NOT NULL,
                    PRIMARY KEY(user_id, client_id));
                CREATE INDEX IF NOT EXISTS kundlis_user_idx ON saved_kundlis(user_id);
            """)
            user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
            if "kundli_slots" not in user_columns:
                conn.execute("ALTER TABLE users ADD COLUMN kundli_slots INTEGER NOT NULL DEFAULT 1 CHECK(kundli_slots >= 1)")
            if "role" not in user_columns:
                conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'))")
            if "google_sub" not in user_columns:
                conn.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")
            if "google_email_verified_at" not in user_columns:
                conn.execute("ALTER TABLE users ADD COLUMN google_email_verified_at TEXT")
            if "auth_provider" not in user_columns:
                conn.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'")
            if "tarot_questions_used" not in user_columns:
                conn.execute("ALTER TABLE users ADD COLUMN tarot_questions_used INTEGER NOT NULL DEFAULT 0 CHECK(tarot_questions_used >= 0)")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub)")
            order_columns = {row[1] for row in conn.execute("PRAGMA table_info(billing_orders)")}
            if "purchase_type" not in order_columns:
                conn.execute("ALTER TABLE billing_orders ADD COLUMN purchase_type TEXT NOT NULL DEFAULT 'pass' CHECK(purchase_type IN ('pass','kundli_slot'))")
            _migrate_billing_plans(conn)
            _migrate_report_products(conn)
            _migrate_youpi(conn)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS report_entitlements (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    product TEXT NOT NULL, order_id TEXT NOT NULL UNIQUE, granted_at TEXT NOT NULL,
                    PRIMARY KEY(user_id, product))
            """)
            _provision_admin(conn)
            conn.commit()
        finally: conn.close()
        _initialized_path = path

def _migrate_billing_plans(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='billing_orders'").fetchone()
    if not row or "'six_months'" in (row[0] or ""):
        return
    conn.executescript("""
        CREATE TABLE billing_orders_new (
            local_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            paypal_order_id TEXT UNIQUE, plan TEXT NOT NULL CHECK(plan IN ('week','six_months','year','month','annual')),
            purchase_type TEXT NOT NULL DEFAULT 'pass' CHECK(purchase_type IN ('pass','kundli_slot')),
            currency TEXT NOT NULL, amount TEXT NOT NULL, status TEXT NOT NULL,
            capture_id TEXT UNIQUE, created_at TEXT NOT NULL, paid_at TEXT);
        INSERT INTO billing_orders_new(local_id,user_id,paypal_order_id,plan,purchase_type,currency,amount,status,capture_id,created_at,paid_at)
            SELECT local_id,user_id,paypal_order_id,plan,purchase_type,currency,amount,status,capture_id,created_at,paid_at FROM billing_orders;
        DROP TABLE billing_orders;
        ALTER TABLE billing_orders_new RENAME TO billing_orders;
        CREATE INDEX billing_user_idx ON billing_orders(user_id, created_at);
    """)


def _migrate_report_products(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='billing_orders'").fetchone()
    if not row or "'report'" in (row[0] or ""):
        return
    conn.executescript("""
        CREATE TABLE billing_orders_new (
            local_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            paypal_order_id TEXT UNIQUE, plan TEXT NOT NULL CHECK(plan IN ('week','six_months','year','month','annual','life_1','life_5','life_10','life_20','sade_sati','dosha','match','marriage','rudraksha','gemstone')),
            purchase_type TEXT NOT NULL DEFAULT 'pass' CHECK(purchase_type IN ('pass','kundli_slot','report')),
            currency TEXT NOT NULL, amount TEXT NOT NULL, status TEXT NOT NULL,
            capture_id TEXT UNIQUE, created_at TEXT NOT NULL, paid_at TEXT);
        INSERT INTO billing_orders_new(local_id,user_id,paypal_order_id,plan,purchase_type,currency,amount,status,capture_id,created_at,paid_at)
            SELECT local_id,user_id,paypal_order_id,plan,purchase_type,currency,amount,status,capture_id,created_at,paid_at FROM billing_orders;
        DROP TABLE billing_orders;
        ALTER TABLE billing_orders_new RENAME TO billing_orders;
        CREATE INDEX billing_user_idx ON billing_orders(user_id, created_at);
    """)


def _migrate_youpi(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(billing_orders)")}
    additions = {
        "provider": "TEXT NOT NULL DEFAULT 'paypal'",
        "provider_payment_id": "TEXT",
        "gateway_status": "TEXT",
        "settlement_state": "TEXT",
        "utr": "TEXT",
        "updated_at": "TEXT",
    }
    for name, definition in additions.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE billing_orders ADD COLUMN {name} {definition}")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS billing_provider_payment_unique ON billing_orders(provider_payment_id) WHERE provider_payment_id IS NOT NULL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS youpi_webhook_events (
            delivery_id TEXT PRIMARY KEY, payment_id TEXT NOT NULL,
            event TEXT NOT NULL, received_at TEXT NOT NULL)
    """)


def _db() -> sqlite3.Connection:
    init_db()
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(PASSWORD_ITERATIONS, salt.hex(), digest.hex())

def _configured_admin_email() -> str:
    value = os.environ.get("NUVORA_ADMIN_EMAIL", "nuvora909@gmail.com").strip().lower()
    if value.count("@") != 1 or "." not in value.rsplit("@", 1)[-1]:
        return ""
    return value


def _configured_admin_password() -> str | None:
    value = os.environ.get("NUVORA_ADMIN_PASSWORD", "")
    email = _configured_admin_email()
    if len(value) < 16 or not email or hmac.compare_digest(value.casefold(), email.casefold()):
        return None
    return value


def _provision_admin(conn: sqlite3.Connection) -> None:
    email, password = _configured_admin_email(), _configured_admin_password()
    if not email or password is None:
        return
    password_hash = _hash_password(password)
    row = conn.execute("SELECT id FROM users WHERE email=? COLLATE NOCASE", (email,)).fetchone()
    if row:
        conn.execute("UPDATE users SET role='admin',password_hash=? WHERE id=?", (password_hash, row[0]))
    else:
        conn.execute("INSERT INTO users(email,password_hash,role,country_code,created_at) VALUES(?,?,'admin',?,?)",
                     (email, password_hash, _default_country(), _now_iso()))


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algo, rounds, salt, expected = encoded.split("$", 3)
        got = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds)).hex()
        return algo == "pbkdf2_sha256" and hmac.compare_digest(got, expected)
    except (ValueError, TypeError): return False

def _geo_country(request: Request) -> str | None:
    if os.environ.get("NUVORA_TRUST_GEO_HEADERS", "false").lower() not in ("1", "true", "yes"): return None
    for header in ("cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country"):
        code = request.headers.get(header, "").strip().upper()
        if re.fullmatch(r"[A-Z]{2}", code) and code not in ("XX", "T1"): return "IN" if code == "IN" else "GB"
    return None

def _language_country(request: Request) -> str | None:
    for item in request.headers.get("accept-language", "").split(","):
        pieces = item.split(";", 1)[0].strip().replace("_", "-").split("-")
        if len(pieces) > 1 and pieces[-1].upper() in ("IN", "GB"): return pieces[-1].upper()
    return None

def _default_country() -> str:
    value = os.environ.get("NUVORA_DEFAULT_COUNTRY", "GB").upper()
    return value if value in ("IN", "GB") else "GB"

def _country(request: Request, user: dict | None = None, submitted: str | None = None) -> tuple[str, str]:
    geo = _geo_country(request)
    if geo: return geo, "trusted network country"
    if submitted in ("IN", "GB"): return submitted, "selected at signup"
    if user and user.get("country_code") in ("IN", "GB"): return user["country_code"], "account billing region"
    lang = _language_country(request)
    if lang: return lang, "browser language hint"
    return _default_country(), "default international region"

def _currency(country: str) -> tuple[str, str]: return ("INR", "₹") if country == "IN" else ("GBP", "£")

def _same_origin(request: Request) -> None:
    origin, host = request.headers.get("origin"), request.headers.get("host", "")
    if origin and urlsplit(origin).netloc.lower() != host.lower(): raise HTTPException(403, "Cross-origin request rejected")

def _new_session(user_id: int, request: Request, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    now, expiry = _now(), _now() + timedelta(days=SESSION_DAYS)
    conn = _db()
    try:
        conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now.isoformat(timespec="seconds"),))
        conn.execute("INSERT INTO sessions VALUES(?,?,?,?)",
                     (hashlib.sha256(token.encode()).hexdigest(), user_id, expiry.isoformat(timespec="seconds"), now.isoformat(timespec="seconds")))
        conn.commit()
    finally: conn.close()
    https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").split(",")[0].strip() == "https"
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, secure=https, samesite="lax", path="/")

def require_user(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if not token: raise HTTPException(401, "Sign in to continue")
    conn = _db()
    try:
        row = conn.execute("SELECT u.id,u.email,u.country_code,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
                           (hashlib.sha256(token.encode()).hexdigest(), _now_iso())).fetchone()
    finally: conn.close()
    if row is None: raise HTTPException(401, "Session expired; sign in again")
    return {"id": int(row["id"]), "email": row["email"], "country_code": row["country_code"],
            "role": row["role"], "is_admin": row["role"] == "admin"}

def _state(user_id: int) -> dict:
    conn = _db()
    try:
        row = conn.execute("SELECT id,email,country_code,role,google_sub,google_email_verified_at,auth_provider,free_questions_used,tarot_questions_used,plan,plan_expires_at,kundli_slots FROM users WHERE id=?", (user_id,)).fetchone()
        used_kundlis = int(conn.execute("SELECT COUNT(*) FROM saved_kundlis WHERE user_id=?", (user_id,)).fetchone()[0])
        owned_reports = [row[0] for row in conn.execute("SELECT product FROM report_entitlements WHERE user_id=? ORDER BY granted_at", (user_id,))]
    finally: conn.close()
    if row is None: raise HTTPException(401, "Account not found")
    expiry = datetime.fromisoformat(row["plan_expires_at"]) if row["plan_expires_at"] else None
    is_admin = row["role"] == "admin"
    active = is_admin or bool(row["plan"] and expiry and expiry > _now())
    used = int(row["free_questions_used"])
    slots = int(row["kundli_slots"])
    user_info = {"id": int(row["id"]), "email": row["email"], "country_code": row["country_code"],
                 "role": row["role"], "is_admin": is_admin, "auth_provider": row["auth_provider"],
                 "google_linked": bool(row["google_sub"] and row["google_email_verified_at"])}
    usage = {"free_limit": 2, "free_used": used, "free_remaining": max(0, 2-used)}
    tarot = {"free_limit": 2, "free_used": int(row["tarot_questions_used"]),
             "free_remaining": max(0, 2-int(row["tarot_questions_used"]))}
    kundlis = {"slots": slots, "used": used_kundlis, "remaining": max(0, slots-used_kundlis)}
    if is_admin:
        usage = {"free_limit": None, "free_used": used, "free_remaining": None, "unlimited": True}
        tarot = {"free_limit": None, "free_used": int(row["tarot_questions_used"]),
                 "free_remaining": None, "unlimited": True}
        kundlis = {"slots": None, "used": used_kundlis, "remaining": None, "unlimited": True}
    return {"user": user_info, "usage": usage, "tarot": tarot, "kundlis": kundlis, "reports": list(PRODUCTS) if is_admin else owned_reports,
            "subscription": {"active": active, "plan": "admin" if is_admin else (row["plan"] if active else None),
                             "expires_at": None if is_admin else row["plan_expires_at"]}}


def account_state(user_id: int) -> dict:
    return _state(user_id)


def has_report_entitlement(user_id: int, product: str) -> bool:
    return product in _state(user_id)["reports"]


_KUNDLI_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def reserve_kundli_slot(user_id: int, client_id: str) -> bool:
    """Atomically reserve a saved-chart slot; return True when a new slot was consumed."""
    if not isinstance(client_id, str) or not _KUNDLI_ID.fullmatch(client_id):
        raise HTTPException(422, "Invalid Kundli reference")
    conn = _db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute("SELECT 1 FROM saved_kundlis WHERE user_id=? AND client_id=?", (user_id, client_id)).fetchone()
        if existing:
            conn.commit()
            return False
        user = conn.execute("SELECT kundli_slots,role FROM users WHERE id=?", (user_id,)).fetchone()
        if user is None:
            conn.rollback()
            raise HTTPException(401, "Account not found")
        if user["role"] == "admin":
            conn.commit()
            return False
        used = int(conn.execute("SELECT COUNT(*) FROM saved_kundlis WHERE user_id=?", (user_id,)).fetchone()[0])
        if used >= int(user["kundli_slots"]):
            conn.rollback()
            raise HTTPException(402, "Your included saved-Kundli slot is in use. Purchase an additional slot to create another Kundli.")
        conn.execute("INSERT INTO saved_kundlis(user_id,client_id,created_at) VALUES(?,?,?)", (user_id, client_id, _now_iso()))
        conn.commit()
        return True
    finally: conn.close()


def release_kundli_slot(user_id: int, client_id: str) -> None:
    conn = _db()
    try:
        conn.execute("DELETE FROM saved_kundlis WHERE user_id=? AND client_id=?", (user_id, client_id))
        conn.commit()
    finally: conn.close()


def delete_account_records(user_id: int) -> None:
    """Delete an account and its account-scoped records in one transaction."""
    conn = _db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT role,google_sub FROM users WHERE id=?", (user_id,)).fetchone()
        if row is None:
            conn.rollback()
            raise HTTPException(401, "Account not found")
        if row["role"] == "admin":
            conn.rollback()
            raise HTTPException(403, "The administrator account cannot be deleted here")
        if row["google_sub"]:
            conn.execute("DELETE FROM google_auth_replays WHERE google_sub=?", (row["google_sub"],))
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        conn.commit()
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        conn.close()

@router.delete("/api/kundlis/{client_id}")
def delete_kundli(client_id: str, request: Request, user: dict = Depends(require_user)):
    _same_origin(request)
    release_kundli_slot(user["id"], client_id)
    return {"ok": True, "account": _state(user["id"])}


@router.get("/api/auth/region")
def auth_region(request: Request):
    country, source = _country(request)
    currency, symbol = _currency(country)
    return {"country_code": country, "currency": currency, "symbol": symbol, "source": source,
            "google_client_id": os.environ.get("NUVORA_GOOGLE_CLIENT_ID", "").strip() or None}

def _session_response(user_id: int, request: Request, response: Response) -> dict:
    _new_session(user_id, request, response)
    return _state(user_id)


@router.post("/api/auth/signup", status_code=201)
def signup(body: AuthBody, request: Request, response: Response):
    _same_origin(request)
    if body.email == _configured_admin_email():
        raise HTTPException(409, "This email is reserved for the configured administrator account")
    country, _ = _country(request, submitted=body.country_code)
    conn = _db()
    try:
        cursor = conn.execute("INSERT INTO users(email,password_hash,country_code,created_at) VALUES(?,?,?,?)",
                              (body.email, _hash_password(body.password), country, _now_iso()))
        user_id = int(cursor.lastrowid); conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback(); raise HTTPException(409, "An account with that email already exists") from None
    finally: conn.close()
    return _session_response(user_id, request, response)

@router.post("/api/auth/login")
def login(body: AuthBody, request: Request, response: Response):
    _same_origin(request)
    ip = request.client.host if request.client else "unknown"
    key = hashlib.sha256((body.email + "|" + ip).encode()).hexdigest()
    now = time.monotonic()
    with _login_lock:
        recent = [t for t in _login_failures.get(key, []) if now-t < 900]
        _login_failures[key] = recent
        limited = len(recent) >= 8
    if limited: raise HTTPException(429, "Too many sign-in attempts. Wait 15 minutes and try again.")
    conn = _db()
    try: row = conn.execute("SELECT id,password_hash FROM users WHERE email=? COLLATE NOCASE", (body.email,)).fetchone()
    finally: conn.close()
    if row is None or not _verify_password(body.password, row["password_hash"]):
        with _login_lock: _login_failures.setdefault(key, []).append(time.monotonic())
        raise HTTPException(401, "Email or password is incorrect") from None
    with _login_lock: _login_failures.pop(key, None)
    user_id = int(row["id"]); return _session_response(user_id, request, response)

@router.post("/api/auth/logout")
def logout(request: Request, response: Response):
    _same_origin(request)
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        conn = _db()
        try: conn.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),)); conn.commit()
        finally: conn.close()
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax")
    return {"ok": True}

@router.get("/api/auth/me")
def who_am_i(user: dict = Depends(require_user)): return _state(user["id"])

def reserve_question(user_id: int) -> bool:
    """Atomically reserve one free question; True means a free credit was consumed."""
    conn = _db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT free_questions_used,plan,plan_expires_at,role FROM users WHERE id=?", (user_id,)).fetchone()
        if row is None: conn.rollback(); raise HTTPException(401, "Sign in to continue")
        if row["role"] == "admin": conn.commit(); return False
        expiry = datetime.fromisoformat(row["plan_expires_at"]) if row["plan_expires_at"] else None
        if row["plan"] and expiry and expiry > _now(): conn.commit(); return False
        if int(row["free_questions_used"]) >= 2:
            conn.rollback(); raise HTTPException(402, "Free questions used. Choose a pass to continue.")
        conn.execute("UPDATE users SET free_questions_used=free_questions_used+1 WHERE id=?", (user_id,)); conn.commit(); return True
    finally: conn.close()

def refund_question(user_id: int) -> None:
    conn = _db()
    try: conn.execute("UPDATE users SET free_questions_used=MAX(0,free_questions_used-1) WHERE id=?", (user_id,)); conn.commit()
    finally: conn.close()


def reserve_tarot_question(user_id: int) -> int:
    """Consume a free Tarot reading; administrator accounts have no cap."""
    conn = _db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT role,tarot_questions_used FROM users WHERE id=?", (user_id,)).fetchone()
        if row is None:
            conn.rollback()
            raise HTTPException(401, "Account not found")
        used = int(row["tarot_questions_used"])
        if row["role"] != "admin" and used >= 2:
            conn.rollback()
            raise HTTPException(402, "You have used your two free Tarot readings for this account.")
        used += 1
        conn.execute("UPDATE users SET tarot_questions_used=? WHERE id=?", (used, user_id))
        conn.commit()
        return used
    finally:
        conn.close()


def refund_tarot_question(user_id: int) -> None:
    conn = _db()
    try:
        conn.execute("UPDATE users SET tarot_questions_used=MAX(0,tarot_questions_used-1) WHERE id=?", (user_id,))
        conn.commit()
    finally:
        conn.close()

def _paypal_ready() -> bool:
    return bool(os.environ.get("PAYPAL_CLIENT_ID", "").strip() and os.environ.get("PAYPAL_CLIENT_SECRET", "").strip())


def _purchase_terms() -> dict:
    refund_policy = os.environ.get("NUVORA_REFUND_POLICY_TEXT", "").strip()
    support_email = os.environ.get("NUVORA_SUPPORT_EMAIL", "").strip()
    email_ok = bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", support_email))
    policy_ok = len(refund_policy) >= 40 and not re.search(r"\b(tbd|todo|placeholder)\b", refund_policy, re.I)
    return {
        "published": bool(policy_ok and email_ok),
        "refund_policy": refund_policy if policy_ok and email_ok else None,
        "support_email": support_email if email_ok else None,
        "delivery": "Digital access appears in Reports once payment is verified. PayPal access follows capture; UPI access follows confirmed bank reconciliation.",
    }


def _require_purchase_terms() -> None:
    if not _purchase_terms()["published"]:
        raise HTTPException(503, "Purchases are unavailable until refund terms and a support contact are published.")

def _paypal_mode() -> str: return "live" if os.environ.get("PAYPAL_MODE", "sandbox").lower() == "live" else "sandbox"
def _paypal_base() -> str: return "https://api-m.paypal.com" if _paypal_mode() == "live" else "https://api-m.sandbox.paypal.com"

def _paypal_access_token() -> str:
    global _token, _token_expiry
    if not _paypal_ready(): raise RuntimeError("PayPal credentials are not configured")
    with _token_lock:
        now = time.monotonic()
        if _token and _token_expiry > now+30: return _token
        basic = base64.b64encode((os.environ["PAYPAL_CLIENT_ID"].strip()+":"+os.environ["PAYPAL_CLIENT_SECRET"].strip()).encode()).decode("ascii")
        req = urllib.request.Request(_paypal_base()+"/v1/oauth2/token", data=b"grant_type=client_credentials", method="POST",
             headers={"Authorization":"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(req, timeout=20) as res: data=json.loads(res.read().decode())
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError): raise RuntimeError("PayPal authorization failed") from None
        if not data.get("access_token"): raise RuntimeError("PayPal authorization failed")
        _token=str(data["access_token"]); _token_expiry=now+max(60,int(data.get("expires_in",300))); return _token

def _paypal_call(method: str, path: str, payload: dict | None = None, request_id: str | None = None) -> dict:
    headers={"Authorization":"Bearer "+_paypal_access_token(),"Content-Type":"application/json","Accept":"application/json"}
    if request_id: headers["PayPal-Request-Id"]=request_id
    req=urllib.request.Request(_paypal_base()+path,data=json.dumps(payload or {}).encode(),method=method,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=25) as res: return json.loads(res.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError): raise RuntimeError("PayPal checkout request failed") from None

_PLAN_CATALOG = (
    ("week", "One-week intro", "7 days", "A WEEK TO EXPLORE", True, False),
    ("six_months", "Six-month pass", "6 calendar months", "MOST POPULAR", False, True),
    ("year", "Annual pass", "12 months", "BEST VALUE", False, False),
)
_DURATION_RANK = {"week": 1, "month": 1, "six_months": 2, "annual": 3, "year": 3}


def _price(country: str, plan: str) -> tuple[str, str, str]:
    inr = {"week": "111", "six_months": "599", "year": "10000", "month": "111", "annual": "599"}
    gbp = {"week": ("1.00", "£1"), "six_months": ("6.00", "£6"), "year": ("100.00", "£100"),
           "month": ("1.00", "£1"), "annual": ("6.00", "£6")}
    if plan not in inr:
        raise ValueError("Unknown billing plan")
    if country == "IN":
        return "INR", inr[plan], "₹" + inr[plan]
    amount, label = gbp[plan]
    return "GBP", amount, label


def _add_months(value: datetime, months: int) -> datetime:
    index = value.year * 12 + value.month - 1 + months
    year, zero = divmod(index, 12)
    month = zero + 1
    return value.replace(year=year, month=month, day=min(value.day, calendar.monthrange(year, month)[1]))


def _add_weeks(value: datetime, weeks: int) -> datetime:
    return value + timedelta(weeks=weeks)


def _pass_expiry(base: datetime, plan: str) -> datetime:
    if plan == "week":
        return _add_weeks(base, 1)
    return _add_months(base, {"month": 1, "six_months": 6, "annual": 12, "year": 12}[plan])

@router.get("/api/billing/options")
def billing_options(request: Request, user: dict = Depends(require_user)):
    country,source=_country(request,user=user); currency,symbol=_currency(country); state=_state(user["id"])
    active=state["subscription"]["plan"] if state["subscription"]["active"] else None
    plans = []
    active_rank = _DURATION_RANK.get(active, 0)
    for key, name, term, eyebrow, intro, featured in _PLAN_CATALOG:
        code, amount, label = _price(country, key)
        plans.append({"key": key, "name": name, "term": term, "currency": code, "amount": amount, "price": label,
                      "eyebrow": eyebrow, "intro": intro, "featured": featured,
                      "can_purchase": _DURATION_RANK[key] >= active_rank})
    add_currency, add_amount, add_label = _price(country, "week")
    addons=[{"key":"kundli_slot","name":"Additional saved Kundli","term":"One-time · one extra saved chart",
             "currency":add_currency,"amount":add_amount,"price":add_label}]
    purchase_terms = _purchase_terms()
    paypal=country!="IN" and _paypal_ready() and purchase_terms["published"]
    upi=country=="IN" and youpi.enabled() and purchase_terms["published"]
    reports = report_catalogue(country)
    for report in reports:
        report["owned"] = report["key"] in state["reports"]
    return {"region":{"country_code":country,"currency":currency,"symbol":symbol,"source":source},"plans":plans,"addons":addons,
            "reports":reports,"report_offer":{"active":any(x["offer"] for x in reports),"ends_at":OFFER_END_ISO},
            "payment":{"paypal_available":paypal,"paypal_client_id":os.environ.get("PAYPAL_CLIENT_ID","").strip() if paypal else None,
                        "paypal_mode":_paypal_mode(),"upi_available":upi,
                        "upi_message":"UPI checkout is ready. Access activates only after YouPI-PG confirms bank-statement reconciliation." if upi else
                                      "UPI is integrated but disabled until the YouPI-PG server credentials, signed webhook and verified statement reconciliation are configured and checkout is explicitly enabled."},
            "purchase_terms": purchase_terms,
            "usage":state["usage"],"kundlis":state["kundlis"],"subscription":state["subscription"]}


def _create_paypal_order(plan: str, purchase_type: str, request: Request, user: dict) -> dict:
    _same_origin(request); country,_=_country(request,user=user)
    _require_purchase_terms()
    state=_state(user["id"])
    if purchase_type == "pass" and state["subscription"]["active"]:
        active_rank = _DURATION_RANK.get(state["subscription"]["plan"], 0)
        if _DURATION_RANK.get(plan, 0) < active_rank:
            raise HTTPException(409, "A longer pass is already active; choose the same or a longer pass.")
    if country=="IN": raise HTTPException(409,"Use YouPI-PG UPI checkout for INR payments.")
    if not _paypal_ready(): raise HTTPException(503,"PayPal is not configured yet. Add merchant credentials on the server.")
    if purchase_type == "report":
        if plan not in PRODUCTS:
            raise HTTPException(400, "Unknown report product")
        if has_report_entitlement(user["id"], plan):
            raise HTTPException(409, "This report is already unlocked on your account")
        currency, amount = report_price(plan, country)
    else:
        currency, amount, _ = _price(country, "week" if purchase_type == "kundli_slot" else plan)
    if currency!="GBP": raise HTTPException(409,"PayPal checkout is currently available for GBP only.")
    local_id=uuid.uuid4().hex; conn=_db()
    try:
        conn.execute("INSERT INTO billing_orders(local_id,user_id,plan,purchase_type,currency,amount,status,created_at) VALUES(?,?,?,?,?,?, 'creating',?)",
                     (local_id,user["id"],plan,purchase_type,currency,amount,_now_iso())); conn.commit()
    finally: conn.close()
    if purchase_type=="kundli_slot":
        description="one additional saved Kundli slot"
    elif purchase_type=="report":
        description=PRODUCTS[plan]["name"]
    else:
        description = {"week": "one-week intro pass", "six_months": "six-month pass", "year": "annual pass",
                       "month": "one-month pass", "annual": "annual pass"}[plan]
    payload={"intent":"CAPTURE","purchase_units":[{"reference_id":local_id,"custom_id":str(user["id"]),
             "invoice_id":"NUV-"+local_id[:24],"description":"Nuvora Jyotish "+description,
             "amount":{"currency_code":currency,"value":amount}}]}
    try: result=_paypal_call("POST","/v2/checkout/orders",payload,local_id)
    except RuntimeError:
        conn=_db()
        try: conn.execute("UPDATE billing_orders SET status='failed' WHERE local_id=?",(local_id,)); conn.commit()
        finally: conn.close()
        raise HTTPException(502,"PayPal could not start checkout. Please try again.") from None
    paypal_id=result.get("id")
    if not isinstance(paypal_id,str) or not re.fullmatch(r"[A-Za-z0-9-]{5,100}",paypal_id): raise HTTPException(502,"PayPal returned an invalid order reference")
    conn=_db()
    try: conn.execute("UPDATE billing_orders SET paypal_order_id=?,status='created' WHERE local_id=?",(paypal_id,local_id)); conn.commit()
    finally: conn.close()
    return {"order_id":paypal_id}


@router.post("/api/billing/paypal/order")
def create_paypal_order(body: PlanBody, request: Request, user: dict = Depends(require_user)):
    return _create_paypal_order(body.plan,"pass",request,user)


@router.post("/api/billing/paypal/kundli-order")
def create_paypal_kundli_order(request: Request, user: dict = Depends(require_user)):
    return _create_paypal_order("week", "kundli_slot", request, user)


@router.post("/api/billing/paypal/report-order")
def create_paypal_report_order(body: ReportOrderBody, request: Request, user: dict = Depends(require_user)):
    return _create_paypal_order(body.product, "report", request, user)


def _create_youpi_order(plan: str, purchase_type: str, request: Request, user: dict) -> dict:
    _same_origin(request)
    _require_purchase_terms()
    country, _ = _country(request, user=user)
    if country != "IN":
        raise HTTPException(409, "YouPI-PG checkout is available for INR payments only.")
    if not youpi.enabled():
        raise HTTPException(503, "UPI checkout is not enabled on the server yet.")
    state = _state(user["id"])
    if purchase_type == "pass" and state["subscription"]["active"]:
        active_rank = _DURATION_RANK.get(state["subscription"]["plan"], 0)
        if _DURATION_RANK.get(plan, 0) < active_rank:
            raise HTTPException(409, "A longer pass is already active; choose the same or a longer pass.")
    if purchase_type == "report":
        if plan not in PRODUCTS:
            raise HTTPException(400, "Unknown report product")
        if has_report_entitlement(user["id"], plan):
            raise HTTPException(409, "This report is already unlocked on your account")
        currency, amount = report_price(plan, country)
    else:
        currency, amount, _ = _price(country, "week" if purchase_type == "kundli_slot" else plan)
    if currency != "INR":
        raise HTTPException(409, "YouPI-PG requires an INR order.")
    if purchase_type == "kundli_slot":
        description = "Nuvora Jyotish additional saved Kundli slot"
    elif purchase_type == "report":
        description = "Nuvora Jyotish " + PRODUCTS[plan]["name"]
    else:
        description = "Nuvora Jyotish " + {"week": "one-week pass", "six_months": "six-month pass", "year": "annual pass"}[plan]
    local_id = uuid.uuid4().hex
    gateway_order_id = "NUV-" + local_id
    now = _now_iso()
    conn = _db()
    try:
        conn.execute(
            "INSERT INTO billing_orders(local_id,user_id,plan,purchase_type,currency,amount,status,created_at,provider,updated_at) VALUES(?,?,?,?,?,?, 'creating',?, 'youpi',?)",
            (local_id, user["id"], plan, purchase_type, currency, amount, now, now))
        conn.commit()
    finally:
        conn.close()
    return_url = os.environ.get("YOUPI_RETURN_URL", "").strip() or str(request.base_url) + "?youpi=return"
    payload = {
        "orderId": gateway_order_id,
        "amount": amount,
        "currency": "INR",
        "method": "UPI",
        "description": description,
        "returnUrl": return_url,
        "customer": {"email": user["email"]},
        "metadata": {"purchase_type": purchase_type, "product": plan},
    }
    try:
        result = youpi.create_payment(payload, local_id)
        payment_id = result.get("paymentId")
        checkout_url = result.get("checkoutUrl")
        parsed_checkout = urlsplit(checkout_url) if isinstance(checkout_url, str) else None
        valid = (
            isinstance(payment_id, str) and bool(re.fullmatch(r"[A-Za-z0-9-]{8,100}", payment_id))
            and parsed_checkout and parsed_checkout.scheme in ("http", "https") and parsed_checkout.netloc
            and not parsed_checkout.username and not parsed_checkout.password
            and result.get("orderId") == gateway_order_id
            and result.get("currency", "INR") == "INR"
            and Decimal(str(result.get("amount"))) == Decimal(amount)
        )
        if not valid:
            raise RuntimeError("Invalid YouPI-PG order response")
    except (RuntimeError, InvalidOperation, TypeError):
        conn = _db()
        try:
            conn.execute("UPDATE billing_orders SET status='failed',updated_at=? WHERE local_id=?", (_now_iso(), local_id))
            conn.commit()
        finally:
            conn.close()
        raise HTTPException(502, "YouPI-PG could not start UPI checkout. Please try again.") from None
    conn = _db()
    try:
        conn.execute(
            "UPDATE billing_orders SET provider_payment_id=?,status='created',gateway_status=?,settlement_state='NOT_RECONCILED',updated_at=? WHERE local_id=?",
            (payment_id, str(result.get("status") or "INITIATED"), _now_iso(), local_id))
        conn.commit()
    finally:
        conn.close()
    return {"order_id": local_id, "payment_id": payment_id, "checkout_url": checkout_url,
            "status": "pending_verification", "settlement_state": "NOT_RECONCILED"}


@router.post("/api/billing/youpi/order")
def create_youpi_order(body: PlanBody, request: Request, user: dict = Depends(require_user)):
    return _create_youpi_order(body.plan, "pass", request, user)


@router.post("/api/billing/youpi/kundli-order")
def create_youpi_kundli_order(request: Request, user: dict = Depends(require_user)):
    return _create_youpi_order("week", "kundli_slot", request, user)


@router.post("/api/billing/youpi/report-order")
def create_youpi_report_order(body: ReportOrderBody, request: Request, user: dict = Depends(require_user)):
    return _create_youpi_order(body.product, "report", request, user)


@router.get("/api/billing/youpi/status/{order_id}")
def youpi_order_status(order_id: str, user: dict = Depends(require_user)):
    if not re.fullmatch(r"[a-f0-9]{32}", order_id):
        raise HTTPException(404, "Payment order not found")
    conn = _db()
    try:
        order = conn.execute(
            "SELECT * FROM billing_orders WHERE local_id=? AND user_id=? AND provider='youpi'",
            (order_id, user["id"])).fetchone()
    finally:
        conn.close()
    if order is None:
        raise HTTPException(404, "Payment order not found")
    return {"order_id": order_id, "status": order["status"], "gateway_status": order["gateway_status"],
            "settlement_state": order["settlement_state"], "paid": order["status"] == "paid"}


@router.post("/api/billing/youpi/webhook")
async def youpi_webhook(request: Request):
    raw_body = await request.body()
    if len(raw_body) > 65536:
        raise HTTPException(413, "Webhook payload is too large")
    delivery_id = request.headers.get("X-Gateway-Delivery-Id", "")
    timestamp = request.headers.get("X-Gateway-Timestamp", "")
    if not youpi.valid_signature(raw_body, request.headers.get("X-Gateway-Signature", ""),
                                 timestamp, request.headers.get("X-Gateway-Signature-V2", "")):
        raise HTTPException(401, "Invalid webhook signature")
    try:
        payload = json.loads(raw_body.decode())
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Invalid webhook payload") from None
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid webhook payload")
    event = payload.get("event")
    allowed_events = {"OBSERVED_SUCCESS", "RECONCILED", "MANUAL_REVIEW", "SUCCESS", "FAILED", "EXPIRED", "CANCELLED"}
    if event not in allowed_events or request.headers.get("X-Gateway-Event", event) != event:
        raise HTTPException(400, "Unsupported webhook event")
    if not re.fullmatch(r"[A-Za-z0-9-]{8,100}", delivery_id):
        raise HTTPException(400, "Invalid webhook delivery ID")
    if payload.get("deliveryId") != delivery_id or str(payload.get("timestamp", "")) != timestamp:
        raise HTTPException(400, "Webhook delivery metadata does not match")
    gateway_order_id = payload.get("orderId")
    payment_id = payload.get("paymentId")
    if not isinstance(gateway_order_id, str) or not re.fullmatch(r"NUV-[a-f0-9]{32}", gateway_order_id):
        raise HTTPException(400, "Invalid merchant order ID")
    if not isinstance(payment_id, str) or not re.fullmatch(r"[A-Za-z0-9-]{8,100}", payment_id):
        raise HTTPException(400, "Invalid payment ID")
    local_id = gateway_order_id[4:]
    conn = _db()
    try:
        order = conn.execute("SELECT * FROM billing_orders WHERE local_id=? AND provider='youpi'", (local_id,)).fetchone()
    finally:
        conn.close()
    if order is None or order["provider_payment_id"] != payment_id:
        raise HTTPException(404, "Payment order not found")
    try:
        amount_matches = Decimal(str(payload.get("amount"))) == Decimal(order["amount"])
        paise_matches = int(payload.get("amountPaise")) == int(Decimal(order["amount"]) * 100)
    except (InvalidOperation, TypeError, ValueError):
        amount_matches = paise_matches = False
    if payload.get("currency") != "INR" or not amount_matches or not paise_matches or payload.get("method") != "UPI":
        raise HTTPException(400, "Webhook order details do not match")
    utr = str(payload.get("utr") or "")
    settlement_state = str(payload.get("settlementState") or "NOT_RECONCILED")
    if event == "RECONCILED" and (settlement_state != "RECONCILED" or not re.fullmatch(r"\d{12}", utr)):
        raise HTTPException(400, "Reconciled payment requires settlement evidence and a valid UTR")
    conn = _db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT 1 FROM youpi_webhook_events WHERE delivery_id=?", (delivery_id,)).fetchone():
            conn.rollback()
            return {"received": True, "duplicate": True}
        conn.execute("INSERT INTO youpi_webhook_events(delivery_id,payment_id,event,received_at) VALUES(?,?,?,?)",
                     (delivery_id, payment_id, event, _now_iso()))
        latest = conn.execute("SELECT status FROM billing_orders WHERE local_id=?", (local_id,)).fetchone()
        if latest and latest["status"] == "paid":
            conn.commit()
            return {"received": True, "status": "paid"}
        now = _now()
        if event == "RECONCILED":
            _grant_order(conn, order, now)
            conn.execute(
                "UPDATE billing_orders SET status='paid',gateway_status=?,settlement_state='RECONCILED',utr=?,capture_id=?,paid_at=?,updated_at=? WHERE local_id=?",
                (event, utr, utr, now.isoformat(timespec="seconds"), now.isoformat(timespec="seconds"), local_id))
            status = "paid"
        else:
            status = "pending_verification" if event in ("OBSERVED_SUCCESS", "MANUAL_REVIEW", "SUCCESS") else event.lower()
            conn.execute(
                "UPDATE billing_orders SET status=?,gateway_status=?,settlement_state=?,utr=?,updated_at=? WHERE local_id=?",
                (status, event, settlement_state, utr or None, now.isoformat(timespec="seconds"), local_id))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise HTTPException(409, "Duplicate payment reference") from None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"received": True, "status": status}


def _grant_order(conn: sqlite3.Connection, order: sqlite3.Row, now: datetime) -> None:
    user_id = order["user_id"]
    if order["purchase_type"] == "kundli_slot":
        conn.execute("UPDATE users SET kundli_slots=kundli_slots+1 WHERE id=?", (user_id,))
    elif order["purchase_type"] == "report":
        conn.execute(
            "INSERT INTO report_entitlements(user_id,product,order_id,granted_at) VALUES(?,?,?,?)",
            (user_id, order["plan"], order["local_id"], now.isoformat(timespec="seconds")))
    else:
        account = conn.execute("SELECT plan_expires_at FROM users WHERE id=?", (user_id,)).fetchone()
        expiry = datetime.fromisoformat(account["plan_expires_at"]) if account["plan_expires_at"] else None
        new_expiry = _pass_expiry(expiry if expiry and expiry > now else now, order["plan"])
        conn.execute("UPDATE users SET plan=?,plan_expires_at=? WHERE id=?",
                     (order["plan"], new_expiry.isoformat(timespec="seconds"), user_id))


@router.post("/api/billing/paypal/capture")
def capture_paypal_order(body: CaptureBody, request: Request, user: dict = Depends(require_user)):
    _same_origin(request); conn=_db()
    try: order=conn.execute("SELECT * FROM billing_orders WHERE paypal_order_id=? AND user_id=?",(body.order_id,user["id"])).fetchone()
    finally: conn.close()
    if order is None: raise HTTPException(404,"Payment order not found")
    if order["status"]=="paid": return {"paid":True,"account":_state(user["id"])}
    if order["status"]!="created": raise HTTPException(409,"This payment order is not available for capture")
    try: result=_paypal_call("POST","/v2/checkout/orders/"+order["paypal_order_id"]+"/capture",{},order["local_id"][:31]+"c")
    except RuntimeError: raise HTTPException(502,"PayPal could not confirm the payment. Please try again.") from None
    captures=[]
    for unit in result.get("purchase_units",[]): captures.extend(unit.get("payments",{}).get("captures",[]))
    capture=next((item for item in captures if item.get("status")=="COMPLETED"),None)
    if result.get("status")!="COMPLETED" or capture is None: raise HTTPException(402,"PayPal has not completed this payment")
    received=capture.get("amount",{})
    try: matches=received.get("currency_code")==order["currency"] and Decimal(str(received.get("value")))==Decimal(order["amount"])
    except (InvalidOperation,TypeError): matches=False
    if not matches: raise HTTPException(402,"The captured amount did not match this order")
    conn=_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        latest=conn.execute("SELECT status FROM billing_orders WHERE local_id=?",(order["local_id"],)).fetchone()
        if latest and latest["status"]=="paid": conn.commit(); return {"paid":True,"account":_state(user["id"])}
        now=_now()
        _grant_order(conn, order, now)
        conn.execute("UPDATE billing_orders SET status='paid',capture_id=?,paid_at=?,updated_at=? WHERE local_id=?",
                     (capture.get("id"),now.isoformat(timespec="seconds"),now.isoformat(timespec="seconds"),order["local_id"]))
        conn.commit()
    except Exception: conn.rollback(); raise
    finally: conn.close()
    return {"paid":True,"account":_state(user["id"])}
