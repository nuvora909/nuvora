"""Provider-agnostic LLM adapter. Configured only through environment variables (or a local .env):

  LLM_PROVIDER   openai | anthropic          (openai = any OpenAI-compatible endpoint)
  LLM_API_KEY    secret key                  (never logged or returned by the API)
  LLM_MODEL      model id, or a comma-separated list tried in order (primary first)
  LLM_FALLBACK_MODELS  optional extra comma-separated models tried after LLM_MODEL
  LLM_BACKUP_BASE_URL / LLM_BACKUP_API_KEY / LLM_BACKUP_MODELS
                 optional second OpenAI-compatible provider (e.g. OpenRouter) used when every primary model
                 fails; with no models listed, free models are chosen from its catalogue automatically
  LLM_BASE_URL   optional; default https://api.openai.com/v1 or https://api.anthropic.com
  LLM_TIMEOUT    optional; seconds to wait for the provider between streamed chunks (default 60)

Neutral message format used by the session:
  {"role": "user", "content": str}
  {"role": "assistant", "content": str, "tool_calls": [{"id", "name", "args"}]}
  {"role": "tool", "tool_call_id": str, "name": str, "content": str}
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
log = logging.getLogger("nuvora.llm")

# Hosted model catalogues retire models without notice. A model that answers 404/410 or "end of life" is
# marked gone for this process and the next one is used; if every configured model is gone, the provider's
# current catalogue is read and the best available chat model is chosen automatically.
DISCOVERY_PREFERENCE = (
    "minimaxai/minimax-m3.1-flash", "nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia/nemotron-3.5-super-vl-120b-a12b",
    "mistralai/mistral-large-4-1t-a52b", "moonshotai/kimi-k3.1-pro", "z-ai/glm-5.3-flash",
    # free models on OpenRouter-style catalogues; "openrouter/free" routes to whichever free model is up
    "nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free",
    "google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "openrouter/free",
)
DISCOVERY_TRIES = 3
NOT_CHAT = re.compile(r"embed|guard|safety|detector|clip|retriev|translate|starcoder|coder|pii|calibration|cosmos|"
                      r"video|vlm-embed|reward|parse|ocr|asr|tts|whisper|rerank", re.I)
GONE = re.compile(r"end of life|no longer available|not found|does not exist|unknown model|model_not_found|deprecated", re.I)
_state_lock = threading.Lock()
_states: dict[str, dict] = {}  # per provider base URL


def _state_for(base_url: str) -> dict:
    with _state_lock:
        return _states.setdefault(base_url, {"gone": {}, "discovered": None, "discovered_at": 0.0, "active": None,
                                             "last_error": None, "switches": []})


def load_env_file(path: Path = ENV_FILE):
    """Minimal KEY=VALUE loader; existing environment variables win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


@dataclass
class LLMConfig:
    provider: str
    api_key: str
    model: str
    base_url: str
    timeout: float = 60.0
    max_tokens: int = 4096
    temperature: float = 0.2
    reasoning_effort: str | None = None
    models: tuple = field(default_factory=tuple)
    backup: "LLMConfig | None" = None

    @classmethod
    def from_env(cls) -> "LLMConfig | None":
        load_env_file()
        prov = os.environ.get("LLM_PROVIDER", "").strip().lower()
        key = os.environ.get("LLM_API_KEY", "").strip()
        models = [m.strip() for m in (os.environ.get("LLM_MODEL", "") + "," + os.environ.get("LLM_FALLBACK_MODELS", "")).split(",")
                  if m.strip()]
        models = list(dict.fromkeys(models))
        model = models[0] if models else ""
        if prov not in ("openai", "anthropic") or not key or not model:
            return None
        base = os.environ.get("LLM_BASE_URL", "").strip() or (
            "https://api.anthropic.com" if prov == "anthropic" else "https://api.openai.com/v1")
        try:
            timeout = float(os.environ.get("LLM_TIMEOUT", "").strip() or 60.0)
        except ValueError:
            timeout = 60.0
        try:  # thinking models spend part of the budget on hidden reasoning before the answer
            max_tokens = int(os.environ.get("LLM_MAX_TOKENS", "").strip() or 4096)
        except ValueError:
            max_tokens = 4096
        backup = None
        b_url = os.environ.get("LLM_BACKUP_BASE_URL", "").strip().rstrip("/")
        b_key = os.environ.get("LLM_BACKUP_API_KEY", "").strip()
        if b_url and b_key:
            b_models = tuple(dict.fromkeys(m.strip() for m in os.environ.get("LLM_BACKUP_MODELS", "").split(",") if m.strip()))
            backup = cls("openai", b_key, b_models[0] if b_models else "", b_url, timeout=max(5.0, timeout),
                         max_tokens=max(1024, max_tokens), models=b_models)
        return cls(prov, key, model, base.rstrip("/"), timeout=max(5.0, timeout), max_tokens=max(1024, max_tokens),
                   reasoning_effort=os.environ.get("LLM_REASONING_EFFORT", "").strip() or None, models=tuple(models),
                   backup=backup)

    def public(self):
        st = _state_for(self.base_url)
        with _state_lock:
            out = {"provider": self.provider, "model": st["active"] or self.model, "configured_models": list(self.models),
                   "retired_models": dict(st["gone"]), "auto_selected": st["active"] not in (None, *self.models),
                   "recent_switches": list(st["switches"][-5:]), "base_url": self.base_url}
        if self.backup:
            b = _state_for(self.backup.base_url)
            out["backup"] = {"base_url": self.backup.base_url, "model": b["active"] or "chosen automatically",
                             "last_error": b["last_error"]}
        return out


def status() -> dict:
    cfg = LLMConfig.from_env()
    if cfg is None:
        missing = [k for k in ("LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL") if not os.environ.get(k)]
        return {"configured": False, "missing": missing}
    return {"configured": True, **cfg.public()}


class LLMError(RuntimeError):
    pass


class LLM:
    def __init__(self, cfg: LLMConfig):
        self.cfg = cfg
        self.client = httpx.Client(timeout=cfg.timeout, trust_env=False)
        self.backup = LLM(cfg.backup) if cfg.backup else None

    @property
    def _st(self) -> dict:
        return _state_for(self.cfg.base_url)

    # ------------------------------------------------------------------ model selection
    def _candidates(self) -> list[str]:
        _state = self._st
        with _state_lock:
            gone = set(_state["gone"])
            active = _state["active"]
        listed = [m for m in (self.cfg.models or (self.cfg.model,)) if m and m not in gone]
        if active and active not in gone and active not in listed:
            listed.insert(0, active)  # a model chosen by discovery earlier in this process
        return listed

    def _discover(self, tried: set[str]) -> str | None:
        """Read the provider's current catalogue and pick the best available chat model."""
        if self.cfg.provider != "openai":
            return None
        _state = self._st
        with _state_lock:
            cached, at = _state["discovered"], _state["discovered_at"]
        if cached is None or time.time() - at > 3600:
            try:
                r = self.client.get(f"{self.cfg.base_url}/models", headers={"Authorization": f"Bearer {self.cfg.api_key}"})
                r.raise_for_status()
                data = r.json().get("data", [])
                priced = [m for m in data if isinstance(m.get("pricing"), dict)]

                def free(m):
                    p = m["pricing"]
                    return all(str(p.get(k, "0")).strip() in ("0", "0.0", "") for k in ("prompt", "completion"))
                # On a paid marketplace (prices listed) only free models are ever chosen automatically.
                cached = [m["id"] for m in (priced and [m for m in priced if free(m)] or data)]
            except (httpx.HTTPError, ValueError, KeyError):
                return None
            with _state_lock:
                _state["discovered"], _state["discovered_at"] = cached, time.time()
        with _state_lock:
            gone = set(_state["gone"])
        usable = [m for m in cached if m not in gone and m not in tried and not NOT_CHAT.search(m)
                  and not re.search(r"lyria|music|audio|image", m, re.I)]
        preferred = [m for m in DISCOVERY_PREFERENCE if m in usable]
        return (preferred or usable or [None])[0]

    def _mark_gone(self, model: str, reason: str):
        st = self._st  # resolve before taking the (non-reentrant) lock
        with _state_lock:
            st["gone"][model] = reason[:160]
        log.warning("LLM model %s is unavailable (%s); switching", model, reason[:120])

    def complete(self, system: str, messages: list[dict], tools: list[dict]) -> dict:
        """Returns {"text": str, "tool_calls": [{"id", "name", "args"}], "usage": {...}}.

        Tries the primary provider's models, then the backup provider's, before giving up."""
        try:
            return self._complete_here(system, messages, tools)
        except LLMError as primary_error:
            if not self.backup:
                raise
            log.warning("Primary AI provider failed (%s); using the backup provider", str(primary_error)[:120])
            try:
                return self.backup._complete_here(system, messages, tools)
            except LLMError as backup_error:
                raise LLMError(f"{primary_error} | backup: {backup_error}") from None

    def _complete_here(self, system: str, messages: list[dict], tools: list[dict]) -> dict:
        """Tries this provider's configured models in order. A retired model is skipped for the rest of the
        process; a busy one (429/503) is skipped for this request. When nothing configured works, models are
        discovered from the provider's catalogue."""
        _state = self._st
        tried, last = set(), None
        queue = self._candidates()
        discovered = 0
        while True:
            if not queue:
                if discovered >= DISCOVERY_TRIES:
                    break
                discovered += 1
                pick = self._discover(tried)
                if not pick:
                    break
                queue = [pick]
            model = queue.pop(0)
            tried.add(model)
            try:
                if self.cfg.provider == "anthropic":
                    out = self._anthropic(system, messages, tools, model)
                else:
                    out = self._openai(system, messages, tools, model)
                with _state_lock:
                    if _state["active"] != model:
                        if _state["active"] or model != ((self.cfg.models or (self.cfg.model,)) + ("",))[0]:
                            _state["switches"].append({"to": model, "at": time.strftime("%Y-%m-%d %H:%M:%S")})
                        _state["active"] = model
                    _state["last_error"] = None
                return out
            except httpx.HTTPStatusError as e:
                code = e.response.status_code
                body = e.response.text[:300].replace(self.cfg.api_key, "***")
                last = LLMError(f"{self.cfg.provider} HTTP {code} ({model}): {body}")
                if code in (404, 410) or (code in (400, 422) and GONE.search(body)):
                    self._mark_gone(model, f"HTTP {code}: {body}")
                    continue
                if code in (429, 502, 503, 504):
                    continue
                break
            except httpx.TimeoutException:
                last = LLMError(f"{self.cfg.provider} timed out ({model})")
                break  # a slow model is not retried with another: the reader would wait twice as long
            except httpx.HTTPError as e:
                last = LLMError(f"{self.cfg.provider} connection error: {type(e).__name__}")
                break
        with _state_lock:
            _state["last_error"] = str(last) if last else "no usable model"
        raise last or LLMError(f"{self.cfg.provider}: no usable model is available")

    # ------------------------------------------------------------------ OpenAI-compatible
    def _openai(self, system, messages, tools, model=None):
        msgs = [{"role": "system", "content": system}]
        for m in messages:
            if m["role"] == "assistant" and m.get("tool_calls"):
                msgs.append({"role": "assistant", "content": m.get("content") or None,
                             "tool_calls": [{"id": t["id"], "type": "function",
                                             "function": {"name": t["name"], "arguments": json.dumps(t["args"])}}
                                            for t in m["tool_calls"]]})
            elif m["role"] == "tool":
                msgs.append({"role": "tool", "tool_call_id": m["tool_call_id"], "content": m["content"]})
            else:
                msgs.append({"role": m["role"], "content": m["content"]})
        body = {"model": model or self.cfg.model, "messages": msgs, "temperature": self.cfg.temperature,
                "max_tokens": self.cfg.max_tokens, "stream": True}
        if self.cfg.reasoning_effort:
            body["reasoning_effort"] = self.cfg.reasoning_effort
        if tools:
            body["tools"] = [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                               "parameters": t["parameters"]}} for t in tools]
        text_parts, call_parts, usage, finish_reasons = [], {}, {}, []
        with self.client.stream("POST", f"{self.cfg.base_url}/chat/completions", json=body,
                                headers={"Authorization": f"Bearer {self.cfg.api_key}"}) as r:
            if r.is_error:
                r.read()
            r.raise_for_status()
            for line in r.iter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if not payload or payload == "[DONE]":
                    continue
                chunk = json.loads(payload)
                usage = chunk.get("usage") or usage
                for choice in chunk.get("choices") or []:
                    if choice.get("finish_reason"):
                        finish_reasons.append(choice["finish_reason"])
                    delta = choice.get("delta") or {}
                    if delta.get("content"):
                        text_parts.append(delta["content"])
                    for part in delta.get("tool_calls") or []:
                        index = part.get("index", 0)
                        call = call_parts.setdefault(index, {"id": "", "name": "", "arguments": ""})
                        call["id"] += part.get("id") or ""
                        fn = part.get("function") or {}
                        call["name"] += fn.get("name") or ""
                        call["arguments"] += fn.get("arguments") or ""
        calls = []
        for part in call_parts.values():
            try:
                args = json.loads(part["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append({"id": part["id"], "name": part["name"], "args": args})
        if "length" in finish_reasons:
            raise LLMError(f"{self.cfg.provider} response exceeded the token budget")
        if not text_parts and not calls:
            raise LLMError(f"{self.cfg.provider} returned an empty response")
        return {"text": "".join(text_parts), "tool_calls": calls, "usage": usage}

    # ------------------------------------------------------------------ Anthropic
    def _anthropic(self, system, messages, tools, model=None):
        msgs = []
        for m in messages:
            if m["role"] == "assistant":
                content = [{"type": "text", "text": m["content"]}] if m.get("content") else []
                content += [{"type": "tool_use", "id": t["id"], "name": t["name"], "input": t["args"]}
                            for t in m.get("tool_calls") or []]
                msgs.append({"role": "assistant", "content": content})
            elif m["role"] == "tool":
                block = {"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": m["content"]}
                if msgs and msgs[-1]["role"] == "user" and isinstance(msgs[-1]["content"], list):
                    msgs[-1]["content"].append(block)       # consecutive results go in one user turn
                else:
                    msgs.append({"role": "user", "content": [block]})
            else:
                msgs.append({"role": "user", "content": m["content"]})
        body = {"model": model or self.cfg.model, "system": system, "messages": msgs, "max_tokens": self.cfg.max_tokens,
                "temperature": self.cfg.temperature}
        if tools:
            body["tools"] = [{"name": t["name"], "description": t["description"], "input_schema": t["parameters"]}
                             for t in tools]
        r = self.client.post(f"{self.cfg.base_url}/v1/messages", json=body,
                             headers={"x-api-key": self.cfg.api_key, "anthropic-version": "2023-06-01"})
        r.raise_for_status()
        data = r.json()
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        calls = [{"id": b["id"], "name": b["name"], "args": b.get("input") or {}}
                 for b in data.get("content", []) if b.get("type") == "tool_use"]
        return {"text": text, "tool_calls": calls, "usage": data.get("usage", {})}


def get_llm() -> LLM | None:
    cfg = LLMConfig.from_env()
    return LLM(cfg) if cfg else None
