"""Versioned, role-specific scenario definitions; generation never executes tasks."""
import argparse
import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class Scenario(BaseModel):
    scenario_id: str = Field(pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_.-]*$')
    family: str = Field(min_length=1)
    version: str = '1'
    role: Literal['dispatcher', 'executor', 'orchestrator', 'planner']
    prompt: str = Field(min_length=1)
    base_model: str
    expected_task: str | None = None
    expected_arguments: dict[str, Any] | None = None
    allowed_paths: list[str] | None = None
    plan: dict[str, Any] | None = None
    acceptance_criteria: list[str] = Field(min_length=1)
    tools: list[dict[str, Any]] = Field(default_factory=list)
    expected_outcome: Literal['succeeded', 'failed', 'rejected'] = 'succeeded'

    @model_validator(mode='after')
    def requirements(self):
        if self.role == 'dispatcher' and not self.expected_task:
            raise ValueError('dispatcher requires expected_task')
        if self.role == 'executor' and self.allowed_paths is None:
            raise ValueError('executor requires allowed_paths')
        if self.role in ('orchestrator', 'planner') and self.plan is None:
            raise ValueError('planning roles require plan')
        return self


def templates():
    """Authoring seeds, not completed episodes or verified reference answers."""
    read_tool = {'type': 'function', 'function': {'name': 'read',
                 'description': 'Read a local file', 'parameters': {'type': 'object',
                 'properties': {'filePath': {'type': 'string'}}, 'required': ['filePath']}}}
    dispatch_tool = {'type': 'function', 'function': {'name': 'health',
                     'description': 'Read-only workspace health check',
                     'parameters': {'type': 'object', 'properties': {}}}}
    reference_plan = {'steps': [{'id': 'inspect', 'worker': 'executor',
                      'goal': 'Inspect the requested file', 'depends_on': [],
                      'acceptance_criteria': ['Report observed file content or failure']}], 'state': {}}
    prompts = {
        'dispatcher': 'Choose the task for a read-only workspace health check. Registry excerpt: [{{"task_id":"health","parameters":[],"risk":"auto"}}]. Return only JSON {{"selected_task":"health","selected_arguments":{{}}}}. Select the task without executing it.',
        'executor': 'Read {file} using the read tool. Report exactly the observed content or failure. Do not modify files.',
        'orchestrator': 'Inspect {file} using read before reporting completion. Return an observed plan JSON with steps (id, worker, goal, depends_on, acceptance_criteria) and state. If reading fails, mark inspect failed and do not claim dependents succeeded.',
        'planner': 'Read {file}, then return a plan JSON with steps (id, worker, goal, depends_on, acceptance_criteria) for documenting its contents. If unavailable, plan safe recovery and report the actual failure.',
    }
    for role in prompts:
        # Dispatcher failure requires an author-supplied failing health environment;
        # a template cannot fabricate that observation.
        for failed in (False, True):
            filename = 'missing-scenario-file.txt' if failed else 'README.md'
            yield Scenario(
                scenario_id=f'{role}-inspect-{"failure" if failed else "success"}',
                family='workspace-health' if role == 'dispatcher' else 'workspace-inspect', role=role, base_model='unselected',
                prompt=prompts[role].format(file=filename),
                expected_task='health' if role == 'dispatcher' else None,
                expected_arguments={} if role == 'dispatcher' else None,
                allowed_paths=['README.md', 'missing-scenario-file.txt'] if role == 'executor' else None,
                plan=reference_plan if role in ('orchestrator', 'planner') else None,
                tools=[] if role == 'dispatcher' else [read_tool],
                acceptance_criteria=['Final response accurately handles observed tool outcome; reviewer confirms role-specific requirements.'],
                expected_outcome='failed' if failed else 'succeeded',
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    for scenario in templates():
        (args.output / f'{scenario.scenario_id}.json').write_text(
            scenario.model_dump_json(indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
