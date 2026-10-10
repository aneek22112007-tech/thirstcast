"""pytest agent/tests -q  (no AWS, no model calls)."""
import time
from pathlib import Path

import pytest

from thirstcast_agent import handler_core, tools
from thirstcast_agent.fallback import answer
from thirstcast_agent.lang import detect_lang, find_acres, find_crop, find_district
from thirstcast_core.litres import farmer_range
from thirstcast_core.repo import LocalRepo

FIX = Path(__file__).parent / "fixtures" / "status"


@pytest.fixture
def repo():
    return LocalRepo(status_dir=FIX)


def test_lang_detection():
    assert detect_lang("क्या मंड्या में?") == "hi" and detect_lang("Mandya?") == "en"
    assert find_district("बेंगलुरु में") == "Bengaluru_Urban" and find_district("bangalore") == "Bengaluru_Urban"
    assert find_district("KRS dam") == "Mandya" and find_district("Delhi") is None
    assert find_crop("2 एकड़ धान") == "paddy" and find_acres("२ एकड़ धान") == 2.0 and find_acres("3.5 acres") == 3.5


def test_tools_numbers_come_from_repo(repo):
    tools.set_repo(repo)
    st = repo.get_status("Mandya")
    g = tools.water_gap_data("Mandya", "paddy", 2)
    assert g["extra_litres_range"] == farmer_range(st["excess_mm_7d"], 1.2, 2)
    assert tools.status_data("Atlantis")["error"].startswith("unknown district")
    assert "error" in tools.water_gap_data("Mandya", "coffee", 1)
    h = tools.heat_compare_data("Kolar")
    assert len(h["days"]) == 7 and h["thirst_only_days"] + h["heat_only_days"] + h["both_days"] <= 7


def test_no_data_template(tmp_path):
    a = answer("Will Mandya face a thirstwave?", repo=LocalRepo(status_dir=tmp_path))
    assert a["mode"] == "template" and "No forecast data" in a["answer"]


def test_template_mode_shape(repo, monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "none")
    a = handler_core.handle_ask("क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?", repo=repo)
    assert set(a) == {"answer", "lang", "mode", "tools_used", "district", "caveat"}
    assert a["lang"] == "hi" and a["mode"] == "template" and a["district"] == "Mandya"
    assert "get_status" in a["tools_used"]


def test_llm_path_uses_tools(repo, monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "bedrock")

    def fake_llm(q, d, lang):
        tools.status_data("Mandya")
        return "Mandya: likely thirstwave (estimate). District-centroid estimate (~10 km grid)"
    monkeypatch.setattr(handler_core, "_llm_answer", fake_llm)
    a = handler_core.handle_ask("Will Mandya face a thirstwave?", repo=repo)
    assert a["mode"] == "llm" and a["tools_used"] == ["get_status"]


def test_llm_error_falls_back(repo, monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "bedrock")
    monkeypatch.setattr(handler_core, "_llm_answer", lambda *a: (_ for _ in ()).throw(RuntimeError("AccessDenied")))
    assert handler_core.handle_ask("Will Mandya face a thirstwave?", repo=repo)["mode"] == "template"


def test_llm_timeout_falls_back(repo, monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "bedrock")
    monkeypatch.setattr(handler_core, "_llm_answer", lambda *a: time.sleep(2) or "late")
    t0 = time.time()
    a = handler_core.handle_ask("Will Mandya face a thirstwave?", repo=repo, time_budget_s=0.3)
    assert a["mode"] == "template" and time.time() - t0 < 1.5


def test_build_agent_with_bedrock_config(monkeypatch, repo):
    pytest.importorskip("strands")
    monkeypatch.setenv("MODEL_PROVIDER", "bedrock")
    monkeypatch.setenv("MODEL_ID", "apac.amazon.nova-lite-v1:0")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    from thirstcast_agent.agent import build_agent, system_prompt
    agent = build_agent()
    assert set(agent.tool_names) == {"get_status", "get_forecast", "water_gap", "compare_with_heat"}
    assert "Answer ONLY from tool output" in system_prompt()
    tools.set_repo(repo)
    res = agent.tool.water_gap(district="Mandya", crop="paddy", acres=2)  # direct tool call, no model
    assert res["status"] == "success" and "extra_litres_range" in res["content"][0]["text"]
