import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'schema'))
from pipeline.capture import from_events, run_teacher
from pipeline.scenarios import Scenario
from pipeline.export import export_dataset
from validate import validate_episode, episode_fingerprint


def scenario(family='inspect', role='executor'):
    return Scenario(scenario_id='inspect-success', family=family, role=role,
                    prompt='Read README.md', base_model='candidate', allowed_paths=['README.md', 'missing'],
                    acceptance_criteria=['Final answer reflects actual file.'],
                    tools=[{'type': 'function', 'function': {'name': 'read', 'parameters':
                           {'type': 'object', 'properties': {'filePath': {'type': 'string'}}}}}])


def events(failed=False, arguments=None):
    state = {'status': 'error', 'input': arguments or {'filePath': 'missing'}, 'error': 'not found'} if failed else {
        'status': 'completed', 'input': arguments or {'filePath': 'README.md'}, 'output': 'Workspace', 'metadata': {}}
    return [{'type': 'tool_use', 'sessionID': 'session1', 'part': {'callID': 'call1', 'tool': 'read', 'state': state}},
            {'type': 'text', 'sessionID': 'session1', 'part': {'text': 'File missing.' if failed else 'Workspace.'}},
            {'type': 'step_finish', 'sessionID': 'session1', 'part': {'reason': 'stop'}}]


def episode(failed=False):
    return from_events(scenario(), events(failed), teacher_model='local', raw_sha256='a' * 64, reviewed=True)


class PipelineTests(unittest.TestCase):
    def test_capture_real_tool_and_failure(self):
        ep = episode()
        self.assertEqual(ep.messages[2]['role'], 'tool')
        self.assertEqual(ep.result.status, 'succeeded')
        failed = episode(True)
        self.assertEqual(failed.result.status, 'failed')
        self.assertEqual(failed.messages[2]['content'], 'not found')
        self.assertFalse(validate_episode(failed, {}, None))

    def test_malformed_events(self):
        broken = events()
        del broken[0]['part']['state']['output']
        with self.assertRaises(ValueError):
            from_events(scenario(), broken, teacher_model='x', raw_sha256='x')
        with self.assertRaises(ValueError):
            from_events(scenario(), events()[:-1], teacher_model='x', raw_sha256='x')

    def test_completed_bash_nonzero_is_failure(self):
        captured = events()
        captured[0]['part']['tool'] = 'bash'
        captured[0]['part']['state']['metadata'] = {'exit': 2}
        ep = from_events(scenario(), captured, teacher_model='x', raw_sha256='x')
        self.assertEqual(ep.result.status, 'failed')

    def test_dedupe_arguments_and_user_context(self):
        a, b = episode(), episode()
        b.messages[1]['tool_calls'][0]['function']['arguments'] = '{"filePath":"OTHER.md"}'
        self.assertNotEqual(episode_fingerprint(a), episode_fingerprint(b))
        b = episode()
        b.messages[0]['content'] = 'A different question'
        self.assertNotEqual(episode_fingerprint(a), episode_fingerprint(b))

    def test_reject_fabricated_success_or_unmatched_result(self):
        ep = episode()
        ep.messages[2]['status'] = 'failed'
        self.assertTrue(validate_episode(ep, {}, None))
        ep = episode()
        ep.messages[2]['tool_call_id'] = 'unknown'
        self.assertTrue(validate_episode(ep, {}, None))

    def test_run_failed_process_preserves_stderr(self):
        with tempfile.TemporaryDirectory() as directory:
            run = run_teacher([sys.executable, '-c', 'import sys;print("real error",file=sys.stderr);sys.exit(7)'], directory, 3)
            self.assertEqual(run['exit_code'], 7)
            self.assertIn('real error', run['stderr'])

    def test_timeout_is_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            run = run_teacher([sys.executable, '-c', 'import time;print("started",flush=True);time.sleep(10)'], directory, 0.1)
            self.assertTrue(run['timed_out'])
            self.assertIn('started', run['stdout'])

    def test_export_review_gate_and_reproducible_family_split(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'data'; source.mkdir()
            a = episode(); a.provenance.reviewed = False
            (source / 'a.json').write_text(a.model_dump_json())
            with self.assertRaises(ValueError):
                export_dataset(source, root / 'bad', seed='fixed')
            self.assertFalse((root / 'bad').exists())
            a.provenance.reviewed = True
            (source / 'a.json').write_text(a.model_dump_json())
            b = episode(True); b.episode_id = 'b'; b.messages[0]['content'] = 'Read missing file'
            (source / 'b.json').write_text(b.model_dump_json())
            export_dataset(source, root / 'one', seed='fixed')
            export_dataset(source, root / 'two', seed='fixed')
            for name in ('train.jsonl', 'val.jsonl', 'test.jsonl', 'manifest.json'):
                self.assertEqual((root / 'one' / name).read_bytes(), (root / 'two' / name).read_bytes())
            rows = [json.loads(line) for f in (root / 'one').glob('*.jsonl') for line in f.read_text().splitlines()]
            self.assertEqual(len(rows), 2)
            self.assertEqual(len({r['meta']['split'] for r in rows}), 1)
            self.assertTrue(rows[0]['tools'])

    def test_explicit_heldout_never_becomes_train_and_family_conflict_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / 'data'; source.mkdir()
            a = episode(); a.split = 'test'; a.provenance.split_assigned = True
            (source / 'a.json').write_text(a.model_dump_json())
            export_dataset(source, root / 'one', train=100, val=0)
            self.assertTrue((root / 'one' / 'test.jsonl').read_text())
            self.assertFalse((root / 'one' / 'train.jsonl').read_text())
            b = episode(True); b.episode_id = 'b'; b.split = 'train'; b.provenance.split_assigned = True
            (source / 'b.json').write_text(b.model_dump_json())
            with self.assertRaisesRegex(ValueError, 'conflicting source splits'):
                export_dataset(source, root / 'two')

    def test_path_guard_missing_exit_and_launch_error(self):
        ep = episode(); ep.messages[1]['tool_calls'][0]['function']['arguments'] = '{"filePath":"../secret"}'
        ep.tool_calls[0].arguments = {'filePath': '../secret'}
        self.assertTrue(validate_episode(ep, {}, None))
        captured = events(); captured[0]['part']['tool'] = 'bash'
        ep = from_events(scenario(), captured, teacher_model='x', raw_sha256='x')
        self.assertIsNone(ep.result)
        with tempfile.TemporaryDirectory() as directory:
            run = run_teacher(['/does-not-exist-qwen-teacher'], directory, 1)
            self.assertTrue(run['launch_error'])

    def test_dispatcher_decision_capture_qc_export(self):
        definition = Scenario(scenario_id='health', family='health', role='dispatcher',
                              prompt='Select health', base_model='candidate', expected_task='health',
                              expected_arguments={}, acceptance_criteria=['Select health without executing'])
        transcript = [{'type': 'text', 'sessionID': 'dispatch-session', 'part': {
            'text': '{"selected_task":"health","selected_arguments":{}}'}},
            {'type': 'step_finish', 'sessionID': 'dispatch-session', 'part': {'reason': 'stop'}}]
        ep = from_events(definition, transcript, teacher_model='teacher', raw_sha256='b' * 64, reviewed=True)
        self.assertIsNone(ep.result)
        self.assertEqual(ep.selected_task, 'health')
        self.assertFalse(validate_episode(ep, {}, {'health'}))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / 'data'; source.mkdir()
            (source / 'a.json').write_text(ep.model_dump_json())
            manifest = export_dataset(source, root / 'out', registry={'health'})
            self.assertEqual(sum(manifest['counts'].values()), 1)
        self.assertTrue(validate_episode(ep, {}, {'other'}))

    def test_duplicate_ids_rejected_even_with_distinct_transcripts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / 'data'; source.mkdir()
            a, b = episode(), episode(True)
            b.episode_id = a.episode_id
            (source / 'a.json').write_text(a.model_dump_json())
            (source / 'b.json').write_text(b.model_dump_json())
            with self.assertRaisesRegex(ValueError, 'duplicate episode id'):
                export_dataset(source, root / 'out')
            self.assertFalse((root / 'out').exists())

    def test_export_invalid_input_and_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / 'data'; source.mkdir()
            (source / 'a.json').write_text('{invalid')
            with self.assertRaises(ValueError):
                export_dataset(source, root / 'out')
            self.assertFalse((root / 'out').exists())


if __name__ == '__main__':
    unittest.main()
