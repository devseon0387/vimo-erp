"""Bind this operator to a fresh, read-only CT112 snapshot. Never uploads files.

Default is a plan. --capture sends Python definitions over stdin for read-only
inspection; no remote files, services, settings, or deployment state are written.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import subprocess
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
TASK = HERE.parent
TRANSPORT = TASK.parent / 'viwork-single-address-2026-10-27/deploy/sff.sh'
spec = importlib.util.spec_from_file_location('box_deployment_operator', HERE / 'box_release_operator.py')
op = importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)


def main(capture=False):
    if not capture:
        print(json.dumps({'dryRun': True, 'readOnly': True, 'ct': 112,
                          'transport': str(TRANSPORT), 'uploads': False, 'remoteWrites': False,
                          'outputs': ['intent.json', 'observed-final.json']}, sort_keys=True))
        return
    for name in ('intent.json', 'observed-final.json'):
        op.require(not (HERE / name).exists(), 'Immutable capture already exists: ' + name)
    metadata = TASK / 'linux-backend/result'
    names = ('manifest.json', 'checks.json', 'artifact.json', 'build-complete.json')
    inputs = {name: op.sha(metadata / name) for name in names}
    manifest = op.read_json(metadata / 'manifest.json')
    artifact = op.read_json(metadata / 'artifact.json')
    op.validate_manifest(manifest)
    op.require(artifact['manifestSha256'] == inputs['manifest.json'] and artifact['checksSha256'] == inputs['checks.json'],
               'Local build result bindings differ')
    source = (HERE / 'box_release_operator.py').read_text()
    remote = '''import sys, json, hashlib
sys.dont_write_bytecode = True
scope = {'__name__': 'read_only_box_snapshot', '__file__': '/opt/viwork-box-performance-20261028/backend-deploy-r1/box_release_operator.py'}
exec(compile(__OPERATOR_SOURCE_LITERAL__, scope['__file__'], 'exec'), scope)
Paths, sha, require = scope['Paths'], scope['sha'], scope['require']
paths = Paths()
inputs = __BUILD_INPUTS_LITERAL__
for name, value in inputs.items():
    require(sha(paths.artifact / name) == value, 'Remote build receipt differs: ' + name)
manifest = scope['read_json'](paths.artifact / 'manifest.json')
artifact = scope['read_json'](paths.artifact / 'artifact.json')
scope['validate_manifest'](manifest)
require(sha(paths.artifact / 'artifact.tar.gz') == artifact['archiveSha256'], 'Remote archive differs')
for name, value in manifest['toolHashes'].items():
    scope['safe_name'](name)
    require(sha(paths.artifact / name) == value, 'Remote verified build tool differs')
helper = scope['load_helper'](paths)
before = scope['snapshot'](paths, helper, scope['Runtime']())
require(before['beta']['sourceDigest'] == scope['digest'](manifest['baselineHashes']), 'Current Beta source baseline differs')
require(before['beta']['buildId'] == scope['BASELINE_BUILD'], 'Current Beta build baseline differs')
new_reference = paths.artifact / 'candidate/.next/server/server-reference-manifest.json'
require(sha(new_reference) == artifact['files']['.next/server/server-reference-manifest.json'], 'Candidate action metadata differs')
old = scope['read_json'](paths.live / '.next/server/server-reference-manifest.json')['node']
new = scope['read_json'](new_reference)['node']
rendered, actions = scope['render_actions'](paths.caddy.read_bytes().decode(), old, new)
after = scope['snapshot'](paths, helper, scope['Runtime']())
require(after == before, 'Read-only capture observed concurrent protected-state drift')
print(json.dumps({'observed': before, 'actions': actions,
    'caddyAfterSha256': hashlib.sha256(rendered.encode()).hexdigest(),
    'candidateNextDigest': scope['candidate_next_digest'](artifact, paths.live / '.next/static'),
    'archiveSha256': artifact['archiveSha256'], 'readOnly': True, 'remoteWrites': False}, sort_keys=True))
'''.replace('__OPERATOR_SOURCE_LITERAL__', repr(source)).replace('__BUILD_INPUTS_LITERAL__', repr(inputs))
    compile(remote, '<read-only-capture>', 'exec')
    process = subprocess.run([str(TRANSPORT), 'pct exec 112 -- python3 -'], input=remote.encode(),
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
    op.require(process.returncode == 0, 'Read-only CT112 capture failed: ' + process.stderr.decode()[-1200:])
    captured = json.loads(process.stdout)
    op.require(captured['archiveSha256'] == artifact['archiveSha256'], 'Captured archive differs from local build result')
    created = datetime.now(timezone.utc).isoformat()
    intent = {'schemaVersion': 1, 'createdAt': created, 'project': 'vibox', 'release': op.RELEASE,
              'pins': op.Paths().pins(), 'operatorSha256': op.sha(HERE / 'box_release_operator.py'),
              'helperSha256': op.HELPER_SHA, 'inputs': inputs,
              **{name: captured[name] for name in ('archiveSha256', 'observed', 'actions', 'caddyAfterSha256', 'candidateNextDigest')},
              'authority': 'Current Vibox AGENTS Beta approval; parent operator executes after independent review.',
              'scope': {'sourceChanges': sorted(op.CHANGED), 'betaOnly': True, 'envChanges': False,
                        'dependencyChanges': False, 'storageWrites': False, 'cleanup': False}}
    op.save(HERE / 'observed-final.json', {'createdAt': created, **captured}, exclusive=True)
    op.save(HERE / 'intent.json', intent, exclusive=True)
    print(json.dumps({'status': 'READ_ONLY_INTENT_CAPTURED', 'intentSha256': op.sha(HERE / 'intent.json'),
                      'operatorSha256': intent['operatorSha256'], 'baselineBuild': captured['observed']['beta']['buildId'],
                      'candidateBuild': op.CANDIDATE_BUILD, 'sourceCount': captured['observed']['beta']['sourceCount'],
                      'remoteWrites': False, 'uploads': False}, sort_keys=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', action='store_true', help='Read-only remote inspection; immutable local intent output')
    args = parser.parse_args()
    main(args.capture)
