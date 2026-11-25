import hashlib
import hmac
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi.testclient import TestClient
import pytest

import server.app as appmod
from server import accounts


class StubChat:
    def __init__(self):
        self.llm = None
        self.last_language = None

    def ask(self, message, language="en"):
        self.last_language = language
        return {"html": "<p>stub answer</p>", "text": "stub answer", "language": language}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(accounts, "DB_PATH", tmp_path / "accounts.sqlite3")
    appmod._sessions.clear()
    with TestClient(appmod.app) as test_client:
        yield test_client
    appmod._sessions.clear()


def signup(client, region="GB"):
    response = client.post("/api/auth/signup", json={
        "email": "reader@example.com", "password": "correct-horse-battery", "country_code": region
    })
    assert response.status_code == 201, response.text
    return response.json()


def configure_youpi(monkeypatch):
    monkeypatch.setenv("YOUPI_API_URL", "https://pay.example.test")
    monkeypatch.setenv("YOUPI_MERCHANT_ID", "merchant-test")
    monkeypatch.setenv("YOUPI_MERCHANT_API_KEY", "server-only-test-key")
    monkeypatch.setenv("YOUPI_WEBHOOK_SECRET", "webhook-test-secret")
    monkeypatch.setenv("YOUPI_CHECKOUT_ENABLED", "true")
    calls = []

    def fake_create(payload, idempotency_key):
        calls.append((payload, idempotency_key))
        payment_id = "pay-" + idempotency_key
        return {"paymentId": payment_id, "orderId": payload["orderId"], "amount": payload["amount"],
                "amountPaise": str(int(Decimal(payload["amount"]) * 100)), "currency": "INR", "status": "INITIATED",
                "checkoutUrl": "https://pay.example.test/checkout/" + payment_id}

    monkeypatch.setattr(accounts.youpi, "create_payment", fake_create)
    return calls


def send_youpi_webhook(client, created, event, amount, *, settlement="NOT_RECONCILED", utr="123456789012",
                       delivery="delivery-12345678", signature=None):
    payload = {"event": event, "paymentId": created["payment_id"], "orderId": "NUV-" + created["order_id"],
               "amount": amount, "amountPaise": str(int(Decimal(amount) * 100)), "currency": "INR", "method": "UPI",
               "utr": utr, "settlementState": settlement}
    raw = json.dumps(payload, separators=(",", ":")).encode()
    if signature is None:
        signature = "sha256=" + hmac.new(b"webhook-test-secret", raw, hashlib.sha256).hexdigest()
    return client.post("/api/billing/youpi/webhook", content=raw, headers={
        "Content-Type": "application/json", "X-Gateway-Event": event,
        "X-Gateway-Signature": signature, "X-Gateway-Delivery-Id": delivery,
    })


def test_signup_sets_session_and_enforces_two_server_side_questions(client):
    state = signup(client)
    assert state["usage"]["free_remaining"] == 2
    assert client.get("/api/auth/me").status_code == 200
    appmod._sessions["chart-id-123"] = (state["user"]["id"], StubChat())

    for remaining in (1, 0):
        response = client.post("/api/chat", json={"chart_id": "chart-id-123", "message": "Tell me about my chart"})
        assert response.status_code == 200, response.text
        assert client.get("/api/auth/me").json()["usage"]["free_remaining"] == remaining

    blocked = client.post("/api/chat", json={"chart_id": "chart-id-123", "message": "One more question"})
    assert blocked.status_code == 402
    assert "Free questions" in blocked.json()["detail"]


def test_chart_session_is_owned_by_the_signed_in_user(client):
    first = signup(client)
    appmod._sessions["private-chart-123"] = (first["user"]["id"], StubChat())
    client.post("/api/auth/logout")
    second = client.post("/api/auth/signup", json={
        "email": "second@example.com", "password": "another-correct-password", "country_code": "GB"
    })
    assert second.status_code == 201
    response = client.post("/api/chat", json={"chart_id": "private-chart-123", "message": "Read this chart"})
    assert response.status_code == 404


def test_paypal_amount_is_server_selected_and_capture_activates_pass(client, monkeypatch):
    signup(client, "GB")
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "sandbox-client-id")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", "sandbox-secret")
    calls = []

    def fake_paypal(method, path, payload=None, request_id=None):
        calls.append((method, path, payload, request_id))
        if path == "/v2/checkout/orders":
            return {"id": "ORDER-12345"}
        return {"status": "COMPLETED", "purchase_units": [{"payments": {"captures": [
            {"id": "CAPTURE-123", "status": "COMPLETED", "amount": {"currency_code": "GBP", "value": "1.00"}}
        ]}}]}

    monkeypatch.setattr(accounts, "_paypal_call", fake_paypal)
    options = client.get("/api/billing/options").json()
    assert options["plans"][0]["price"] == "£1"
    assert options["payment"]["paypal_available"] is True
    created = client.post("/api/billing/paypal/order", json={"plan": "week", "amount": "0.01"})
    assert created.status_code == 200, created.text
    assert calls[0][2]["purchase_units"][0]["amount"] == {"currency_code": "GBP", "value": "1.00"}
    captured = client.post("/api/billing/paypal/capture", json={"order_id": "ORDER-12345"})
    assert captured.status_code == 200, captured.text
    state = client.get("/api/auth/me").json()
    assert state["subscription"]["active"] is True
    assert state["subscription"]["plan"] == "week"


def test_india_uses_inr_quote_but_paypal_is_not_offered(client, monkeypatch):
    signup(client, "IN")
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "sandbox-client-id")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", "sandbox-secret")
    options = client.get("/api/billing/options").json()
    assert options["plans"][0]["price"] == "₹111"
    assert options["plans"][1]["price"] == "₹599"
    assert options["plans"][2]["price"] == "₹10000"
    assert options["payment"]["paypal_available"] is False
    response = client.post("/api/billing/paypal/order", json={"plan": "week"})
    assert response.status_code == 409


def test_youpi_order_uses_server_report_price_and_never_exposes_merchant_key(client, monkeypatch):
    signup(client, "IN")
    calls = configure_youpi(monkeypatch)
    options = client.get("/api/billing/options").json()
    assert options["payment"]["upi_available"] is True
    assert options["payment"]["paypal_available"] is False
    created = client.post("/api/billing/youpi/report-order", json={"product": "life_1", "amount": "0.01"})
    assert created.status_code == 200, created.text
    assert calls[0][0]["amount"] == "149.50"
    assert calls[0][0]["currency"] == "INR"
    assert calls[0][0]["method"] == "UPI"
    assert calls[0][1] == created.json()["order_id"]
    assert "checkout_url" in created.json()
    assert "server-only-test-key" not in created.text


def test_youpi_observation_does_not_unlock_but_reconciliation_activates_pass(client, monkeypatch):
    signup(client, "IN")
    configure_youpi(monkeypatch)
    created = client.post("/api/billing/youpi/order", json={"plan": "week"}).json()
    observed = send_youpi_webhook(client, created, "OBSERVED_SUCCESS", "111.00")
    assert observed.status_code == 200, observed.text
    assert client.get("/api/auth/me").json()["subscription"]["active"] is False
    assert client.get("/api/billing/youpi/status/" + created["order_id"]).json()["status"] == "pending_verification"
    success = send_youpi_webhook(client, created, "SUCCESS", "111.00", delivery="delivery-success-1")
    assert success.status_code == 200
    assert client.get("/api/auth/me").json()["subscription"]["active"] is False
    reconciled = send_youpi_webhook(client, created, "RECONCILED", "111.00", settlement="RECONCILED",
                                    delivery="delivery-reconciled-1")
    assert reconciled.status_code == 200, reconciled.text
    state = client.get("/api/auth/me").json()
    assert state["subscription"]["active"] is True
    assert state["subscription"]["plan"] == "week"
    expiry = state["subscription"]["expires_at"]
    duplicate = send_youpi_webhook(client, created, "RECONCILED", "111.00", settlement="RECONCILED",
                                   delivery="delivery-reconciled-1")
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True
    assert client.get("/api/auth/me").json()["subscription"]["expires_at"] == expiry


def test_youpi_rejects_bad_signature_wrong_amount_and_unreconciled_final_event(client, monkeypatch):
    signup(client, "IN")
    configure_youpi(monkeypatch)
    created = client.post("/api/billing/youpi/order", json={"plan": "week"}).json()
    bad_signature = send_youpi_webhook(client, created, "RECONCILED", "111.00", settlement="RECONCILED",
                                       signature="sha256=" + "0" * 64)
    assert bad_signature.status_code == 401
    wrong_amount = send_youpi_webhook(client, created, "RECONCILED", "0.01", settlement="RECONCILED")
    assert wrong_amount.status_code == 400
    false_final = send_youpi_webhook(client, created, "RECONCILED", "111.00", settlement="NOT_RECONCILED")
    assert false_final.status_code == 400
    assert client.get("/api/auth/me").json()["subscription"]["active"] is False


def test_youpi_reconciled_report_grants_only_the_purchased_product(client, monkeypatch):
    signup(client, "IN")
    configure_youpi(monkeypatch)
    created = client.post("/api/billing/youpi/report-order", json={"product": "dosha"}).json()
    response = send_youpi_webhook(client, created, "RECONCILED", "49.50", settlement="RECONCILED")
    assert response.status_code == 200, response.text
    reports = client.get("/api/auth/me").json()["reports"]
    assert reports == ["dosha"]
    options = client.get("/api/billing/options").json()["reports"]
    assert next(item for item in options if item["key"] == "dosha")["owned"] is True
    assert next(item for item in options if item["key"] == "match")["owned"] is False


def test_youpi_duplicate_delivery_cannot_add_two_chart_slots(client, monkeypatch):
    signup(client, "IN")
    configure_youpi(monkeypatch)
    created = client.post("/api/billing/youpi/kundli-order").json()
    first = send_youpi_webhook(client, created, "RECONCILED", "111.00", settlement="RECONCILED")
    assert first.status_code == 200
    duplicate = send_youpi_webhook(client, created, "RECONCILED", "111.00", settlement="RECONCILED")
    assert duplicate.status_code == 200
    assert client.get("/api/auth/me").json()["kundlis"]["slots"] == 2


def test_youpi_second_reconciled_delivery_cannot_extend_the_same_order(client, monkeypatch):
    signup(client, "IN")
    configure_youpi(monkeypatch)
    created = client.post("/api/billing/youpi/kundli-order").json()
    assert send_youpi_webhook(client, created, "RECONCILED", "111.00", settlement="RECONCILED").status_code == 200
    second = send_youpi_webhook(client, created, "RECONCILED", "111.00", settlement="RECONCILED",
                                utr="999999999999", delivery="delivery-second-final")
    assert second.status_code == 200
    assert second.json()["status"] == "paid"
    assert client.get("/api/auth/me").json()["kundlis"]["slots"] == 2


def test_youpi_same_utr_cannot_fulfil_two_different_orders(client, monkeypatch):
    signup(client, "IN")
    configure_youpi(monkeypatch)
    first = client.post("/api/billing/youpi/kundli-order").json()
    second = client.post("/api/billing/youpi/kundli-order").json()
    assert send_youpi_webhook(client, first, "RECONCILED", "111.00", settlement="RECONCILED").status_code == 200
    duplicate_utr = send_youpi_webhook(client, second, "RECONCILED", "111.00", settlement="RECONCILED",
                                       delivery="delivery-second-utr")
    assert duplicate_utr.status_code == 409
    assert client.get("/api/auth/me").json()["kundlis"]["slots"] == 2


def test_youpi_is_disabled_without_explicit_server_enablement(client, monkeypatch):
    signup(client, "IN")
    monkeypatch.setenv("YOUPI_API_URL", "https://pay.example.test")
    monkeypatch.setenv("YOUPI_MERCHANT_ID", "merchant-test")
    monkeypatch.setenv("YOUPI_MERCHANT_API_KEY", "server-only-test-key")
    monkeypatch.setenv("YOUPI_WEBHOOK_SECRET", "webhook-test-secret")
    monkeypatch.delenv("YOUPI_CHECKOUT_ENABLED", raising=False)
    assert client.get("/api/billing/options").json()["payment"]["upi_available"] is False
    assert client.post("/api/billing/youpi/order", json={"plan": "week"}).status_code == 503


def test_trusted_country_header_controls_signup_region(client, monkeypatch):
    monkeypatch.setenv("NUVORA_TRUST_GEO_HEADERS", "true")
    region = client.get("/api/auth/region", headers={"CF-IPCountry": "IN"})
    assert region.json()["country_code"] == "IN"
    response = client.post("/api/auth/signup", headers={"CF-IPCountry": "IN"}, json={
        "email": "india@example.com", "password": "correct-horse-battery", "country_code": "GB"
    })
    assert response.status_code == 201
    assert response.json()["user"]["country_code"] == "IN"


def test_wrong_paypal_capture_amount_never_grants_access(client, monkeypatch):
    signup(client, "GB")
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "sandbox-client-id")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", "sandbox-secret")

    def fake_paypal(method, path, payload=None, request_id=None):
        if path == "/v2/checkout/orders":
            return {"id": "ORDER-WRONG-AMOUNT"}
        return {"status": "COMPLETED", "purchase_units": [{"payments": {"captures": [
            {"id": "CAPTURE-WRONG", "status": "COMPLETED", "amount": {"currency_code": "GBP", "value": "0.01"}}
        ]}}]}

    monkeypatch.setattr(accounts, "_paypal_call", fake_paypal)
    created = client.post("/api/billing/paypal/order", json={"plan": "week"})
    assert created.status_code == 200
    captured = client.post("/api/billing/paypal/capture", json={"order_id": "ORDER-WRONG-AMOUNT"})
    assert captured.status_code == 402
    assert client.get("/api/auth/me").json()["subscription"]["active"] is False




def _chart_payload(kundli_id):
    return {"date": "1990-01-01", "time": "12:00", "lat": 51.5, "lon": -0.12,
            "tz": "Europe/London", "place": "London", "kundli_id": kundli_id}


def test_free_chart_returns_only_birth_details_and_enforces_one_saved_kundli(client, monkeypatch):
    state = signup(client)
    full_report = {"birth": {"name": "Preview"}, "summary": {"label": "private"},
                   "yogas": [{"name": "sample", "impact": {"summary": "private"}}],
                   "yoga_analysis": {"summary": "private combined synthesis"},
                   "ashtakavarga": {"score": 30}, "sensitivity": {"rating": "sensitive"},
                   "transits": {"visible": True}}
    monkeypatch.setattr(appmod, "_calculate_chart", lambda req: (object(), full_report))
    monkeypatch.setattr(appmod, "ChatSession", lambda chart, report: StubChat())

    first = client.post("/api/chart", json=_chart_payload("kundli-1001"))
    assert first.status_code == 200, first.text
    payload = first.json()
    assert payload["access"]["report_preview_percent"] == 0
    assert payload["report"] == {"birth": {"name": "Preview"}}
    assert set(payload["access"]["locked_sections"]) == {
        "summary", "chart", "planets", "dashas", "transits", "yogas",
        "ashtakavarga", "birth_time", "strength", "timing", "events"
    }

    # Reloading the same saved chart is idempotent and does not use another slot.
    assert client.post("/api/chart", json=_chart_payload("kundli-1001")).status_code == 200
    blocked = client.post("/api/chart", json=_chart_payload("kundli-2002"))
    assert blocked.status_code == 402
    current = client.get("/api/auth/me").json()
    assert current["kundlis"] == {"slots": 1, "used": 1, "remaining": 0}

    assert client.delete("/api/kundlis/kundli-1001").status_code == 200
    conn = accounts._db()
    try:
        conn.execute("UPDATE users SET plan='month', plan_expires_at='2099-01-01T00:00:00+00:00' WHERE id=?", (state["user"]["id"],))
        conn.commit()
    finally:
        conn.close()
    paid = client.post("/api/chart", json=_chart_payload("kundli-3003"))
    assert paid.status_code == 200, paid.text
    paid_payload = paid.json()
    assert paid_payload["access"]["premium"] is True
    assert paid_payload["access"]["report_preview_percent"] == 100
    assert paid_payload["report"]["yogas"] == [{"name": "sample", "impact": {"summary": "private"}}]
    assert paid_payload["report"]["yoga_analysis"] == {"summary": "private combined synthesis"}
    assert paid_payload["report"]["ashtakavarga"] == {"score": 30}
    assert paid_payload["report"]["sensitivity"] == {"rating": "sensitive"}


def test_locked_chat_question_does_not_consume_free_credit(client):
    state = signup(client)
    chat = StubChat()
    appmod._sessions["locked-chart-123"] = (state["user"]["id"], chat)
    response = client.post("/api/chat", json={"chart_id": "locked-chart-123", "message": "Explain my yogas"})
    assert response.status_code == 402
    assert client.get("/api/auth/me").json()["usage"]["free_remaining"] == 2
    assert chat.last_language is None


def test_hindi_language_is_forwarded_to_chat_reader(client):
    state = signup(client)
    chat = StubChat()
    appmod._sessions["language-chart-123"] = (state["user"]["id"], chat)
    response = client.post("/api/chat", json={"chart_id": "language-chart-123", "message": "मेरा करियर कैसा रहेगा?", "language": "hi"})
    assert response.status_code == 200, response.text
    assert response.json()["language"] == "hi"
    assert chat.last_language == "hi"
    assert client.get("/api/auth/me").json()["usage"]["free_remaining"] == 1


def test_paypal_kundli_addon_adds_slot_without_activating_pass(client, monkeypatch):
    signup(client, "GB")
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "sandbox-client-id")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", "sandbox-secret")
    calls = []

    def fake_paypal(method, path, payload=None, request_id=None):
        calls.append((method, path, payload, request_id))
        if path == "/v2/checkout/orders":
            return {"id": "ORDER-KUNDLI-123"}
        return {"status": "COMPLETED", "purchase_units": [{"payments": {"captures": [
            {"id": "CAPTURE-KUNDLI-123", "status": "COMPLETED",
             "amount": {"currency_code": "GBP", "value": "1.00"}}
        ]}}]}

    monkeypatch.setattr(accounts, "_paypal_call", fake_paypal)
    created = client.post("/api/billing/paypal/kundli-order", json={})
    assert created.status_code == 200, created.text
    amount = calls[0][2]["purchase_units"][0]["amount"]
    assert amount == {"currency_code": "GBP", "value": "1.00"}
    captured = client.post("/api/billing/paypal/capture", json={"order_id": "ORDER-KUNDLI-123"})
    assert captured.status_code == 200, captured.text
    account = captured.json()["account"]
    assert account["kundlis"]["slots"] == 2
    assert account["subscription"]["active"] is False



def test_configured_admin_gets_server_side_unlimited_access(client, monkeypatch):
    monkeypatch.setenv("NUVORA_ADMIN_EMAIL", "nuvora909@gmail.com")
    monkeypatch.setenv("NUVORA_ADMIN_PASSWORD", "a-strong-private-admin-secret-2026")
    accounts._initialized_path = None
    accounts.init_db()

    login = client.post("/api/auth/login", json={
        "email": "nuvora909@gmail.com", "password": "a-strong-private-admin-secret-2026"
    })
    assert login.status_code == 200, login.text
    state = login.json()
    assert state["user"]["is_admin"] is True
    assert state["subscription"]["active"] is True
    assert state["subscription"]["plan"] == "admin"
    assert state["usage"]["unlimited"] is True
    assert state["kundlis"]["unlimited"] is True
    assert accounts.reserve_question(state["user"]["id"]) is False
    assert accounts.reserve_question(state["user"]["id"]) is False
    assert accounts.reserve_kundli_slot(state["user"]["id"], "admin-kundli-01") is False


def test_new_plan_prices_flags_and_purchase_eligibility(client, monkeypatch):
    state = signup(client, "GB")
    options = client.get("/api/billing/options").json()
    assert [p["key"] for p in options["plans"]] == ["week", "six_months", "year"]
    assert [p["price"] for p in options["plans"]] == ["£1", "£6", "£100"]
    assert [p["intro"] for p in options["plans"]] == [True, False, False]
    assert [p["featured"] for p in options["plans"]] == [False, True, False]
    conn = accounts._db()
    try:
        conn.execute("UPDATE users SET plan='year',plan_expires_at='2099-01-01T00:00:00+00:00' WHERE id=?",
                     (state["user"]["id"],))
        conn.commit()
    finally:
        conn.close()
    options = client.get("/api/billing/options").json()
    assert [p["can_purchase"] for p in options["plans"]] == [False, False, True]
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "sandbox-client-id")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", "sandbox-secret")
    blocked = client.post("/api/billing/paypal/order", json={"plan": "six_months"})
    assert blocked.status_code == 409


@pytest.mark.parametrize("plan,days,months", [("week", 7, 0), ("six_months", 0, 6), ("year", 0, 12),
                                               ("month", 0, 1), ("annual", 0, 12)])
def test_pass_expiry_supports_new_and_legacy_plans(plan, days, months):
    base = datetime(2026, 1, 31, 10, 30, tzinfo=timezone.utc)
    expiry = accounts._pass_expiry(base, plan)
    if days:
        assert expiry == base + timedelta(days=days)
    else:
        assert expiry == accounts._add_months(base, months)


def test_legacy_billing_order_check_is_migrated_without_losing_history(tmp_path, monkeypatch):
    path = tmp_path / "legacy-billing.sqlite3"
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE billing_orders (
            local_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, paypal_order_id TEXT UNIQUE,
            plan TEXT NOT NULL CHECK(plan IN ('month','annual')),
            purchase_type TEXT NOT NULL DEFAULT 'pass' CHECK(purchase_type IN ('pass','kundli_slot')),
            currency TEXT NOT NULL, amount TEXT NOT NULL, status TEXT NOT NULL,
            capture_id TEXT UNIQUE, created_at TEXT NOT NULL, paid_at TEXT);
        INSERT INTO billing_orders VALUES('legacy-local','1','LEGACY-ORDER','annual','pass','GBP','6.00','paid',
            'LEGACY-CAPTURE','2026-01-01T00:00:00+00:00','2026-01-01T00:01:00+00:00');
    """)
    conn.close()
    monkeypatch.setattr(accounts, "DB_PATH", path)
    accounts._initialized_path = None
    accounts.init_db()
    conn = accounts._db()
    try:
        row = conn.execute("SELECT plan,amount,status FROM billing_orders WHERE local_id='legacy-local'").fetchone()
        assert dict(row) == {"plan": "annual", "amount": "6.00", "status": "paid"}
        conn.execute("INSERT INTO users(email,created_at) VALUES('legacy@example.com','2026-01-01T00:00:00+00:00')")
        conn.execute("INSERT INTO billing_orders(local_id,user_id,plan,purchase_type,currency,amount,status,created_at) "
                     "VALUES('new-six',1,'six_months','pass','GBP','6.00','created','2026-11-18T00:00:00+00:00')")
    finally:
        conn.close()


def test_match_requires_standalone_report_entitlement(client, monkeypatch):
    state = signup(client)
    report = {"yogas": [{"name": "sample"}], "yoga_analysis": {"summary": "private"},
              "ashtakavarga": {"score": 30},
              "sensitivity": {"navamsha_lagna": {"rating": "fragile", "nearest_change_min": 4}}}
    monkeypatch.setattr(appmod, "_calculate_chart", lambda req: (object(), report))
    seen = []
    def fake_match(c1, c2, r1, r2):
        seen.extend([r1, r2])
        return {"ok": True}
    monkeypatch.setattr(appmod, "match_charts", fake_match)
    payload = {"person1": _chart_payload("person-1001"), "person2": _chart_payload("person-2002")}
    blocked = client.post("/api/match", json=payload)
    assert blocked.status_code == 402
    assert seen == []
    conn = accounts._db()
    try:
        conn.execute("INSERT INTO report_entitlements(user_id,product,order_id,granted_at) VALUES(?,?,?,?)",
                     (state["user"]["id"], "match", "match-test-order", "2026-11-18T00:00:00+00:00"))
        conn.commit()
    finally:
        conn.close()
    response = client.post("/api/match", json=payload)
    assert response.status_code == 200, response.text
    assert seen == [report, report]


def test_report_catalogue_has_eleven_exact_half_price_non_call_products(client):
    signup(client, "IN")
    options = client.get("/api/billing/options").json()
    assert len(options["reports"]) == 11
    assert {item["key"] for item in options["reports"]} == set(accounts.PRODUCTS)
    assert all(item["kind"] not in ("call", "consultation") for item in options["reports"])
    for item in options["reports"]:
        assert Decimal(item["amount"]) == Decimal(item["reference"]) / 2
        assert item["offer"] is True
        assert item["owned"] is False
    prices = {item["key"]: item["amount"] for item in options["reports"]}
    assert prices == {"life_1": "149.50", "life_5": "199.50", "life_10": "249.50", "life_20": "349.50",
                      "sade_sati": "62.50", "dosha": "49.50", "match": "124.50", "marriage": "94.50", "child": "99.50",
                      "rudraksha": "24.50", "gemstone": "37.50"}


def test_report_paypal_price_is_server_selected_and_capture_grants_only_that_report(client, monkeypatch):
    signup(client, "GB")
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "sandbox-client-id")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", "sandbox-secret")
    calls = []

    def fake_paypal(method, path, payload=None, request_id=None):
        calls.append((method, path, payload, request_id))
        if path == "/v2/checkout/orders":
            return {"id": "REPORT-ORDER-123"}
        return {"status": "COMPLETED", "purchase_units": [{"payments": {"captures": [
            {"id": "REPORT-CAPTURE-123", "status": "COMPLETED", "amount": {"currency_code": "GBP", "value": "2.00"}}
        ]}}]}

    monkeypatch.setattr(accounts, "_paypal_call", fake_paypal)
    created = client.post("/api/billing/paypal/report-order", json={"product": "life_1", "amount": "0.01"})
    assert created.status_code == 200, created.text
    assert calls[0][2]["purchase_units"][0]["amount"] == {"currency_code": "GBP", "value": "2.00"}
    captured = client.post("/api/billing/paypal/capture", json={"order_id": "REPORT-ORDER-123"})
    assert captured.status_code == 200, captured.text
    account = captured.json()["account"]
    assert account["reports"] == ["life_1"]
    assert account["subscription"]["active"] is False
    assert accounts.has_report_entitlement(account["user"]["id"], "life_1") is True
    assert accounts.has_report_entitlement(account["user"]["id"], "dosha") is False


def test_wrong_report_capture_amount_grants_no_entitlement(client, monkeypatch):
    signup(client, "GB")
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "sandbox-client-id")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", "sandbox-secret")

    def fake_paypal(method, path, payload=None, request_id=None):
        if path == "/v2/checkout/orders":
            return {"id": "REPORT-WRONG-123"}
        return {"status": "COMPLETED", "purchase_units": [{"payments": {"captures": [
            {"id": "REPORT-WRONG-CAPTURE", "status": "COMPLETED", "amount": {"currency_code": "GBP", "value": "0.01"}}
        ]}}]}

    monkeypatch.setattr(accounts, "_paypal_call", fake_paypal)
    assert client.post("/api/billing/paypal/report-order", json={"product": "dosha"}).status_code == 200
    assert client.post("/api/billing/paypal/capture", json={"order_id": "REPORT-WRONG-123"}).status_code == 402
    assert client.get("/api/auth/me").json()["reports"] == []


def test_core_pdf_requires_pass_and_standalone_reports_use_separate_entitlements(client, monkeypatch):
    state = signup(client)
    chat = StubChat()
    chat.chart = object()
    chat.report = {"birth": {}}
    chat.full_report = chat.report
    appmod._sessions["pdf-chart-123"] = (state["user"]["id"], chat)
    monkeypatch.setattr(appmod, "build_report", lambda *args: ("Test Kundli", "Core sections", [
        {"title": "Birth details", "paragraphs": ["Calculated chart"], "bullets": [], "table": None}
    ]))
    locked_core = client.post("/api/reports/pdf", json={"chart_id": "pdf-chart-123", "product": "core"})
    assert locked_core.status_code == 402
    assert "pass" in locked_core.json()["detail"].lower()
    locked = client.post("/api/reports/pdf", json={"chart_id": "pdf-chart-123", "product": "life_1"})
    assert locked.status_code == 402
    conn = accounts._db()
    try:
        conn.execute("INSERT INTO report_entitlements(user_id,product,order_id,granted_at) VALUES(?,?,?,?)",
                     (state["user"]["id"], "life_1", "test-order", "2026-11-18T00:00:00+00:00"))
        conn.commit()
    finally:
        conn.close()
    unlocked = client.post("/api/reports/pdf", json={"chart_id": "pdf-chart-123", "product": "life_1"})
    assert unlocked.status_code == 200
    assert client.post("/api/reports/pdf", json={"chart_id": "pdf-chart-123", "product": "core"}).status_code == 402
    match_without_partner = client.post("/api/reports/pdf", json={"chart_id": "pdf-chart-123", "product": "match"})
    assert match_without_partner.status_code == 402

    conn = accounts._db()
    try:
        conn.execute("UPDATE users SET plan='week',plan_expires_at='2099-01-01T00:00:00+00:00' WHERE id=?",
                     (state["user"]["id"],))
        conn.commit()
    finally:
        conn.close()
    response = client.post("/api/reports/pdf", json={"chart_id": "pdf-chart-123", "product": "core"})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")
    from pypdf import PdfReader
    from io import BytesIO
    reader = PdfReader(BytesIO(response.content))
    assert len(reader.pages) == 2
    assert "ॐ गं गणपतये नमः" in reader.pages[0].extract_text()
    assert "Test Kundli" in reader.pages[1].extract_text()


def test_google_signin_verifies_provider_and_creates_account(client, monkeypatch):
    monkeypatch.setenv("NUVORA_GOOGLE_CLIENT_ID", "test-google-client.apps.googleusercontent.com")
    import server.google_auth as google_auth
    claims = {"sub": "google-user-123", "email": "google@example.com", "email_verified": True,
              "iss": "https://accounts.google.com"}
    monkeypatch.setattr(google_auth.google_id_token, "verify_oauth2_token", lambda token, request, audience: claims)
    response = client.post("/api/auth/google", json={"credential": "a-signed-google-credential", "country_code": "IN"})
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["user"]["email"] == "google@example.com"
    assert state["user"]["country_code"] == "IN"
    assert state["user"]["auth_provider"] == "google"
    assert state["user"]["google_linked"] is True
    assert client.get("/api/auth/me").json()["user"]["id"] == state["user"]["id"]

    replay = client.post("/api/auth/google", json={"credential": "a-signed-google-credential", "country_code": "IN"})
    assert replay.status_code == 401


def test_google_signin_rejects_unverified_email(client, monkeypatch):
    monkeypatch.setenv("NUVORA_GOOGLE_CLIENT_ID", "test-google-client.apps.googleusercontent.com")
    import server.google_auth as google_auth
    monkeypatch.setattr(google_auth.google_id_token, "verify_oauth2_token", lambda token, request, audience: {
        "sub": "google-user-123", "email": "google@example.com", "email_verified": False,
        "iss": "https://accounts.google.com"
    })
    response = client.post("/api/auth/google", json={"credential": "a-signed-google-credential"})
    assert response.status_code == 401
