from __future__ import annotations

import hashlib
import hmac
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def configured() -> bool:
    return all(os.environ.get(key, "").strip() for key in (
        "YOUPI_API_URL", "YOUPI_MERCHANT_ID", "YOUPI_MERCHANT_API_KEY", "YOUPI_WEBHOOK_SECRET"
    ))


def enabled() -> bool:
    return configured() and os.environ.get("YOUPI_CHECKOUT_ENABLED", "false").strip().lower() in ("1", "true", "yes")


def _base_url() -> str:
    value = os.environ.get("YOUPI_API_URL", "").strip().rstrip("/")
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise RuntimeError("Invalid YouPI-PG API URL")
    return value


def _call(method: str, path: str, payload: dict | None = None, idempotency_key: str | None = None) -> dict:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Merchant-Id": os.environ["YOUPI_MERCHANT_ID"].strip(),
        "X-Merchant-Key": os.environ["YOUPI_MERCHANT_API_KEY"].strip(),
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    request = urllib.request.Request(
        _base_url() + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.loads(response.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError):
        raise RuntimeError("YouPI-PG request failed") from None
    if not isinstance(result, dict):
        raise RuntimeError("YouPI-PG returned an invalid response")
    return result


def create_payment(payload: dict, idempotency_key: str) -> dict:
    return _call("POST", "/api/v1/payments", payload, idempotency_key)


def payment_status(payment_id: str) -> dict:
    return _call("GET", "/api/v1/payments/" + payment_id)


def valid_signature(raw_body: bytes, signature: str, timestamp: str, signature_v2: str) -> bool:
    secret = os.environ.get("YOUPI_WEBHOOK_SECRET", "").strip()
    if not secret or not timestamp.isdigit():
        return False
    key = secret.encode()
    expected = "sha256=" + hmac.new(key, raw_body, hashlib.sha256).hexdigest()
    expected_v2 = "sha256=" + hmac.new(key, timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected) and hmac.compare_digest(signature_v2, expected_v2)
