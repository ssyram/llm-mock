#!/usr/bin/env python3
"""新 lane 挂载缓存回归：经真实 mount 入口（adapter/new_reply.py）顺序重放 r128b
归档 Main 会话前缀——默认（lane 私有前缀 continuation 缓存）逐决策与真实回显一致、
每请求恰一次外接 segment 执行；完全重复请求由缓存直接重放（零次 segment 执行）；
冷缓存（PLAYBOOK2_CACHE=0）决策与暖缓存同真；暖缓存上伪造回显（篡改回显工具
参数）仍被既有重放核对拒绝。

通过 CCA_MOCK_CACHE_TEST_ARCHIVE 传入只读原生归档目录。未指定时跳过。
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
DOMAIN = Path(__file__).resolve().parents[1]
PREFIX = 8


def load_requests(db_path, root_session):
    db = sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True)
    rows = db.execute(
        'SELECT m.id, m.data, p.data FROM message m JOIN part p ON p.message_id=m.id '
        "WHERE m.session_id=? ORDER BY m.time_created, p.time_created, p.id",
        (root_session,)).fetchall()
    db.close()
    messages = []
    for mid, md, pd in rows:
        message, part = json.loads(md), json.loads(pd)
        if not messages or messages[-1]['id'] != mid:
            messages.append({'id': mid, 'data': message, 'parts': []})
        messages[-1]['parts'].append(part)
    unified = []
    for message in messages:
        data, parts = message['data'], message['parts']
        if data['role'] == 'user':
            text = '\n'.join(p['text'] for p in parts if p.get('type') == 'text')
            if text:
                unified.append({'role': 'user', 'content': text})
        elif data['role'] == 'assistant':
            calls = [p for p in parts if p.get('type') == 'tool'
                     and p.get('state', {}).get('status') == 'completed']
            text = '\n'.join(p['text'] for p in parts if p.get('type') == 'text')
            if calls:
                unified.append({'role': 'assistant', 'content': [
                    {'type': 'toolCall', 'id': p['callID'], 'name': p['tool'],
                     'arguments': p['state'].get('input') or {}} for p in calls]})
                for part in calls:
                    unified.append({'role': 'toolResult', 'toolCallId': part['callID'],
                                    'toolName': part['tool'],
                                    'content': [{'type': 'text', 'text': part['state'].get('output') or ''}]})
            elif text:
                unified.append({'role': 'assistant', 'content': [{'type': 'text', 'text': text}]})
    system = {'role': 'system', 'content': 'regression system head (synthesized)',
              'toolsAdded': [{'name': name} for name in
                             ('agent', 'bash', 'fsm_enter_fsm', 'fsm_exit_fsm', 'fsm_fsm_get_state',
                              'fsm_fsm_submit_self_check', 'fsm_fsm_try_transition', 'write')]}
    requests, expected = [], []
    for index, message in enumerate(unified):
        if message['role'] != 'assistant':
            continue
        requests.append({'api': 'openai-completions', 'model': 'bench-model', 'request': {
            'options': {'sessionId': root_session},
            'context': {'messages': [dict(system)] + unified[:index]}}})
        expected.append(message)
        if len(requests) == PREFIX:
            break
    return requests, expected


class MountCacheTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.environ.get('CCA_MOCK_CACHE_TEST_ARCHIVE'):
            raise unittest.SkipTest('set CCA_MOCK_CACHE_TEST_ARCHIVE to a native lane archive')
        cls.archive = Path(os.environ['CCA_MOCK_CACHE_TEST_ARCHIVE']).resolve()
        ready = json.loads((cls.archive / 'ready.json').read_text(encoding='utf-8'))
        cls.root_session = ready['session']
        cls.requests, cls.expected = load_requests(
            cls.archive / 'xdg/data/opencode/opencode.db', cls.root_session)
        if len(cls.requests) != PREFIX:
            raise ValueError(f'archive must supply at least {PREFIX} Main responses')
        cls.base_env = dict(os.environ, CCA_NEW_ROOT_SESSION=cls.root_session,
                            CCA_NEW_WORKSPACE=str(cls.archive / 'w'), PYTHONDONTWRITEBYTECODE='1')
        cls.base_env.pop('CCA_NEW_TAPE', None)
        cls.base_env.pop('PLAYBOOK2_CACHE', None)

    def seed_lane(self, root):
        root.mkdir(parents=True)
        for name in ('input-spec.json', 'entries.json', 'setup.json'):
            shutil.copyfile(self.archive / name, root / name)
        (root / 'records').mkdir()
        source = self.archive / 'records/phase-entry-eqclass.json'
        if source.is_file():
            shutil.copyfile(source, root / 'records/phase-entry-eqclass.json')
        (root / 'fsm-slots').mkdir()
        return root

    def ask(self, lane, payload, extra_env=None):
        env = dict(self.base_env, CCA_NEW_LANE=str(lane))
        if extra_env:
            env.update(extra_env)
        run = subprocess.run([sys.executable, str(DOMAIN / 'adapter/new_reply.py')],
                             input=json.dumps(payload).encode(), capture_output=True,
                             env=env, timeout=300)
        try:
            return json.loads(run.stdout), run
        except ValueError:
            self.fail(f'mount returned non-JSON: {run.stdout[-200:]!r} stderr={run.stderr[-300:]!r}')

    def test_warm_replay_matches_echoes_with_one_segment_per_request(self):
        with tempfile.TemporaryDirectory(prefix='pb2-mount-cache-') as tmp:
            lane = self.seed_lane(Path(tmp) / 'lane')
            for k, payload in enumerate(self.requests, 1):
                reply, _ = self.ask(lane, payload)
                self.assertIsNone(reply.get('error'), f'k={k}: {reply.get("error")}')
                self.assertEqual(reply.get('content'), self.expected[k - 1]['content'], f'k={k}')
            cache = lane / 'mock2-cache'
            self.assertTrue(cache.is_dir(), 'lane-private cache dir must exist')
            self.assertGreaterEqual(len(list(cache.glob('*.json'))), PREFIX)
            trace = [json.loads(line) for line in
                     (lane / 'records/handler-trace.jsonl').read_text(encoding='utf-8').splitlines()]
            self.assertEqual(len(trace), PREFIX,
                             'warm replay must run the external segment exactly once per request')

    def test_cold_replay_decisions_match_the_same_echoes(self):
        with tempfile.TemporaryDirectory(prefix='pb2-mount-cold-') as tmp:
            lane = self.seed_lane(Path(tmp) / 'lane')
            for k in (PREFIX - 1, PREFIX):
                reply, _ = self.ask(lane, self.requests[k - 1], {'PLAYBOOK2_CACHE': '0'})
                self.assertIsNone(reply.get('error'), f'k={k}: {reply.get("error")}')
                self.assertEqual(reply.get('content'), self.expected[k - 1]['content'], f'k={k}')

    def test_duplicate_request_replayed_from_cache_without_segment_run(self):
        with tempfile.TemporaryDirectory(prefix='pb2-mount-dup-') as tmp:
            lane = self.seed_lane(Path(tmp) / 'lane')
            for payload in self.requests:
                reply, _ = self.ask(lane, payload)
                self.assertIsNone(reply.get('error'))
            trace = lane / 'records/handler-trace.jsonl'
            rows = len(trace.read_text(encoding='utf-8').splitlines())
            reply, _ = self.ask(lane, self.requests[PREFIX - 1])
            self.assertIsNone(reply.get('error'))
            self.assertEqual(reply.get('content'), self.expected[PREFIX - 1]['content'])
            after = len(trace.read_text(encoding='utf-8').splitlines())
            self.assertEqual(after, rows,
                             'exact duplicate request must be served from cache without a segment run')

    def test_aux_gate_reads_current_verdict_for_identical_requests(self):
        with tempfile.TemporaryDirectory(prefix='pb2-mount-gate-') as tmp:
            lane = self.seed_lane(Path(tmp) / 'lane')
            payload = json.loads(json.dumps(self.requests[0]))
            system = payload['request']['context']['messages'][0]
            system['toolsAdded'] = [{'name': 'StructuredOutput'}]
            trace = lane / 'records/handler-trace.jsonl'
            for action in ('continue_work', 'allow_stop'):
                verdict = {'action': action, 'reason': 'current gate verdict'}
                trace.write_text(json.dumps({'session': self.root_session,
                                             'gate_verdict': verdict}) + '\n', encoding='utf-8')
                reply, _ = self.ask(lane, payload)
                self.assertIsNone(reply.get('error'))
                self.assertEqual(reply['content'][0]['arguments'], verdict)
            self.assertFalse((lane / 'mock2-cache').exists())

    def test_forged_echo_rejected_on_warm_cache(self):
        with tempfile.TemporaryDirectory(prefix='pb2-mount-forged-') as tmp:
            lane = self.seed_lane(Path(tmp) / 'lane')
            for payload in self.requests:
                reply, _ = self.ask(lane, payload)
                self.assertIsNone(reply.get('error'))
            forged = json.loads(json.dumps(self.requests[PREFIX - 1]))
            messages = forged['request']['context']['messages']
            for message in reversed(messages):
                if message.get('role') == 'assistant':
                    for block in message.get('content') or []:
                        if block.get('type') == 'toolCall':
                            block['arguments'] = dict(block['arguments'], forged='x')
                            break
                    break
            reply, _ = self.ask(lane, forged)
            self.assertIn(reply.get('error', {}).get('code'),
                          ('playbook_segment_drift', 'playbook_program_error'),
                          f'forged echo must be rejected, got {json.dumps(reply)[:200]}')


if __name__ == '__main__':
    unittest.main()
