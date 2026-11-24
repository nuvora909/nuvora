"""Chart-scoped background readings with a small persistent answer cache."""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

DB_PATH = Path(os.environ.get("NUVORA_READINGS_DB", Path(__file__).resolve().parent.parent / "data" / "readings.sqlite3"))
CACHE_TTL_SECONDS = 6 * 60 * 60
MAX_JOBS = 500


class ReadingCache:
    def __init__(self, path: Path = DB_PATH):
        self.path = Path(path)
        self._lock = threading.Lock()

    def _db(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.path), timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""CREATE TABLE IF NOT EXISTS readings (
            user_id INTEGER NOT NULL, chart_key TEXT NOT NULL, question TEXT NOT NULL,
            language TEXT NOT NULL, answer_json TEXT NOT NULL, created_at REAL NOT NULL,
            PRIMARY KEY(user_id, chart_key, question, language))""")
        return conn

    def get(self, user_id: int, chart_key: str, question: str, language: str):
        with self._lock, self._db() as conn:
            row = conn.execute("""SELECT answer_json, created_at FROM readings
                WHERE user_id=? AND chart_key=? AND question=? AND language=?""",
                (user_id, chart_key, question, language)).fetchone()
        if not row or time.time() - row[1] > CACHE_TTL_SECONDS:
            return None
        try:
            return json.loads(row[0])
        except (TypeError, json.JSONDecodeError):
            return None

    def put(self, user_id: int, chart_key: str, question: str, language: str, answer: dict):
        payload = json.dumps(answer, ensure_ascii=False, separators=(",", ":"))
        with self._lock, self._db() as conn:
            conn.execute("""INSERT INTO readings(user_id,chart_key,question,language,answer_json,created_at)
                VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,chart_key,question,language)
                DO UPDATE SET answer_json=excluded.answer_json,created_at=excluded.created_at""",
                (user_id, chart_key, question, language, payload, time.time()))

    def delete_user(self, user_id: int) -> None:
        with self._lock, self._db() as conn:
            conn.execute("DELETE FROM readings WHERE user_id=?", (user_id,))


@dataclass
class ReadingJob:
    id: str
    user_id: int
    question: str
    language: str
    status: str = "queued"
    answer: dict | None = None
    from_cache: bool = False
    created_at: float = field(default_factory=time.time)
    future: object = field(default=None, repr=False)
    interactive: bool = False


class ReadingJobs:
    def __init__(self, cache: ReadingCache | None = None, workers: int = 2):
        self.cache = cache or ReadingCache()
        self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="nuvora-reading")
        self._interactive = ThreadPoolExecutor(max_workers=max(1, workers), thread_name_prefix="nuvora-interactive")
        self._jobs: OrderedDict[str, ReadingJob] = OrderedDict()
        self._keys: dict[tuple, str] = {}
        self._lock = threading.Lock()
        self._forgotten_users: set[int] = set()

    def forget_user(self, user_id: int) -> None:
        """Drop cached answers and make active jobs for a deleted account inaccessible."""
        with self._lock:
            self._forgotten_users.add(user_id)
            doomed = [job_id for job_id, job in self._jobs.items() if job.user_id == user_id]
            for job_id in doomed:
                job = self._jobs.pop(job_id)
                if job.future:
                    job.future.cancel()
            self._keys = {key: job_id for key, job_id in self._keys.items() if job_id not in doomed}
        self.cache.delete_user(user_id)

    def submit(self, user_id: int, chart_key: str, question: str, language: str,
               runner: Callable[[], dict], use_cache: bool = True,
               on_error: Callable[[], None] | None = None, interactive: bool = False) -> ReadingJob:
        if use_cache:
            cached = self.cache.get(user_id, chart_key, question, language)
            if cached is not None:
                return ReadingJob(secrets.token_urlsafe(12), user_id, question, language,
                                  status="ready", answer=cached, from_cache=True)
        key = (user_id, chart_key, question, language) if use_cache else (
            user_id, chart_key, question, language, secrets.token_urlsafe(8))
        with self._lock:
            existing_id = self._keys.get(key)
            if existing_id and existing_id in self._jobs:
                existing = self._jobs[existing_id]
                if interactive and existing.status == "queued" and not existing.interactive:
                    if existing.future and existing.future.cancel():
                        existing.interactive = True
                        existing.future = self._interactive.submit(
                            self._run, existing, key, chart_key, runner, use_cache, on_error)
                return existing
            job = ReadingJob(secrets.token_urlsafe(12), user_id, question, language, interactive=interactive)
            self._jobs[job.id] = job
            self._keys[key] = job.id
            while len(self._jobs) > MAX_JOBS:
                old_id, old = next(iter(self._jobs.items()))
                if old.status in ("queued", "running"):
                    break
                self._jobs.pop(old_id)
                self._keys = {k: v for k, v in self._keys.items() if v != old_id}
        executor = self._interactive if interactive else self._executor
        job.future = executor.submit(self._run, job, key, chart_key, runner, use_cache, on_error)
        return job

    def _run(self, job: ReadingJob, key: tuple, chart_key: str, runner, use_cache: bool, on_error):
        with self._lock:
            if job.user_id in self._forgotten_users:
                self._keys.pop(key, None)
                return
            job.status = "running"
        try:
            answer = runner()
            if not isinstance(answer, dict) or not answer.get("html"):
                raise ValueError("Incomplete reading")
            with self._lock:
                if use_cache and job.user_id not in self._forgotten_users:
                    self.cache.put(job.user_id, chart_key, job.question, job.language, answer)
        except Exception:
            with self._lock:
                job.status = "error"
                self._keys.pop(key, None)
            if on_error:
                on_error()
            return
        with self._lock:
            if job.user_id in self._forgotten_users:
                self._keys.pop(key, None)
                return
            job.answer = answer
            job.status = "ready"

    def get(self, job_id: str, user_id: int) -> ReadingJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return job if job and job.user_id == user_id else None


def public_job(job: ReadingJob) -> dict:
    if job.status == "ready":
        return {**(job.answer or {}), "status": "ready", "job_id": job.id,
                "cached": job.from_cache, "precomputed": job.from_cache}
    if job.status == "error":
        return {"status": "error", "job_id": job.id,
                "detail": "The AI reading could not be completed. Please try again."}
    return {"status": "preparing", "job_id": job.id, "question": job.question,
            "detail": "The AI reader is preparing this answer in the background."}
