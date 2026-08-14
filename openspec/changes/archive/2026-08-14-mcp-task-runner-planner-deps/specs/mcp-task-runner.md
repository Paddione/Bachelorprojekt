# mcp-task-runner — Delta (T005596)

## MODIFIED Requirements

### Requirement: plan_tasks

The system SHALL provide a `plan_tasks` MCP tool that accepts a list of `{task, env}` pairs and returns an execution plan organised into parallel groups.

The plan SHALL be derived by:
- Listing the project's tasks via `task --list-all --json` to obtain the task universe (task names and their source-file locations)
- Extracting the dependency edges (DAG) from the Taskfile YAML sources, resolving `includes:` namespaces declared in the root Taskfile
- Applying Kahn's topological sort to the requested tasks
- Placing tasks with no inter-dependency in the same parallel group
- Placing tasks from different brands (env) on the same level into the same parallel group

The system SHALL return `ErrCyclicDependency` if the requested tasks form a cycle.

The system SHALL fail with an error naming the unreadable or unparseable source file rather than silently returning an edge-less graph.

#### Scenario: same-brand independent tasks form one group

- **GIVEN** a Taskfile where `task-a` and `task-b` both have empty `deps`
- **WHEN** the caller invokes `plan_tasks` with `[{task: task-a, env: mentolder}, {task: task-b, env: mentolder}]`
- **THEN** the returned plan contains exactly one group with both tasks

#### Scenario: dependent tasks are sequenced

- **GIVEN** a Taskfile where `task-b` depends on `task-a`
- **WHEN** the caller invokes `plan_tasks` with both tasks for the same brand
- **THEN** the returned plan contains two groups, `task-a` first and `task-b` second

#### Scenario: cyclic dependencies are rejected

- **GIVEN** a Taskfile where task A depends on B and B depends on A
- **WHEN** the caller invokes `plan_tasks` with both tasks
- **THEN** the tool returns an error referencing the cycle

#### Scenario: dependency edges declared in include-namespaced taskfiles are honoured

- **GIVEN** a root Taskfile that includes a taskfile under the namespace `assets`, and a task `website:build` whose `deps` reference `assets:sync`
- **WHEN** the caller invokes `plan_tasks` with `website:build` and `assets:sync` for the same brand
- **THEN** the returned plan contains two groups, `assets:sync` first and `website:build` second
