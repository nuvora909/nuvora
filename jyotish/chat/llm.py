"""Provider-agnostic LLM adapter. Configured only through environment variables (or a local .env):

  LLM_PROVIDER   openai | anthropic          (openai = any OpenAI-compatible endpoint)
  LLM_API_KEY    secret key                  (never logged or returned by the API)
  LLM_MODEL      model id, e.g. the provider's current flagship
  LLM_BASE_URL   optional; default https://api.openai.com/v1 or https://api.anthropic.com
  LLM_TIMEOUT    optional; seconds to wait for the provider between streamed chunks (default 60)

Neutral message format used by the session:
  {"role": "user", "content": str}
  {"role": "assistant", "content": str, "tool_calls": [{"id", "name", "args"}]}
  {"role": "tool", "tool_call_id": str, "name": str, "content": str}
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

import httpx

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


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

    @classmethod
    def from_env(cls) -> "LLMConfig | None":
        load_env_file()
        prov = os.environ.get("LLM_PROVIDER", "").strip().lower()
        key = os.environ.get("LLM_API_KEY", "").strip()
        model = os.environ.get("LLM_MODEL", "").strip()
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
        return cls(prov, key, model, base.rstrip("/"), timeout=max(5.0, timeout), max_tokens=max(1024, max_tokens),
                   reasoning_effort=os.environ.get("LLM_REASONING_EFFORT", "").strip() or None)

    def public(self):
        return {"provider": self.provider, "model": self.model, "base_url": self.base_url}


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

    def complete(self, system: str, messages: list[dict], tools: list[dict]) -> dict:
        """Returns {"text": str, "tool_calls": [{"id", "name", "args"}], "usage": {...}}."""
        try:
            if self.cfg.provider == "anthropic":
                return self._anthropic(system, messages, tools)
            return self._openai(system, messages, tools)
        except httpx.HTTPStatusError as e:
            body = e.response.text[:300].replace(self.cfg.api_key, "***")
            raise LLMError(f"{self.cfg.provider} HTTP {e.response.status_code}: {body}") from None
        except httpx.HTTPError as e:
            raise LLMError(f"{self.cfg.provider} connection error: {type(e).__name__}") from None

    # ------------------------------------------------------------------ OpenAI-compatible
    def _openai(self, system, messages, tools):
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
        body = {"model": self.cfg.model, "messages": msgs, "temperature": self.cfg.temperature,
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
    def _anthropic(self, system, messages, tools):
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
        body = {"model": self.cfg.model, "system": system, "messages": msgs, "max_tokens": self.cfg.max_tokens,
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
