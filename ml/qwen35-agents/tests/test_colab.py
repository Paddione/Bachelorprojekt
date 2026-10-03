import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from colab.config import Budget, planner_gate, save_run_manifest, sft_kwargs


def row(reasoning=True):
    plan = {'steps': [{'id': 'inspect', 'worker': 'executor', 'goal': 'Read README',
                      'depends_on': [], 'acceptance_criteria': ['Observed contents reported']}]}
    answer = {'role': 'assistant', 'content': json.dumps(plan)}
    if reasoning:
        answer['reasoning_content'] = 'Reading first provides evidence for the documentation step.'
    return {'messages': [{'role': 'user', 'content': 'Plan documentation'}, answer], 'tools': [],
            'meta': {'role': 'planner', 'provenance': {'reviewed': True, 'executed': True}}}


class ColabTests(unittest.TestCase):
    def test_budget_requires_actual_rate_and_reserves_setup(self):
        for rate in (0, -1, float('nan')):
            with self.assertRaises(ValueError):
                Budget(rate)
        budget = Budget(10, credits=200, already_used=30, reserve=20)
        self.assertEqual(budget.training_seconds(3600), 14 * 3600)
        self.assertFalse(budget.should_stop(3600))
        self.assertTrue(budget.should_stop(15 * 3600))
        self.assertEqual(budget.used_credits(3600), 40)
        self.assertEqual(budget.training_seconds(30 * 3600), 0)
        with self.assertRaises(ValueError):
            Budget(10, credits=201)

    def test_planner_only_real_review_schema_and_reasoning(self):
        self.assertEqual(planner_gate([row(), row(), row(), row(False)])['reasoning_fraction'], .75)
        with self.assertRaises(ValueError):
            planner_gate([])
        with self.assertRaises(ValueError):
            planner_gate([row(False)])
        bad = row(); bad['meta']['provenance']['reviewed'] = False
        with self.assertRaises(ValueError):
            planner_gate([bad])
        bad = row(); bad['messages'][-1]['content'] = '{"steps":[]}'
        with self.assertRaises(ValueError):
            planner_gate([bad])
        bad = row(); bad['meta']['role'] = 'executor'
        with self.assertRaises(ValueError):
            planner_gate([bad])

    def test_resume_manifest_refuses_dataset_or_config_change(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'run.json'
            save_run_manifest(path, {'model': 'Qwen/Qwen3.5-9B', 'dataset_sha256': 'a'})
            save_run_manifest(path, {'model': 'Qwen/Qwen3.5-9B', 'dataset_sha256': 'a'}, resume=True)
            with self.assertRaises(ValueError):
                save_run_manifest(path, {'model': 'Qwen/Qwen3.5-9B', 'dataset_sha256': 'b'}, resume=True)
            with self.assertRaises(ValueError):
                save_run_manifest(path, {'model': 'other'}, resume=False)

    def test_training_configuration_is_9b_bf16_pilot(self):
        config = sft_kwargs('/tmp/checkpoints', max_steps=20, max_length=2048)
        self.assertTrue(config['bf16'])
        self.assertFalse(config['fp16'])
        self.assertEqual(config['gradient_accumulation_steps'], 8)
        self.assertEqual(config['max_steps'], 20)
        self.assertFalse(config['push_to_hub'])
        self.assertEqual(config['report_to'], 'none')

    def test_notebook_plain_python_and_embedded_helper_match(self):
        path = ROOT / 'colab/Qwen35_9B_Planner_Colab.ipynb'
        notebook = json.loads(path.read_text())
        for index, cell in enumerate(notebook['cells']):
            if cell['cell_type'] == 'code':
                compile(''.join(cell['source']), f'cell-{index}', 'exec')
                self.assertFalse(cell['outputs'])
        sources = [''.join(cell['source']) for cell in notebook['cells']]
        self.assertIn((ROOT / 'colab/config.py').read_text(), sources)
        self.assertTrue(any('Qwen/Qwen3.5-9B' in source for source in sources))
        self.assertTrue(any('load_in_4bit=False' in source for source in sources))


if __name__ == '__main__':
    unittest.main()
