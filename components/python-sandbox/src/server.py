"""FastAPI Microservice for Devmesh Python Sandbox Worker.

Exposes REST API endpoints for agent code execution and pytest test runs:
- GET  /health: Engine capabilities, bubblewrap status, isolation verification
- GET  /v1/status: Live worker pool and queue telemetry
- POST /v1/execute: Execute arbitrary Python code inside isolated sandbox
- POST /v1/pytest: Run pytest suites against supplied source files

Concurrency & Buffer Architecture:
- MAX_CONCURRENT_WORKERS = 4: Exactly 4 actively executing worker processes
- MAX_BUFFERED_JOBS = 28: Up to 28 queued requests waiting for an execution slot (32 total capacity)
- DEFAULT_MEMORY_MB = 512: 512 MiB RAM limit per sandbox execution
"""

from __future__ import annotations

import asyncio
from typing import Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .engine import SandboxEngine


MAX_CONCURRENT_WORKERS = 4
MAX_BUFFERED_JOBS = 28
DEFAULT_MEMORY_MB = 512

app = FastAPI(
    title="Devmesh Python Sandbox Worker",
    version="1.1.0",
    description="Hardware-isolated, airgapped execution environment for LLM agent tasks and test suites with worker pooling and concurrency limits.",
)

engine = SandboxEngine(default_memory_mb=DEFAULT_MEMORY_MB)

# Worker concurrency and queue tracking
_semaphore: asyncio.Semaphore | None = None
_active_workers: int = 0
_queued_jobs: int = 0
_total_processed: int = 0


def get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(MAX_CONCURRENT_WORKERS)
    return _semaphore


class ExecuteRequest(BaseModel):
    code: str = Field(..., description="Python source code to execute")
    files: dict[str, str] = Field(default_factory=dict, description="Files to place in sandbox workspace (filename -> content)")
    timeout_seconds: int = Field(default=15, ge=1, le=120, description="Execution timeout in seconds")
    memory_limit_mb: int = Field(default=DEFAULT_MEMORY_MB, ge=64, le=4096, description="Virtual memory limit in megabytes")
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
        "config": {
            "max_concurrent_workers": MAX_CONCURRENT_WORKERS,
            "max_buffered_jobs": MAX_BUFFERED_JOBS,
            "total_capacity": MAX_CONCURRENT_WORKERS + MAX_BUFFERED_JOBS,
            "default_memory_mb": DEFAULT_MEMORY_MB,
        },
        "capabilities": [
            "python_execution",
            "pytest_runner",
            "ephemeral_workspace",
            "rlimit_memory_cpu",
            "zero_network_airgap",
            "artifact_capture",
            "concurrency_worker_pool",
            "buffered_job_queue",
        ],
    }


@app.get("/v1/status")
def status() -> dict[str, Any]:
    return {
        "active_workers": _active_workers,
        "max_concurrent_workers": MAX_CONCURRENT_WORKERS,
        "queued_jobs": _queued_jobs,
        "max_buffered_jobs": MAX_BUFFERED_JOBS,
        "available_worker_slots": MAX_CONCURRENT_WORKERS - _active_workers,
        "available_queue_slots": MAX_BUFFERED_JOBS - _queued_jobs,
        "total_processed": _total_processed,
    }


@app.post("/v1/execute", response_model=ExecuteResponse)
async def execute_code(req: ExecuteRequest) -> ExecuteResponse:
    global _active_workers, _queued_jobs, _total_processed

    if _queued_jobs >= MAX_BUFFERED_JOBS:
        raise HTTPException(
            status_code=503,
            detail=f"Sandbox worker queue full ({_queued_jobs}/{MAX_BUFFERED_JOBS} buffered jobs). Retry later.",
        )

    sem = get_semaphore()
    _queued_jobs += 1
    try:
        async with sem:
            _queued_jobs -= 1
            _active_workers += 1
            try:
                loop = asyncio.get_running_loop()
                res = await loop.run_in_executor(
                    None,
                    lambda: engine.execute(
                        code=req.code,
                        files=req.files,
                        timeout_seconds=req.timeout_seconds,
                        memory_limit_mb=req.memory_limit_mb,
                        entrypoint_filename=req.entrypoint,
                    ),
                )
                _total_processed += 1
                return ExecuteResponse(**res.to_dict())
            finally:
                _active_workers -= 1
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal sandbox failure: {str(e)}")


@app.post("/v1/pytest", response_model=PytestResponse)
async def run_pytest(req: PytestRequest) -> PytestResponse:
    global _active_workers, _queued_jobs, _total_processed

    if _queued_jobs >= MAX_BUFFERED_JOBS:
        raise HTTPException(
            status_code=503,
            detail=f"Sandbox worker queue full ({_queued_jobs}/{MAX_BUFFERED_JOBS} buffered jobs). Retry later.",
        )

    sem = get_semaphore()
    _queued_jobs += 1
    try:
        async with sem:
            _queued_jobs -= 1
            _active_workers += 1
            try:
                loop = asyncio.get_running_loop()
                res = await loop.run_in_executor(
                    None,
                    lambda: engine.run_pytest(
                        test_code=req.test_code,
                        source_files=req.source_files,
                        timeout_seconds=req.timeout_seconds,
                        extra_pytest_args=req.extra_args,
                    ),
                )
                _total_processed += 1
                return PytestResponse(**res.to_dict())
            finally:
                _active_workers -= 1
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal sandbox failure: {str(e)}")
