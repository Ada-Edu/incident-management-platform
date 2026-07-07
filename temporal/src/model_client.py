from __future__ import annotations
"""Bedrock model client for the Temporal worker.

Uses boto3 `bedrock-runtime` (Converse API) with a Bedrock **API key**
(bearer token). boto3 reads the token from the `AWS_BEARER_TOKEN_BEDROCK`
environment variable automatically -- it is never hard-coded here.

In af-south-1, Claude Opus 4.8 is not available for on-demand invocation by its
bare model id; it must be called via the **global cross-region inference profile**
`global.anthropic.claude-opus-4-8` (see config.settings.bedrock_model_id and the
model-hosting ADR written in Phase 2).
"""
from functools import lru_cache
from typing import Any

import boto3

from .config import settings


@lru_cache(maxsize=1)
def get_bedrock_runtime():
    """Return a cached bedrock-runtime client for our region."""
    return boto3.client("bedrock-runtime", region_name=settings.bedrock_region)


def converse_text(system_prompt: str, user_text: str) -> str:
    """Single-turn Converse call; returns the assistant's text."""
    client = get_bedrock_runtime()
    resp: dict[str, Any] = client.converse(
        modelId=settings.bedrock_model_id,
        system=[{"text": system_prompt}],
        messages=[{"role": "user", "content": [{"text": user_text}]}],
        inferenceConfig={"maxTokens": settings.bedrock_max_tokens},
    )
    return resp["output"]["message"]["content"][0]["text"]
