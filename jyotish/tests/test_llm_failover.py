"""The AI client survives model retirements: it skips retired or busy models and discovers a working one."""
import json
import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chat import llm as L  # noqa: E402


def _stream(text):
    chunk = {"choices": [{"delta": {"content": text}, "finish_reason": "stop"}]}
    return httpx.Response(200, content=f"data: {json.dumps(chunk)}\n\ndata: [DONE]\n\n".encode())


@pytest.fixture(autouse=True)
def fresh_state():
    L._states.clear()
    yield
    L._states.clear()


def _client(models, handler):
    cfg = L.LLMConfig("openai", "test-key", models[0], "https://llm.test/v1", models=tuple(models))
    client = L.LLM(cfg)
    client.client = httpx.Client(transport=httpx.MockTransport(handler))
    return client


def test_retired_model_is_skipped_and_remembered():
    calls = []

    def handler(request):
        model = json.loads(request.content)["model"]
        calls.append(model)
        if model == "old/model":
            return httpx.Response(410, json={"detail": "The model has reached its end of life"})
        return _stream("hello from " + model)

    llm = _client(["old/model", "new/model"], handler)
    assert llm.complete("sys", [{"role": "user", "content": "hi"}], [])["text"] == "hello from new/model"
    assert llm.complete("sys", [{"role": "user", "content": "again"}], [])["text"] == "hello from new/model"
    assert calls == ["old/model", "new/model", "new/model"]  # the retired model is not retried
    assert "old/model" in llm.cfg.public()["retired_models"]
    assert llm.cfg.public()["model"] == "new/model"


def test_busy_model_falls_through_for_this_request_only():
    calls = []

    def handler(request):
        model = json.loads(request.content)["model"]
        calls.append(model)
        if model == "primary" and len(calls) == 1:
            return httpx.Response(503, json={"detail": "overloaded"})
        return _stream(model)

    llm = _client(["primary", "backup"], handler)
    assert llm.complete("s", [{"role": "user", "content": "x"}], [])["text"] == "backup"
    assert llm.complete("s", [{"role": "user", "content": "y"}], [])["text"] == "primary"
    assert not L._state_for("https://llm.test/v1")["gone"]


def test_catalogue_is_read_when_every_configured_model_is_gone():
    def handler(request):
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "nvidia/nv-embedqa-mistral-7b-v2"},
                                                      {"id": "nvidia/nemotron-3.5-lightning-30b-a3b"}]})
        model = json.loads(request.content)["model"]
        if model.startswith("gone/"):
            return httpx.Response(404, json={"detail": "Function not found for account"})
        return _stream("answer by " + model)

    llm = _client(["gone/a", "gone/b"], handler)
    out = llm.complete("s", [{"role": "user", "content": "x"}], [])
    assert out["text"] == "answer by nvidia/nemotron-3.5-lightning-30b-a3b"  # embeddings model is never chosen
    assert llm.cfg.public()["auto_selected"] is True


def test_a_real_error_is_not_hidden():
    llm = _client(["m"], lambda request: httpx.Response(401, json={"detail": "bad key"}))
    with pytest.raises(L.LLMError, match="HTTP 401"):
        llm.complete("s", [{"role": "user", "content": "x"}], [])


def test_model_list_is_read_from_the_environment(monkeypatch):
    monkeypatch.setattr(L, "load_env_file", lambda *a, **k: None)
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setenv("LLM_MODEL", "first/model, second/model")
    monkeypatch.setenv("LLM_FALLBACK_MODELS", "third/model,first/model")
    cfg = L.LLMConfig.from_env()
    assert cfg.model == "first/model" and cfg.models == ("first/model", "second/model", "third/model")


def test_backup_provider_takes_over_and_uses_only_free_models():
    seen = []

    def handler(request):
        host = request.url.host
        if host == "primary.test":
            return httpx.Response(410, json={"detail": "end of life"})
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [
                {"id": "paid/big-model", "pricing": {"prompt": "0.000003", "completion": "0.000015"}},
                {"id": "nvidia/nemotron-3.5-super-vl:free", "pricing": {"prompt": "0", "completion": "0"}}]})
        model = json.loads(request.content)["model"]
        seen.append(model)
        return _stream("backup says hi via " + model)

    backup = L.LLMConfig("openai", "backup-key", "", "https://backup.test/v1")
    cfg = L.LLMConfig("openai", "k", "gone/model", "https://primary.test/v1", models=("gone/model",), backup=backup)
    llm = L.LLM(cfg)
    transport = httpx.MockTransport(handler)
    llm.client = httpx.Client(transport=transport)
    llm.backup.client = httpx.Client(transport=transport)
    out = llm.complete("s", [{"role": "user", "content": "x"}], [])
    assert out["text"] == "backup says hi via nvidia/nemotron-3.5-super-vl:free"
    assert seen == ["nvidia/nemotron-3.5-super-vl:free"]  # the paid model is never chosen
    assert cfg.public()["backup"]["model"] == "nvidia/nemotron-3.5-super-vl:free"
    assert "backup-key" not in json.dumps(cfg.public())
