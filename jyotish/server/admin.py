"""Administrator dashboard data: accounts, orders, readings and daily activity.

Everything here is read-only and limited to accounts with the admin role.
"""
from __future__ import annotations

import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response

from chat import jobs as reading_jobs
from . import accounts
from .report_products import PRODUCTS

router = APIRouter()

ACTIVITY_DAYS = 182          # 26 weeks for the activity grid
USER_LIMIT = 500
ORDER_LIMIT = 200
PASS_LABELS = {"week": "Week pass", "month": "Month pass", "six_months": "6-month pass",
               "year": "Annual pass", "annual": "Annual pass"}


def require_admin(user: dict = Depends(accounts.require_user)) -> dict:
    if not user["is_admin"]:
        raise HTTPException(403, "Administrator access only")
    return user


def _parse(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _day(value: datetime) -> str:
    return value.astimezone(timezone.utc).date().isoformat()


def _item_label(plan: str, purchase_type: str) -> str:
    if purchase_type == "kundli_slot":
        return "Extra kundli slot"
    if purchase_type == "report" and plan in PRODUCTS:
        return PRODUCTS[plan]["name"]
    return PASS_LABELS.get(plan, plan.replace("_", " ").title())


def _readings(since: datetime) -> tuple[dict[int, int], dict[str, int], int]:
    """Per-user totals, per-day counts inside the window, and the overall total."""
    path = Path(reading_jobs.DB_PATH)
    if not path.exists():
        return {}, {}, 0
    try:
        conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True, timeout=5)
    except sqlite3.Error:
        return {}, {}, 0
    try:
        per_user = {int(uid): int(n) for uid, n in conn.execute("SELECT user_id, COUNT(*) FROM readings GROUP BY user_id")}
        per_day: dict[str, int] = defaultdict(int)
        for (stamp,) in conn.execute("SELECT created_at FROM readings WHERE created_at>=?", (since.timestamp(),)):
            per_day[_day(datetime.fromtimestamp(float(stamp), timezone.utc))] += 1
    except sqlite3.Error:
        return {}, {}, 0
    finally:
        conn.close()
    return per_user, dict(per_day), sum(per_user.values())


@router.get("/api/admin/overview")
def overview(response: Response, admin: dict = Depends(require_admin)):
    response.headers["Cache-Control"] = "no-store"
    now = accounts._now()
    since = (now - timedelta(days=ACTIVITY_DAYS - 1)).replace(hour=0, minute=0, second=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)
    day_ago, month_ago = now - timedelta(days=1), now - timedelta(days=30)

    conn = accounts._db()
    try:
        users = conn.execute("""
            SELECT u.id, u.email, u.role, u.auth_provider, u.country_code, u.plan, u.plan_expires_at,
                   u.free_questions_used, u.tarot_questions_used, u.kundli_slots, u.created_at,
                   (SELECT COUNT(*) FROM saved_kundlis k WHERE k.user_id=u.id) AS kundlis,
                   (SELECT COUNT(*) FROM report_entitlements r WHERE r.user_id=u.id) AS reports,
                   (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id=u.id) AS last_seen
            FROM users u""").fetchall()
        orders = conn.execute("""
            SELECT o.local_id, o.plan, o.purchase_type, o.currency, o.amount, o.status, o.provider,
                   o.created_at, o.paid_at, u.email
            FROM billing_orders o JOIN users u ON u.id=o.user_id
            ORDER BY o.created_at DESC""").fetchall()
        sign_ins = [row[0] for row in conn.execute("SELECT created_at FROM sessions WHERE created_at>=?",
                                                   (since.isoformat(timespec="seconds"),))]
    finally:
        conn.close()

    readings_by_user, reading_days, readings_total = _readings(since)

    activity = {_day(since + timedelta(days=i)): {"signups": 0, "signins": 0, "readings": 0, "orders": 0}
                for i in range(ACTIVITY_DAYS)}
    for day, count in reading_days.items():
        if day in activity:
            activity[day]["readings"] += count
    for stamp in sign_ins:
        parsed = _parse(stamp)
        if parsed and _day(parsed) in activity:
            activity[_day(parsed)]["signins"] += 1

    plan_counts: dict[str, int] = defaultdict(int)
    people, regions, providers = [], defaultdict(int), defaultdict(int)
    totals = {"users": len(users), "admins": 0, "paid_active": 0, "expired": 0, "free": 0,
              "active_30d": 0, "active_today": 0, "new_this_month": 0, "new_last_month": 0}
    for row in users:
        created, last_seen = _parse(row["created_at"]), _parse(row["last_seen"])
        expires = _parse(row["plan_expires_at"])
        is_admin = row["role"] == "admin"
        pass_active = bool(row["plan"] and expires and expires > now)
        if is_admin:
            status, plan_key = "admin", "admin"
            totals["admins"] += 1
        elif pass_active:
            status, plan_key = "active", row["plan"]
            totals["paid_active"] += 1
        elif row["plan"]:
            status, plan_key = "expired", "free"
            totals["expired"] += 1
            totals["free"] += 1
        else:
            status, plan_key = "free", "free"
            totals["free"] += 1
        plan_counts[plan_key] += 1
        regions[row["country_code"]] += 1
        providers[row["auth_provider"]] += 1
        if created:
            if created >= month_start:
                totals["new_this_month"] += 1
            elif created >= last_month_start:
                totals["new_last_month"] += 1
            if _day(created) in activity:
                activity[_day(created)]["signups"] += 1
        if last_seen and last_seen >= month_ago:
            totals["active_30d"] += 1
        if last_seen and last_seen >= day_ago:
            totals["active_today"] += 1
        people.append({
            "id": int(row["id"]), "email": row["email"], "role": row["role"],
            "provider": row["auth_provider"], "country": row["country_code"],
            "status": status, "plan": plan_key,
            "plan_label": "Admin" if is_admin else (PASS_LABELS.get(row["plan"], "Free") if pass_active else "Free"),
            "plan_expires_at": row["plan_expires_at"] if pass_active else None,
            "questions_used": int(row["free_questions_used"]), "tarot_used": int(row["tarot_questions_used"]),
            "kundlis": int(row["kundlis"]), "kundli_slots": int(row["kundli_slots"]),
            "reports": int(row["reports"]), "readings": readings_by_user.get(int(row["id"]), 0),
            "created_at": row["created_at"], "last_seen": row["last_seen"],
        })

    people.sort(key=lambda p: (p["last_seen"] or "", p["created_at"] or ""), reverse=True)

    revenue: dict[str, dict] = {}
    order_totals = {"total": len(orders), "paid": 0, "pending": 0, "failed": 0}
    order_rows = []
    for row in orders:
        status = row["status"]
        if status == "paid":
            order_totals["paid"] += 1
            try:
                amount = Decimal(row["amount"])
            except (InvalidOperation, TypeError):
                amount = Decimal(0)
            bucket = revenue.setdefault(row["currency"], {"currency": row["currency"], "amount": Decimal(0), "orders": 0})
            bucket["amount"] += amount
            bucket["orders"] += 1
        elif status == "failed":
            order_totals["failed"] += 1
        else:
            order_totals["pending"] += 1
        paid_or_created = _parse(row["paid_at"] or row["created_at"])
        if paid_or_created and _day(paid_or_created) in activity:
            activity[_day(paid_or_created)]["orders"] += 1
        if len(order_rows) < ORDER_LIMIT:
            order_rows.append({
                "id": row["local_id"], "email": row["email"], "item": _item_label(row["plan"], row["purchase_type"]),
                "kind": row["purchase_type"], "currency": row["currency"], "amount": row["amount"],
                "status": status, "provider": row["provider"], "created_at": row["created_at"], "paid_at": row["paid_at"],
            })

    plan_order = ["free", "week", "month", "six_months", "year", "annual", "admin"]
    plans = [{"key": key, "label": "Free" if key == "free" else ("Admin" if key == "admin" else PASS_LABELS.get(key, key)),
              "count": plan_counts[key]}
             for key in sorted(plan_counts, key=lambda k: plan_order.index(k) if k in plan_order else 99)]

    return {
        "generated_at": now.isoformat(timespec="seconds"),
        "admin": {"email": admin["email"]},
        "totals": totals,
        "regions": dict(regions),
        "providers": dict(providers),
        "plans": plans,
        "kundlis": sum(p["kundlis"] for p in people),
        "reports_owned": sum(p["reports"] for p in people),
        "readings": {"total": readings_total, "readers": len(readings_by_user)},
        "orders": order_totals,
        "revenue": [{"currency": b["currency"], "amount": f"{b['amount']:.2f}", "orders": b["orders"]}
                    for b in sorted(revenue.values(), key=lambda b: b["currency"])],
        "activity": [{"date": day, **counts} for day, counts in activity.items()],
        "users": people[:USER_LIMIT],
        "recent_orders": order_rows,
    }
