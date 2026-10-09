"""agent Lambda: POST /ask -> thirstcast_agent.handler_core.handle_ask (AgentLayer) with DynamoRepo (CommonLayer).
Env: MODEL_PROVIDER (bedrock|none), MODEL_ID, ASK_MODE (llm|template = kill switch), MAX_TOKENS, AGENT_TIME_BUDGET_S."""
import base64
import json
import logging
import os

from dynamo_repo import DynamoRepo
from thirstcast_agent.handler_core import MAX_QUESTION, handle_ask

log = logging.getLogger()
log.setLevel(logging.INFO)
_repo = None


def resp(code, body):
    return {"statusCode": code, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body, ensure_ascii=False)}


def lambda_handler(event, context):
    global _repo
    try:
        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw).decode("utf-8")
        body = json.loads(raw)
        if not isinstance(body, dict):
            raise ValueError("body must be a JSON object")
    except (ValueError, UnicodeDecodeError):
        return resp(400, {"error": "body must be JSON: {\"question\": \"...\", \"district\": \"optional\"}"})
    question = body.get("question")
    if not isinstance(question, str) or not question.strip():
        return resp(400, {"error": "question is required"})
    if len(question) > MAX_QUESTION:
        return resp(400, {"error": f"question must be at most {MAX_QUESTION} characters"})
    district = body.get("district") if isinstance(body.get("district"), str) else None
    if _repo is None:
        _repo = DynamoRepo()
    mode = os.environ.get("ASK_MODE", "llm")
    out = handle_ask(question, district, repo=_repo, mode=mode)
    log.info(json.dumps({"ask": question[:120], "mode": out["mode"], "tools_used": out["tools_used"],
                         "district": out["district"], "lang": out["lang"]}, ensure_ascii=False))
    return resp(200, out)
