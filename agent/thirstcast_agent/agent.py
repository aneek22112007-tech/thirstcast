"""Strands agent factory.

MODEL_PROVIDER: bedrock | groq | none.
* bedrock: MODEL_ID = Bedrock model or inference-profile ID.
* groq: GROQ_MODEL_ID (default openai/gpt-oss-120b) via Groq's OpenAI-compatible API. The API key is read once
  per cold start from SSM SecureString GROQ_API_KEY_PARAM (default /thirstcast/groq_api_key), or from env
  GROQ_API_KEY for local runs. The key is never logged.
"""
import os
from pathlib import Path

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "system_prompt.md"


def system_prompt():
    try:
        return PROMPT_PATH.read_text(encoding="utf-8")
    except OSError:
        return "Answer only from tool output, give ranges, reply in the user's language, never claim certainty."


GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"
_GROQ_KEY = None


def groq_api_key():
    """Env GROQ_API_KEY (local) or SSM SecureString (Lambda), cached for the container lifetime."""
    global _GROQ_KEY
    if _GROQ_KEY:
        return _GROQ_KEY
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if not key:
        import boto3
        name = os.environ.get("GROQ_API_KEY_PARAM", "/thirstcast/groq_api_key")
        key = boto3.client("ssm").get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"].strip()
    if not key:
        raise RuntimeError("Groq API key is empty")
    _GROQ_KEY = key
    return key


def provider():
    return os.environ.get("MODEL_PROVIDER", "none").lower()


def get_model():
    """Return a Strands model, or None when MODEL_PROVIDER=none (template mode)."""
    p = provider()
    if p == "none":
        return None
    if p == "bedrock":
        model_id = os.environ.get("MODEL_ID", "").strip()
        if not model_id:
            raise RuntimeError("MODEL_ID is not set")
        from botocore.config import Config
        from strands.models import BedrockModel
        return BedrockModel(
            model_id=model_id,
            region_name=os.environ.get("BEDROCK_REGION") or os.environ.get("AWS_REGION"),
            max_tokens=int(os.environ.get("MAX_TOKENS", "400")),
            temperature=float(os.environ.get("TEMPERATURE", "0.2")),
            boto_client_config=Config(read_timeout=int(os.environ.get("BEDROCK_READ_TIMEOUT", "18")),
                                      connect_timeout=5, retries={"max_attempts": 1}),
        )
    if p == "groq":
        from strands.models.openai import OpenAIModel
        return OpenAIModel(
            client_args={"api_key": groq_api_key(), "base_url": os.environ.get("GROQ_BASE_URL", GROQ_BASE_URL),
                         "timeout": float(os.environ.get("LLM_READ_TIMEOUT", "18")), "max_retries": 0},
            model_id=os.environ.get("GROQ_MODEL_ID", "").strip() or GROQ_DEFAULT_MODEL,
            params={"max_tokens": int(os.environ.get("MAX_TOKENS", "400")),
                    "reasoning_effort": os.environ.get("GROQ_REASONING_EFFORT", "low"),
                    "temperature": float(os.environ.get("TEMPERATURE", "0.2"))},
        )
    raise RuntimeError(f"unsupported MODEL_PROVIDER={p}")


def build_agent(model=None):
    from strands import Agent

    from .tools import strands_tools
    model = model or get_model()
    if model is None:
        raise RuntimeError("no model configured (MODEL_PROVIDER=none)")
    # retry_strategy=None: no long backoff on throttling (Groq free tier is 8k tokens/min); handle_ask falls back
    # to the template advisory instead, so /ask stays fast.
    return Agent(model=model, tools=strands_tools(), system_prompt=system_prompt(), callback_handler=None,
                 retry_strategy=None)
