"""FastAPI Microservice for Devmesh Python Sandbox Worker.

Exposes REST API endpoints for agent code execution and pytest test runs:
- GET  /health: Engine capabilities, bubblewrap status, isolation verification
- POST /v1/execute: Execute arbitrary Python code inside isolated sandbox
- POST /v1/pytest: Run pytest suites against supplied source files
"""

from __future__ import annotations

from typing import Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .engine import SandboxEngine


app = FastAPI(
    title="Devmesh Python Sandbox Worker",
    version="1.0.0",
    description="Hardware-isolated, airgapped execution environment for LLM agent tasks and test suites.",
)

engine = SandboxEngine()


class ExecuteRequest(BaseModel):
    code: str = Field(..., description="Python source code to execute")
    files: dict[str, str] = Field(default_factory=dict, description="Files to place in sandbox workspace (filename -> content)")
    timeout_seconds: int = Field(default=15, ge=1, le=120, description="Execution timeout in seconds")
    memory_limit_mb: int = Field(default=512, ge=64, le=4096, description="Virtual memory limit in megabytes")
    entrypoint: str = Field(default="main.py", description="Main script filename")


class ExecuteResponse(BaseModel):
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: float
    artifacts: dict[str, str] = Field(default_factory=dict)
    timed_out: bool = False
    error: str | None = None


class PytestRequest(BaseModel):
    test_code: str = Field(..., description="Pytest test script content")
    source_files: dict[str, str] = Field(default_factory=dict, description="Source files required for tests")
    timeout_seconds: int = Field(default=30, ge=1, le=180, description="Test suite timeout in seconds")
    extra_args: list[str] = Field(default_factory=list, description="Extra pytest arguments (e.g. -k, -x)")


class PytestResponse(BaseModel):
    success: bool
    exit_code: int
    passed: int
    failed: int
    skipped: int
    total: int
    output: str
    duration_ms: float
    timed_out: bool = False
    error: str | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "online",
        "service": "devmesh-python-sandbox",
        "bubblewrap_available": engine.is_bubblewrap_available,
        "isolation_level": "airgap_unshare_all" if engine.is_bubblewrap_available else "process_rlimit",
        "capabilities": [
            "python_execution",
            "pytest_runner",
            "ephemeral_workspace",
            "rlimit_memory_cpu",
            "zero_network_airgap",
            "artifact_capture",
        ],
    }


@app.post("/v1/execute", response_model=ExecuteResponse)
def execute_code(req: ExecuteRequest) -> ExecuteResponse:
    try:
        res = engine.execute(
            code=req.code,
            files=req.files,
            timeout_seconds=req.timeout_seconds,
            memory_limit_mb=req.memory_limit_mb,
            entrypoint_filename=req.entrypoint,
        )
        return ExecuteResponse(**res.to_dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal sandbox failure: {str(e)}")


@app.post("/v1/pytest", response_model=PytestResponse)
def run_pytest(req: PytestRequest) -> PytestResponse:
    try:
        res = engine.run_pytest(
            test_code=req.test_code,
            source_files=req.source_files,
            timeout_seconds=req.timeout_seconds,
            extra_pytest_args=req.extra_args,
        )
        return PytestResponse(**res.to_dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal sandbox failure: {str(e)}")
