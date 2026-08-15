# Partial 1: Taskfile DAG Parser & Planner

## Tasks

- [ ] **Step 1: Implement Taskfile Parser and Dependency DAG**
  - Create `scripts/mcp-task-runner/planner.mjs`.
  - Use `js-yaml` to parse `Taskfile.yml` and resolve `includes:` namespaces.
  - Implement Kahn's topological sort for `plan_tasks` to group independent tasks into parallel execution stages.
  - Implement `get_task_graph` returning Mermaid DAG (`graph TD`) or JSON.
  - Export `parseTaskfileDAG(taskfilePath)`, `planTasks(tasks, taskfilePath)`, `getTaskGraph(taskfilePath, format)`.

- [ ] **Step 2: Add Unit Tests for Planner**
  - Create `scripts/mcp-task-runner/planner.test.mjs` testing independent grouping, dependency sequencing, cycle detection (`ErrCyclicDependency`), and Mermaid/JSON graph generation.
  - Run: `node --test scripts/mcp-task-runner/planner.test.mjs`
