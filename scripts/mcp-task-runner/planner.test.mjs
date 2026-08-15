import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule, graphToMermaid, graphToJSON, sanitizeID, CyclicDependencyError } from './planner.mjs';

test('sanitizeID replaces special characters with underscore', () => {
  assert.equal(sanitizeID('workspace:deploy'), 'workspace_deploy');
  assert.equal(sanitizeID('my-task.sub/1'), 'my_task_sub_1');
});

test('schedule groups independent tasks into a single group', () => {
  const graph = {
    'task-a': [],
    'task-b': [],
  };
  const reqs = [
    { task: 'task-a', env: 'mentolder' },
    { task: 'task-b', env: 'mentolder' },
  ];
  const plan = schedule(graph, reqs);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].tasks.length, 2);
});

test('schedule sequences dependent tasks into multiple groups', () => {
  const graph = {
    'task-a': [],
    'task-b': ['task-a'],
  };
  const reqs = [
    { task: 'task-b', env: 'mentolder' },
    { task: 'task-a', env: 'mentolder' },
  ];
  const plan = schedule(graph, reqs);
  assert.equal(plan.groups.length, 2);
  assert.equal(plan.groups[0].tasks[0].task, 'task-a');
  assert.equal(plan.groups[1].tasks[0].task, 'task-b');
});

test('schedule throws CyclicDependencyError on cycles', () => {
  const graph = {
    'task-a': ['task-b'],
    'task-b': ['task-a'],
  };
  const reqs = [
    { task: 'task-a', env: 'dev' },
    { task: 'task-b', env: 'dev' },
  ];
  assert.throws(() => schedule(graph, reqs), CyclicDependencyError);
});

test('graphToMermaid formats graph deterministically', () => {
  const graph = {
    'task-b': ['task-a'],
    'task-a': [],
  };
  const mermaid = graphToMermaid(graph);
  assert.ok(mermaid.includes('graph TD'));
  assert.ok(mermaid.includes('task_a["task-a"]'));
  assert.ok(mermaid.includes('task_b["task-b"]'));
  assert.ok(mermaid.includes('task_a --> task_b'));
});

test('graphToJSON formats nodes and edges', () => {
  const graph = {
    'task-b': ['task-a'],
    'task-a': [],
  };
  const jsonStr = graphToJSON(graph);
  const data = JSON.parse(jsonStr);
  assert.deepEqual(data.nodes, ['task-a', 'task-b']);
  assert.deepEqual(data.edges, [{ from: 'task-a', to: 'task-b' }]);
});
