"""Resolve a phase entry using the deployed product command."""
import json
import subprocess


def phase_entry(env, phase, replay=False):
    if phase in env['entries']:
        return env['entries'][phase]
    setup = json.loads((env['root'] / 'setup.json').read_text(encoding='utf-8'))
    path = env['records'] / ('phase-entry-' + phase + '.json')
    issued = path.exists()
    if replay or issued:
        # entry 是一次性交接检查，真实签发过即事实：无缓存 segment 重建会多次抵达
        # 同一 handoff 前沿；reserve 之后 Authority 恒有在途任务，completion(analysis,
        # final) 从此 blocked，重复真实执行必然自拒。
        document = json.loads(path.read_text(encoding='utf-8'))
    else:
        command = setup['entry_command'][:-1] + [phase, '--session', env['root_session']]
        result = subprocess.run(command, capture_output=True, text=True, timeout=120)
        document = json.loads(result.stdout or '{}')
        if result.returncode or 'enter_fsm' not in document:
            raise RuntimeError('entry %s failed: %s' % (phase, (result.stdout + result.stderr)[-600:]))
    expected = {'analysis': 'CCodeAnalyze-decoupled', 'eqclass': 'CCodeEqClass-decoupled'}[phase]
    if (document.get('phase') != phase or document.get('session') != env['root_session']
            or document.get('enter_fsm') != {'name': setup['names'][expected], 'vars': setup['initial_vars']}):
        raise RuntimeError('entry %s session, phase or fixed deployment identity mismatch' % phase)
    if not issued:
        record = {key: document[key] for key in ('phase', 'session', 'enter_fsm')}
        try:
            with path.open('x', encoding='utf-8') as stream:
                json.dump(record, stream, ensure_ascii=False)
        except FileExistsError:
            if json.loads(path.read_text(encoding='utf-8')) != record:
                raise RuntimeError('entry %s differs from previously issued response' % phase)
    return document
