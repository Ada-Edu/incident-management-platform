from __future__ import annotations
"""Typed settings for the Incident Management Temporal worker.

All values come from environment variables (see ../.env.example). Secrets are
NEVER hard-coded: the Bedrock API key is read by boto3 from
AWS_BEARER_TOKEN_BEDROCK and is intentionally not surfaced as a field here.
"""
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Temporal
    temporal_address: str = Field("localhost:7233", env="TEMPORAL_ADDRESS")
    temporal_namespace: str = Field("default", env="TEMPORAL_NAMESPACE")
    temporal_task_queue: str = Field("incident-main", env="TEMPORAL_TASK_QUEUE")

    # Supabase (worker uses the service role; RLS is bypassed for trusted writes)
    supabase_url: str = Field("http://host.docker.internal:54321", env="SUPABASE_URL")
    supabase_service_role_key: str = Field("dev-service-role-key", env="SUPABASE_SERVICE_ROLE_KEY")

    # Model provider: AWS Bedrock via boto3 bedrock-runtime (Converse API).
    # In af-south-1, Claude Opus 4.8 must be called through the global
    # cross-region inference profile `global.anthropic.claude-opus-4-8`.
    # Auth is a Bedrock API key (bearer token) read by boto3 from
    # AWS_BEARER_TOKEN_BEDROCK -- deliberately NOT a field here.
    bedrock_region: str = Field("af-south-1", env="BEDROCK_REGION")
    # Verified working in af-south-1 (2026-07-07): the bare model id is rejected
    # for on-demand; must use the global cross-region inference profile.
    bedrock_model_id: str = Field("global.anthropic.claude-opus-4-7", env="BEDROCK_MODEL_ID")
    bedrock_max_tokens: int = Field(4096, env="BEDROCK_MAX_TOKENS")

    class Config:
        case_sensitive = False


settings = Settings()
