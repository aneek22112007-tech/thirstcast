"""handle_ask: the single entry point used by the agent Lambda and by local tests/eval.

Returns the POST /ask contract:
{"answer", "lang", "mode": "llm"|"template", "tools_used", "district", "caveat"}
Any agent error or timeout returns the template answer (mode "template"), so /ask never breaks.
"""
import concurrent.futures
import contextvars
import logging
import os
import time

from . import fallback, tools
from .lang import detect_lang, find_district

log = logging.getLogger("thirstcast.agent")
MAX_QUESTION = 500
_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2)


def _llm_answer(question, district, lang):
    from .agent import build_agent
    agent = build_agent()
    prompt = question
    if district:
        prompt = f"[district hint: {district}] {question}"
    result = agent(prompt)
    return str(result).strip()


def handle_ask(question, district=None, repo=None, mode="llm", time_budget_s=None):
    question = (question or "").strip()[:MAX_QUESTION]
    if repo is not None:
        tools.set_repo(repo)
    lang = detect_lang(question)
    did = district if district in tools.VALID else find_district(question)
    use_llm = mode == "llm" and os.environ.get("MODEL_PROVIDER", "none").lower() != "none"
    if not use_llm:
        return fallback.answer(question, district, lang=lang)

    budget = float(time_budget_s or os.environ.get("AGENT_TIME_BUDGET_S", "20"))
    used = []
    token = tools.TOOLS_USED.set(used)
    t0 = time.time()
    try:
        ctx = contextvars.copy_context()
        fut = _POOL.submit(ctx.run, _llm_answer, question, did, lang)
        text = fut.result(timeout=budget)
        if not text:
            raise RuntimeError("empty answer")
        log.info("llm answer in %.1fs tools=%s", time.time() - t0, used)
        return {"answer": text, "lang": lang, "mode": "llm", "tools_used": list(used), "district": did,
                "caveat": fallback.ASK_CAVEAT}
    except concurrent.futures.TimeoutError:
        log.warning("agent timed out after %.1fs, using template", budget)
    except Exception as e:  # noqa: BLE001 - any failure falls back
        log.warning("agent error %r, using template", e)
    finally:
        tools.TOOLS_USED.reset(token)
    return fallback.answer(question, district, lang=lang)
