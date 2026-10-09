"""Strands agent factory. MODEL_PROVIDER: bedrock | none. MODEL_ID: Bedrock model or inference-profile ID."""
import os
from pathlib import Path

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "system_prompt.md"


def system_prompt():
    try:
        return PROMPT_PATH.read_text(encoding="utf-8")
    except OSError:
        return "Answer only from tool output, give ranges, reply in the user's language, never claim certainty."


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
    raise RuntimeError(f"unsupported MODEL_PROVIDER={p}")


def build_agent(model=None):
    from strands import Agent

    from .tools import strands_tools
    model = model or get_model()
    if model is None:
        raise RuntimeError("no model configured (MODEL_PROVIDER=none)")
    return Agent(model=model, tools=strands_tools(), system_prompt=system_prompt(), callback_handler=None)
