from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from google.auth.transport import requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, Field

from . import accounts

router = APIRouter()


class GoogleLoginBody(BaseModel):
    credential: str = Field(..., min_length=20, max_length=20000)
    country_code: str | None = Field(None, max_length=8)


def _client_id() -> str:
    value = os.environ.get("NUVORA_GOOGLE_CLIENT_ID", "").strip()
    if not value:
        raise HTTPException(503, "Google sign-in is not configured yet. Please use email sign-in.")
    return value


def _email_from_claims(claims: dict) -> str:
    email = str(claims.get("email", "")).strip().lower()
    if claims.get("email_verified") is not True or not accounts.re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", email):
        raise HTTPException(401, "Google did not provide a verified email address")
    return email


def _country(request: Request, submitted: str | None) -> str:
    if submitted in ("IN", "GB"):
        return submitted
    lang = accounts._language_country(request)
    if lang:
        return lang
    return accounts._default_country()


def _create_or_get_google_user(conn: sqlite3.Connection, sub: str, email: str, country: str) -> int:
    row = conn.execute("SELECT id,email FROM users WHERE google_sub=?", (sub,)).fetchone()
    if row:
        if accounts._configured_admin_email() and email == accounts._configured_admin_email():
            conn.execute("UPDATE users SET role='admin' WHERE id=?", (int(row["id"]),))
        return int(row["id"])

    row = conn.execute("SELECT id FROM users WHERE email=? COLLATE NOCASE", (email,)).fetchone()
    if row:
        user_id = int(row["id"])
        conn.execute("UPDATE users SET google_sub=?,google_email_verified_at=?,auth_provider='google' WHERE id=?",
                     (sub, accounts._now_iso(), user_id))
        return user_id

    cursor = conn.execute(
        "INSERT INTO users(email,password_hash,role,google_sub,google_email_verified_at,auth_provider,country_code,created_at) "
        "VALUES(?,NULL,'user',?,?, 'google',?,?)",
        (email, sub, accounts._now_iso(), country, accounts._now_iso()))
    return int(cursor.lastrowid)


@router.post("/api/auth/google")
def google_login(body: GoogleLoginBody, request: Request, response: Response):
    accounts._same_origin(request)
    try:
        claims = google_id_token.verify_oauth2_token(body.credential, requests.Request(), _client_id())
    except Exception:
        raise HTTPException(401, "Google sign-in could not be verified") from None
    if not isinstance(claims, dict) or str(claims.get("iss")) not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Google sign-in could not be verified")
    sub, email = str(claims.get("sub", "")), _email_from_claims(claims)
    if not sub:
        raise HTTPException(401, "Google sign-in could not be verified")

    country = _country(request, body.country_code)
    nonce_hash = hashlib.sha256(body.credential.encode("utf-8")).hexdigest()
    conn = accounts._db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        now = accounts._now()
        conn.execute("DELETE FROM google_auth_replays WHERE expires_at<=?", (accounts._now_iso(),))
        replay = conn.execute("SELECT 1 FROM google_auth_replays WHERE google_sub=? AND nonce_hash=? AND expires_at>?",
                              (sub, nonce_hash, accounts._now_iso())).fetchone()
        if replay:
            conn.rollback()
            raise HTTPException(401, "This Google sign-in attempt has already been used")
        if accounts._configured_admin_email() and email == accounts._configured_admin_email():
            admin = conn.execute("SELECT id FROM users WHERE email=? COLLATE NOCASE", (email,)).fetchone()
            if admin is None:
                if accounts._configured_admin_password() is None:
                    conn.rollback()
                    raise HTTPException(503, "The configured administrator password is not set securely")
                conn.execute("INSERT INTO users(email,password_hash,role,country_code,created_at) VALUES(?,?, 'admin',?,?)",
                             (email, accounts._hash_password(accounts._configured_admin_password()), country, accounts._now_iso()))
            else:
                conn.execute("UPDATE users SET role='admin' WHERE id=?", (int(admin["id"]),))
        user_id = _create_or_get_google_user(conn, sub, email, country)
        conn.execute("INSERT INTO google_auth_replays(google_sub,nonce_hash,expires_at,created_at) VALUES(?,?,?,?)",
                     (sub, nonce_hash, (now + timedelta(minutes=10)).isoformat(timespec="seconds"), accounts._now_iso()))
        conn.commit()
    finally:
        conn.close()
    return accounts._session_response(user_id, request, response)
