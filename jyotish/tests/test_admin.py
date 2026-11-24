import json
import sqlite3
import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import pytest

import server.app as appmod
from chat import jobs as reading_jobs
from server import accounts, admin

ADMIN_EMAIL = "owner@nuvora.test"
ADMIN_PASSWORD = "a-strong-private-admin-secret-2026"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(accounts, "DB_PATH", tmp_path / "accounts.sqlite3")
    monkeypatch.setattr(reading_jobs, "DB_PATH", tmp_path / "readings.sqlite3")
    monkeypatch.setenv("NUVORA_ADMIN_EMAIL", ADMIN_EMAIL)
    monkeypatch.setenv("NUVORA_ADMIN_PASSWORD", ADMIN_PASSWORD)
    accounts._initialized_path = None
    appmod._sessions.clear()
    with TestClient(appmod.app) as test_client:
        yield test_client
    appmod._sessions.clear()
    accounts._initialized_path = None


def sign_up(client, email, region="GB"):
    response = client.post("/api/auth/signup", json={"email": email, "password": "correct-horse-battery", "country_code": region})
    assert response.status_code == 201, response.text
    return response.json()["user"]["id"]


def sign_in_admin(client):
    client.cookies.clear()
    response = client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert response.status_code == 200, response.text


def test_overview_requires_sign_in(client):
    assert client.get("/api/admin/overview").status_code == 401


def test_overview_rejects_regular_users(client):
    sign_up(client, "reader@example.com")
    response = client.get("/api/admin/overview")
    assert response.status_code == 403


def test_overview_reports_accounts_orders_and_readings(client):
    india_id = sign_up(client, "priya.sharma@example.com", "IN")
    client.cookies.clear()
    uk_id = sign_up(client, "liam.taylor@example.com", "GB")

    now = datetime.now(timezone.utc).replace(microsecond=0)
    conn = sqlite3.connect(accounts.DB_PATH)
    conn.execute("UPDATE users SET plan='six_months', plan_expires_at=? WHERE id=?",
                 ((now + timedelta(days=90)).isoformat(timespec="seconds"), uk_id))
    conn.execute("INSERT INTO saved_kundlis VALUES(?,?,?)", (india_id, "chart-1", now.isoformat(timespec="seconds")))
    orders = [("o-paid", uk_id, "six_months", "pass", "GBP", "6.00", "paid"),
              ("o-open", india_id, "dosha", "report", "INR", "149", "created"),
              ("o-fail", india_id, "week", "pass", "INR", "111", "failed")]
    for local_id, user_id, plan, kind, currency, amount, status in orders:
        conn.execute("INSERT INTO billing_orders(local_id,user_id,plan,purchase_type,currency,amount,status,created_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?)",
                     (local_id, user_id, plan, kind, currency, amount, status, now.isoformat(timespec="seconds"),
                      now.isoformat(timespec="seconds") if status == "paid" else None))
    conn.commit()
    conn.close()

    readings = sqlite3.connect(reading_jobs.DB_PATH)
    readings.execute("""CREATE TABLE readings (user_id INTEGER NOT NULL, chart_key TEXT NOT NULL, question TEXT NOT NULL,
        language TEXT NOT NULL, answer_json TEXT NOT NULL, created_at REAL NOT NULL,
        PRIMARY KEY(user_id, chart_key, question, language))""")
    for n in range(3):
        readings.execute("INSERT INTO readings VALUES(?,?,?,?,?,?)", (india_id, "k", f"q{n}", "en", json.dumps({}), time.time()))
    readings.commit()
    readings.close()

    sign_in_admin(client)
    response = client.get("/api/admin/overview")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    data = response.json()

    assert data["totals"]["users"] == 3
    assert data["totals"]["admins"] == 1
    assert data["totals"]["paid_active"] == 1
    assert data["totals"]["active_today"] == 3
    assert data["regions"] == {"IN": 1, "GB": 2}
    assert {p["key"]: p["count"] for p in data["plans"]} == {"free": 1, "six_months": 1, "admin": 1}
    assert data["orders"] == {"total": 3, "paid": 1, "pending": 1, "failed": 1}
    assert data["revenue"] == [{"currency": "GBP", "amount": "6.00", "orders": 1}]
    assert data["readings"] == {"total": 3, "readers": 1}
    assert data["kundlis"] == 1
    assert len(data["activity"]) == admin.ACTIVITY_DAYS
    assert data["activity"][-1]["readings"] == 3
    assert data["activity"][-1]["orders"] == 3

    people = {p["email"]: p for p in data["users"]}
    assert people["priya.sharma@example.com"]["readings"] == 3
    assert people["priya.sharma@example.com"]["kundlis"] == 1
    assert people["liam.taylor@example.com"]["status"] == "active"
    assert people["liam.taylor@example.com"]["plan_label"] == "6-month pass"
    assert people[ADMIN_EMAIL]["status"] == "admin"
    items = {o["id"]: o["item"] for o in data["recent_orders"]}
    assert items["o-open"] == admin.PRODUCTS["dosha"]["name"]
    assert items["o-paid"] == "6-month pass"


def test_overview_works_without_a_readings_database(client):
    sign_in_admin(client)
    data = client.get("/api/admin/overview").json()
    assert data["readings"] == {"total": 0, "readers": 0}
    assert data["orders"]["total"] == 0
    assert data["revenue"] == []


def test_admin_page_is_served_without_caching_or_indexing(client):
    response = client.get("/admin")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex"
    assert "/api/admin/overview" not in response.text  # data is fetched by admin.js, not embedded
