"""Episode- und Result-Schema fuer die Qwen3.5-Rollenmodelle (T900930).

Eine Episode ist EIN trainingsfaehiger Ausschnitt: Szenario + Konversation
(inkl. Tool-Calls und echten Tool-Resultaten) + Verifikationsergebnis.
Provenance und Splits sind Pflicht — Episoden ohne Herkunft sind ungueltig.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

Role = Literal["dispatcher", "executor", "orchestrator", "planner"]
Split = Literal["train", "val", "test"]


class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class Result(BaseModel):
    """Normalisiertes Job-Ergebnis (eine Quelle fuer alle Rollen).

    exit_code = Prozess-Exit-Code (oder null bei Timeout/Permission-Reject).
    error_code = Runtime-Fehlercode, getrennt vom Exit-Code halten.
    """

    status: Literal["succeeded", "failed", "timed_out", "cancelled", "rejected"]
    exit_code: int | None = None
    error_code: str | None = None
    summary: str
    artifacts: list[str] = Field(default_factory=list)


class Provenance(BaseModel):
    generator: str  # z.B. "opencode/primary", "human", "teacher:<model>"
    source_session: str | None = None
    executed: bool = True  # wurde die Episode real ausgefuehrt?
    reviewed: bool = False
    tool_schema_version: str  # Version des Tool-Protokolls, z.B. "v1"
    scenario_version: str | None = None
    raw_sha256: str | None = None
    source_worktree: str | None = None
    split_assigned: bool = True


class Episode(BaseModel):
    episode_id: str
    role: Role
    scenario_id: str  # Szenario-Familie fuer Leakage-freie Splits
    scenario_version: str
    base_model: str  # z.B. "Qwen3.5-0.8B-Instruct"
    messages: list[dict[str, Any]]  # Chat-Format inkl. tool_calls/tool-Rollen
    tool_calls: list[ToolCall] = Field(default_factory=list)
    tools: list[dict[str, Any]] = Field(default_factory=list)
    expected_plan: dict[str, Any] | None = None
    selected_task: str | None = None
    selected_arguments: dict[str, Any] | None = None
    scenario_variant: str | None = None
    result: Result | None = None
    acceptance_criteria: list[str] = Field(default_factory=list)
    expected_task: str | None = None  # dispatcher: erwarteter Task
    expected_arguments: dict[str, Any] | None = None  # dispatcher: erwartete Args
    allowed_paths: list[str] | None = None  # executor: erlaubte Pfade
    plan: dict[str, Any] | None = None  # orchestrator/planner: Plan-Objekt
    provenance: Provenance
    split: Split
    created: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"json_schema_extra": {"examples": []}}


def export_json_schema(path: str = "episode.schema.json") -> None:
    import json

    schema = {
        "episode": Episode.model_json_schema(),
        "result": Result.model_json_schema(),
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(schema, fh, indent=2, ensure_ascii=False)
    print(f"schema written: {path}")


if __name__ == "__main__":
    export_json_schema()
