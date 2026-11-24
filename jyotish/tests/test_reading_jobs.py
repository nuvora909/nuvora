import threading
import time
from types import SimpleNamespace

import pytest

from chat.jobs import ReadingCache, ReadingJobs, public_job
from chat.topics import MODE_QUESTIONS
from server import accounts
import server.app as appmod
from tests.test_accounts import signup


ANSWER = {"html": "<p>ready</p>", "text": "ready",
          "summary": {"verified": 1}, "label": "AI reading (test)", "mode": "llm"}


def wait(job_manager, job, user_id=7):
    for _ in range(200):
        current = job_manager.get(job.id, user_id)
        if current.status in ("ready", "error"):
            return current
        time.sleep(0.01)
    raise AssertionError("background reading did not finish")


@pytest.fixture
def job_manager(tmp_path):
    manager = ReadingJobs(ReadingCache(tmp_path / "readings.sqlite3"), workers=1)
    yield manager
    manager._executor.shutdown(wait=True)
    manager._interactive.shutdown(wait=True)


def test_jobs_deduplicate_and_persist_by_language(job_manager):
    calls = []
    gate = threading.Event()

    def run():
        calls.append(1)
        gate.wait(1)
        return ANSWER

    first = job_manager.submit(7, "chart", "Career?", "en", run)
    duplicate = job_manager.submit(7, "chart", "Career?", "en", run)
    assert first.id == duplicate.id
    gate.set()
    assert wait(job_manager, first).status == "ready"
    assert len(calls) == 1

    cached = job_manager.submit(7, "chart", "Career?", "en", lambda: pytest.fail("cache miss"))
    assert cached.status == "ready" and cached.from_cache is True
    hindi = job_manager.submit(7, "chart", "Career?", "hi", lambda: ANSWER)
    assert hindi.id != first.id
    assert wait(job_manager, hindi).status == "ready"
    assert job_manager.get(first.id, 8) is None


def test_failed_job_refunds_once_and_uncached_question_is_fresh(job_manager):
    refunds = []
    failed = job_manager.submit(7, "chart", "Custom?", "en", lambda: 1 / 0,
                                use_cache=False, on_error=lambda: refunds.append(1))
    assert public_job(wait(job_manager, failed))["status"] == "error"
    assert refunds == [1]
    fresh = job_manager.submit(7, "chart", "Custom?", "en", lambda: ANSWER, use_cache=False)
    assert fresh.id != failed.id
    assert wait(job_manager, fresh).status == "ready"


def test_clicked_prompt_is_promoted_out_of_background_queue(job_manager):
    started = threading.Event()
    release = threading.Event()

    def block_background_worker():
        started.set()
        release.wait(1)
        return ANSWER

    blocker = job_manager.submit(7, "chart", "Blocker", "en", block_background_worker)
    assert started.wait(1)
    queued = job_manager.submit(7, "chart", "Clicked prompt", "en",
                                lambda: pytest.fail("background copy should be cancelled"))
    promoted = job_manager.submit(7, "chart", "Clicked prompt", "en", lambda: ANSWER, interactive=True)
    assert promoted.id == queued.id
    assert wait(job_manager, promoted).status == "ready"
    release.set()
    assert wait(job_manager, blocker).status == "ready"


class AIStub:
    def __init__(self, failure=False, gate=None):
        self.llm = SimpleNamespace(cfg=SimpleNamespace(model="test-model"))
        self.chart = object()
        self.report = {}
        self.failure = failure
        self.gate = gate
        self.calls = []

    def ask(self, message, language="en"):
        self.calls.append((message, language))
        if self.gate:
            self.gate.wait(1)
        if self.failure:
            raise RuntimeError("provider failed")
        return {**ANSWER, "language": language}


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    monkeypatch.setattr(accounts, "DB_PATH", tmp_path / "accounts.sqlite3")
    manager = ReadingJobs(ReadingCache(tmp_path / "api-readings.sqlite3"), workers=1)
    monkeypatch.setattr(appmod, "answer_jobs", manager)
    appmod._sessions.clear()
    with TestClient(appmod.app) as client:
        yield client
    appmod._sessions.clear()
    manager._executor.shutdown(wait=True)
    manager._interactive.shutdown(wait=True)


def test_api_returns_immediate_job_then_verified_answer(api_client):
    state = signup(api_client)
    gate = threading.Event()
    stub = AIStub(gate=gate)
    appmod._sessions["async-chart-123"] = (state["user"]["id"], stub)
    response = api_client.post("/api/chat", json={
        "chart_id": "async-chart-123", "message": "A unique custom question", "language": "en"})
    assert response.status_code == 202
    job_id = response.json()["job_id"]
    assert response.json()["status"] == "preparing"
    gate.set()
    for _ in range(200):
        result = api_client.get(f"/api/chat/jobs/{job_id}")
        if result.json()["status"] == "ready":
            break
        time.sleep(0.01)
    assert result.json()["html"] == "<p>ready</p>"
    assert result.json()["summary"]["verified"] == 1


def test_api_serves_saved_prompt_without_calling_ai(api_client):
    state = signup(api_client)
    stub = AIStub()
    question = MODE_QUESTIONS["career"]
    chart_req = appmod.ChartRequest(date="1990-01-01", time="12:00", lat=51.5, lon=-0.12,
                                    tz="Europe/London", kundli_id="kundli-1001")
    stub.chart_request = chart_req
    chart_key = appmod._chart_key(chart_req)
    appmod.answer_jobs.cache.put(state["user"]["id"], chart_key, question, "en", ANSWER)
    appmod._sessions["cached-chart-123"] = (state["user"]["id"], stub)
    response = api_client.post("/api/chat", json={
        "chart_id": "cached-chart-123", "message": question, "language": "en"})
    assert response.status_code == 200
    assert response.json()["cached"] is True
    assert response.json()["html"] == "<p>ready</p>"
    assert stub.calls == []


def test_api_async_failure_restores_free_question(api_client):
    state = signup(api_client)
    gate = threading.Event()
    stub = AIStub(failure=True, gate=gate)
    appmod._sessions["failed-chart-123"] = (state["user"]["id"], stub)
    response = api_client.post("/api/chat", json={
        "chart_id": "failed-chart-123", "message": "A custom question that fails"})
    assert response.status_code == 202
    job_id = response.json()["job_id"]
    gate.set()
    for _ in range(200):
        result = api_client.get(f"/api/chat/jobs/{job_id}").json()
        if result["status"] == "error":
            break
        time.sleep(0.01)
    assert result["status"] == "error"
    assert api_client.get("/api/auth/me").json()["usage"]["free_remaining"] == 2
