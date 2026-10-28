"""Local filesystem/command fakes; never contact a host or run systemctl."""
from pathlib import Path
from contextlib import redirect_stdout
import copy
import importlib.util
import io
import json
import os
import shutil
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('box_perf_operator', HERE / 'box_release_operator.py')
op = importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)
HELPER = HERE.parent / 'linux-backend/build-tools/release_common.py'
OLD_IDS = ('0' * 40, '6' * 40)
NEW_IDS = ('1' * 40, '7' * 40)


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value)


def refs(ids):
    return {'node': {ident: {'filename': name[0], 'exportedName': name[1]}
                     for ident, name in zip(ids, sorted(op.ACTION_NAMES))}}


class FakeRuntime:
    def __init__(self):
        self.actions = []
        self.pid = 100
        self.active = True
        self.health_failures = 0
        self.configs = {name: op.digest(name) for name in op.UNITS}

    def unit(self, name):
        pid = self.pid if name == op.BETA_UNIT else 200
        active = self.active if name == op.BETA_UNIT else True
        return {'state': f'MainPID={pid}\nExecMainStartTimestampMonotonic={pid}\nActiveState=' + ('active' if active else 'inactive'),
                'configSha256': self.configs[name]}

    def command(self, args):
        if args[-1] == '--property=WorkingDirectory':
            return 'WorkingDirectory=/opt/vibox-beta'
        if args[-1] == '--property=ReadOnlyPaths':
            return 'ReadOnlyPaths=/opt/vibox-storage'
        if args[0] == '/usr/bin/ss':
            return f'LISTEN 0 511 127.0.0.1:4201 0.0.0.0:* users:(("next",pid={self.pid},fd=21))'
        raise AssertionError('Unexpected command: ' + repr(args))

    def mutate_service(self, action, unit):
        if unit != op.BETA_UNIT and (unit, action) != ('caddy.service', 'reload'):
            raise AssertionError('Forbidden service mutation')
        self.actions.append((action, unit))
        if unit == op.BETA_UNIT:
            self.active = action == 'start'
            if self.active:
                self.pid += 1

    def wait_health(self):
        if self.health_failures:
            self.health_failures -= 1
            raise RuntimeError('Synthetic readiness failure')

    def direct_boundaries(self):
        return {'directHealth': 200, 'directGateway': 401, 'directFilesWrite': 401,
                'root': {'status': 307, 'csp': True, 'locationPath': '/box/login'},
                'sso': {'status': 303, 'cookiePaths': ['/box'], 'locationPath': '/api/sso/authorize'}}

    def boundaries(self):
        return {**self.direct_boundaries(), 'filesWrite': 403}

    def validate_caddy(self, paths, pending, label):
        self.actions.append(('validate-' + label, 'staged-caddy'))
        if not pending.is_file():
            raise AssertionError('No staged Caddy')


class Fixture:
    def __init__(self, root):
        self.paths = p = op.Paths(root)
        self.runtime = FakeRuntime()
        for path in (p.operator, p.artifact, p.live, p.main):
            path.mkdir(parents=True)
        shutil.copy2(HERE / 'box_release_operator.py', p.operator / 'box_release_operator.py')
        p.helper.parent.mkdir(parents=True)
        shutil.copy2(HELPER, p.helper)
        put(p.artifact / 'linux-build.py', '# fake verified build tool\n')
        for name in sorted(op.CHANGED):
            put(p.live / name, 'baseline ' + name + '\n')
        put(p.live / '.next/BUILD_ID', op.BASELINE_BUILD + '\n')
        put(p.live / '.next/server/server-reference-manifest.json', json.dumps(refs(OLD_IDS)))
        put(p.live / '.next/static/legacy.js', 'legacy chunk')
        put(p.main / 'README.md', 'protected dirty main source')
        put(p.main / '.next/BUILD_ID', 'protected-main-build\n')
        for root_path in (p.live, p.main):
            put(root_path / 'node_modules/next/package.json', '{"version":"16.3.5"}')
            put(root_path / '.env.local', 'VIBOX_BETA_READ_ONLY=1\nVIBOX_RELEASE_CHANNEL=beta\nPRIVATE_TEST_SECRET=dummy\n')
            os.chmod(root_path / '.env.local', 0o600)
        put(p.live / '.env.local.new.preserved', '')
        put(p.caddy, '# preserve ' + OLD_IDS[0] + '\nheader Next-Action ' + OLD_IDS[0] + '\n' +
            'header Next-Action ' + OLD_IDS[1] + '\n# keep all route/write/Stream bytes\n')
        put(p.caddy_main, 'import /etc/caddy/vibox-beta.caddy\n')
        put(p.caddy_env, 'CF_API_TOKEN=dummy-test-token\n')
        put(p.files_key, 'dummy-test-key')
        self.helper = op.load_helper(p)
        baseline = self.helper.source_hashes(p.live)
        source = {name: op.hashlib.sha256(('candidate ' + name + '\n').encode()).hexdigest()
                  for name in sorted(op.CHANGED)}
        tools = {name: op.sha(p.artifact / name) for name in ('linux-build.py', 'build-tools/release_common.py')}
        manifest = {'app': op.APP, 'target': op.TARGET, 'release': op.RELEASE,
                    'baselineBuildId': op.BASELINE_BUILD, 'baselineEnvSha256': op.sha(p.live / '.env.local'),
                    'baselineHashes': baseline, 'sourceHashes': source, 'toolHashes': tools}
        put(p.artifact / 'manifest.json', json.dumps(manifest))
        self.manifest = manifest
        checks = {'status': 'PASS', 'app': op.APP, 'target': op.TARGET, 'release': op.RELEASE,
                  'buildId': op.CANDIDATE_BUILD, 'manifestSha256': op.sha(p.artifact / 'manifest.json'),
                  'checks': [{'step': name, 'exitCode': 0} for name in ('tests', 'tsc', 'build')],
                  'toolHashes': tools,
                  'testSummary': {'failed': 0, 'files': 29, 'passed': 378, 'skipped': 0, 'tests': 378}}
        put(p.artifact / 'checks.json', json.dumps(checks))
        files = {name: ('candidate ' + name + '\n').encode() for name in sorted(op.CHANGED)}
        files.update({'.next/BUILD_ID': (op.CANDIDATE_BUILD + '\n').encode(),
                      '.next/server/server-reference-manifest.json': json.dumps(refs(NEW_IDS)).encode(),
                      '.next/static/new.js': b'new chunk'})
        with tarfile.open(p.artifact / 'artifact.tar.gz', 'w:gz') as archive:
            for name, data in files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mode = 0o644
                archive.addfile(entry, io.BytesIO(data))
        artifact = {'app': op.APP, 'release': op.RELEASE, 'buildId': op.CANDIDATE_BUILD,
                    'manifestSha256': op.sha(p.artifact / 'manifest.json'),
                    'checksSha256': op.sha(p.artifact / 'checks.json'),
                    'archiveSha256': op.sha(p.artifact / 'artifact.tar.gz'),
                    'bytes': sum(len(data) for data in files.values()),
                    'files': {name: op.hashlib.sha256(data).hexdigest() for name, data in files.items()}}
        put(p.artifact / 'artifact.json', json.dumps(artifact))
        complete = {'status': 'BACKEND_BUILD_SMOKE_AND_PACKAGE_PASS', 'app': op.APP,
                    'target': op.TARGET, 'release': op.RELEASE,
                    'liveProtectionUnchanged': True, 'activatesServices': False,
                    'manifestSha256': op.sha(p.artifact / 'manifest.json'),
                    'checksSha256': op.sha(p.artifact / 'checks.json'),
                    'artifactSha256': op.sha(p.artifact / 'artifact.json'),
                    'archiveSha256': artifact['archiveSha256']}
        put(p.artifact / 'build-complete.json', json.dumps(complete))
        self.intent = {'schemaVersion': 1, 'release': op.RELEASE, 'pins': p.pins(),
                       'operatorSha256': op.sha(p.operator / 'box_release_operator.py'), 'helperSha256': op.HELPER_SHA,
                       'archiveSha256': artifact['archiveSha256'],
                       'inputs': {name: op.sha(p.artifact / name) for name in
                                  ('manifest.json', 'checks.json', 'artifact.json', 'build-complete.json')},
                       'observed': op.snapshot(p, self.helper, self.runtime)}
        rendered, actions = op.render_actions(p.caddy.read_text(), refs(OLD_IDS)['node'], refs(NEW_IDS)['node'])
        self.intent.update(caddyAfterSha256=op.hashlib.sha256(rendered.encode()).hexdigest(), actions=actions,
                           candidateNextDigest=op.candidate_next_digest(artifact, p.live / '.next/static'))
        put(p.operator / 'intent.json', json.dumps(self.intent))
        self.deployment = op.Deployment(p, self.intent, self.helper, self.runtime)


class OperatorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='box-deploy-test-')
        self.addCleanup(self.temporary.cleanup)
        self.scope = patch.object(op, 'SOURCE_COUNT', len(op.CHANGED))
        self.scope.start()
        self.addCleanup(self.scope.stop)
        self.space = patch.object(op.shutil, 'disk_usage', return_value=SimpleNamespace(free=100 * 2**30))
        self.space.start()
        self.addCleanup(self.space.stop)
        self.fixture = f = Fixture(self.temporary.name)
        self.paths, self.runtime, self.deployment = f.paths, f.runtime, f.deployment

    def test_prepare_is_reversible_and_does_not_mutate_live_or_services(self):
        before = self.deployment.capture()
        prepared = self.deployment.prepare()
        self.assertEqual(self.deployment.capture(), before)
        self.assertEqual(prepared['status'], 'PREPARED')
        self.assertEqual(self.runtime.actions, [('validate-prepare', 'staged-caddy')])
        self.assertEqual((self.paths.operator / 'release/.next/static/legacy.js').read_text(), 'legacy chunk')
        self.assertNotEqual((self.paths.operator / 'release/.next/static/legacy.js').stat().st_ino,
                            (self.paths.live / '.next/static/legacy.js').stat().st_ino)
        for name in op.CHANGED:
            self.assertEqual(op.sha(self.paths.operator / 'backup/source' / name), self.fixture.manifest['baselineHashes'][name])

    def test_real_package_expanded_bytes_schema_is_accepted(self):
        artifact = op.read_json(self.paths.artifact / 'artifact.json')
        with tarfile.open(self.paths.artifact / 'artifact.tar.gz', 'r:gz') as archive:
            expanded = sum(item.size for item in archive.getmembers())
        self.assertEqual(artifact['bytes'], expanded)
        self.assertNotEqual(artifact['bytes'], (self.paths.artifact / 'artifact.tar.gz').stat().st_size)
        self.assertEqual(self.deployment.prepare()['status'], 'PREPARED')

    def test_incorrect_expanded_bytes_are_rejected_before_extraction(self):
        artifact = op.read_json(self.paths.artifact / 'artifact.json')
        artifact['bytes'] += 1
        with self.assertRaisesRegex(RuntimeError, 'Expanded artifact size differs'):
            op.extract(self.paths, artifact)
        self.assertFalse((self.paths.operator / 'release').exists())
        self.assertEqual(self.runtime.actions, [])

    def test_activate_and_manual_rollback_preserve_main_env_deps_old_static(self):
        before = self.deployment.capture()
        self.deployment.prepare()
        active = self.deployment.activate()
        self.assertEqual(active['status'], 'ACTIVE')
        self.assertEqual(active['after']['beta']['buildId'], op.CANDIDATE_BUILD)
        self.assertEqual(active['after']['main'], before['main'])
        self.assertEqual(active['after']['beta']['envs'], before['beta']['envs'])
        self.assertEqual(active['after']['beta']['dependenciesDigest'], before['beta']['dependenciesDigest'])
        self.assertEqual((self.paths.live / '.next/static/legacy.js').read_text(), 'legacy chunk')
        # Recovery consumes the verified backups, so a missing new archive cannot block it.
        (self.paths.artifact / 'artifact.tar.gz').unlink()
        restored = self.deployment.rollback()
        self.assertEqual(restored['status'], 'ROLLED_BACK')
        self.assertEqual(restored['rollbackAfter']['beta'], before['beta'])
        self.assertTrue((self.paths.operator / 'failed.next').is_dir())
        self.assertEqual(self.deployment.rollback()['status'], 'ROLLED_BACK')
        self.assertTrue(all(unit in (op.BETA_UNIT, 'caddy.service', 'staged-caddy') for _, unit in self.runtime.actions))

    def test_readiness_failure_automatically_restores_and_keeps_receipt(self):
        before = self.deployment.capture()
        self.deployment.prepare()
        self.runtime.health_failures = 1
        with self.assertRaisesRegex(RuntimeError, 'previous Beta'):
            self.deployment.activate()
        state = op.read_json(self.paths.operator / 'activation.json')
        self.assertEqual(state['status'], 'ROLLED_BACK')
        self.assertIn('activation-failed', state['events'])
        self.assertIn('rollback-started', state['events'])
        self.assertEqual(state['rollbackAfter']['beta'], before['beta'])
        self.assertTrue((self.paths.operator / 'failed.next').is_dir())

    def test_failure_between_next_renames_restores_old_build(self):
        self.deployment.prepare()
        original = op.os.replace
        failed = False
        def fail_new_next(source, destination):
            nonlocal failed
            if Path(source) == self.paths.operator / 'release/.next' and not failed:
                failed = True
                raise OSError('Synthetic atomic rename failure')
            return original(source, destination)
        with patch.object(op.os, 'replace', side_effect=fail_new_next):
            with self.assertRaisesRegex(RuntimeError, 'previous Beta'):
                self.deployment.activate()
        self.assertEqual((self.paths.live / '.next/BUILD_ID').read_text().strip(), op.BASELINE_BUILD)
        self.assertEqual(op.read_json(self.paths.operator / 'activation.json')['status'], 'ROLLED_BACK')
        self.assertTrue((self.paths.operator / 'release/.next').exists())

    def test_wrong_live_baseline_fails_before_staging_or_stop(self):
        put(self.paths.live / next(iter(op.CHANGED)), 'unexpected concurrent source')
        with self.assertRaisesRegex(RuntimeError, 'Beta source/build'):
            self.deployment.prepare()
        self.assertFalse((self.paths.operator / 'prepare-state.json').exists())
        self.assertEqual(self.runtime.actions, [])

    def test_missing_artifact_fails_before_staging_or_stop(self):
        (self.paths.artifact / 'artifact.tar.gz').unlink()
        with self.assertRaisesRegex(RuntimeError, 'Required path missing'):
            self.deployment.prepare()
        self.assertEqual(self.runtime.actions, [])

    def test_wrong_target_and_operator_hash_are_rejected(self):
        intent = copy.deepcopy(self.fixture.intent)
        intent['pins']['live'] = '/opt/vibox'
        with self.assertRaisesRegex(RuntimeError, 'target pins'):
            op.bindings(self.paths, intent)
        put(self.paths.operator / 'box_release_operator.py', '# changed tool')
        with self.assertRaisesRegex(RuntimeError, 'Operator/intent'):
            self.deployment.prepare()

    def test_env_and_unrelated_unit_drift_block_activation_before_stop(self):
        self.deployment.prepare()
        self.runtime.configs['vibox.service'] = op.digest('different unit')
        with self.assertRaisesRegex(RuntimeError, 'Service config'):
            self.deployment.activate()
        self.runtime.configs['vibox.service'] = op.digest('vibox.service')
        put(self.paths.live / '.env.local.new.preserved', 'concurrent environment change')
        with self.assertRaisesRegex(RuntimeError, 'Beta protected envs'):
            self.deployment.activate()
        self.assertNotIn(('stop', op.BETA_UNIT), self.runtime.actions)

    def test_main_drift_is_preserved_and_reported_after_beta_rollback(self):
        self.deployment.prepare()
        self.deployment.activate()
        self.runtime.actions = []
        put(self.paths.main / 'README.md', 'changed by another operator')
        result = self.deployment.rollback()
        self.assertEqual(result['status'], 'ROLLED_BACK_WITH_FINDINGS')
        self.assertIn('UNRELATED_MAIN_FILES_DRIFT', result['rollbackFindings'])
        self.assertEqual((self.paths.main / 'README.md').read_text(), 'changed by another operator')
        self.assertEqual(result['rollbackAfter']['beta']['buildId'], op.BASELINE_BUILD)

    def test_foreign_caddy_is_preserved_while_beta_is_restored(self):
        self.deployment.prepare()
        self.deployment.activate()
        self.runtime.actions = []
        put(self.paths.caddy, '# foreign operator config\n')
        result = self.deployment.rollback()
        self.assertEqual(result['status'], 'ROLLED_BACK_WITH_FINDINGS')
        self.assertIn('FOREIGN_CADDY_PRESERVED', result['rollbackFindings'])
        self.assertEqual(self.paths.caddy.read_text(), '# foreign operator config\n')
        self.assertNotIn(('reload', 'caddy.service'), self.runtime.actions)
        self.assertEqual(result['rollbackAfter']['beta']['buildId'], op.BASELINE_BUILD)

    def test_caddy_change_during_activation_is_not_overwritten(self):
        self.deployment.prepare()
        original = self.runtime.mutate_service
        changed = False
        def concurrent_caddy_change(action, unit):
            nonlocal changed
            original(action, unit)
            if (action, unit) == ('stop', op.BETA_UNIT) and not changed:
                changed = True
                put(self.paths.caddy, '# foreign Caddy during stop\n')
        self.runtime.mutate_service = concurrent_caddy_change
        with self.assertRaisesRegex(RuntimeError, 'previous Beta'):
            self.deployment.activate()
        state = op.read_json(self.paths.operator / 'activation.json')
        self.assertEqual(state['status'], 'ROLLED_BACK_WITH_FINDINGS')
        self.assertIn('FOREIGN_CADDY_PRESERVED', state['rollbackFindings'])
        self.assertEqual(self.paths.caddy.read_text(), '# foreign Caddy during stop\n')
        self.assertEqual(state['rollbackAfter']['beta']['buildId'], op.BASELINE_BUILD)
        self.assertTrue(self.runtime.active)
        self.assertNotIn(('reload', 'caddy.service'), self.runtime.actions)

    def test_foreign_live_build_rejects_rollback_before_stopping_beta(self):
        self.deployment.prepare()
        self.deployment.activate()
        put(self.paths.live / '.next/static/new.js', 'foreign build bytes')
        self.runtime.actions = []
        with self.assertRaisesRegex(RuntimeError, 'Live build changed outside release'):
            self.deployment.rollback()
        self.assertEqual(self.runtime.actions, [])
        self.assertTrue(self.runtime.active)
        self.assertEqual((self.paths.live / '.next/static/new.js').read_text(), 'foreign build bytes')

    def test_occupied_failed_next_rejects_rollback_before_stopping_beta(self):
        self.deployment.prepare()
        self.deployment.activate()
        put(self.paths.operator / 'failed.next/foreign.txt', 'foreign retained artifact')
        self.runtime.actions = []
        with self.assertRaisesRegex(RuntimeError, 'already retained'):
            self.deployment.rollback()
        self.assertEqual(self.runtime.actions, [])
        self.assertTrue(self.runtime.active)

    def test_broken_failed_next_symlink_rejects_rollback_before_stopping_beta(self):
        self.deployment.prepare()
        self.deployment.activate()
        (self.paths.operator / 'failed.next').symlink_to(self.paths.operator / 'missing-target', target_is_directory=True)
        self.runtime.actions = []
        with self.assertRaisesRegex(RuntimeError, 'Symlink path rejected'):
            self.deployment.rollback()
        self.assertEqual(self.runtime.actions, [])
        self.assertTrue(self.runtime.active)

    def test_unrelated_unit_drift_does_not_block_own_beta_recovery(self):
        self.deployment.prepare()
        self.deployment.activate()
        self.runtime.configs['vibox.service'] = op.digest('new main configuration')
        result = self.deployment.rollback()
        self.assertEqual(result['status'], 'ROLLED_BACK_WITH_FINDINGS')
        self.assertIn('UNRELATED_UNIT_DRIFT:vibox.service', result['rollbackFindings'])
        self.assertEqual(result['rollbackAfter']['beta']['buildId'], op.BASELINE_BUILD)

    def test_failed_automatic_rollback_keeps_the_latest_partial_events(self):
        self.deployment.prepare()
        self.runtime.health_failures = 2
        with self.assertRaisesRegex(RuntimeError, 'Activation and rollback failed'):
            self.deployment.activate()
        state = op.read_json(self.paths.operator / 'activation.json')
        self.assertEqual(state['status'], 'ROLLBACK_FAILED')
        self.assertIn('rollback-started', state['events'])
        self.assertIn('old-next-restored', state['events'])
        self.assertIn('automatic-rollback-failed', state['events'])
        self.assertEqual((self.paths.live / '.next/BUILD_ID').read_text().strip(), op.BASELINE_BUILD)

    def test_pending_build_and_caddy_drift_block_activation(self):
        self.deployment.prepare()
        put(self.paths.operator / 'release/.next/static/new.js', 'unexpected staged modification')
        with self.assertRaisesRegex(RuntimeError, 'Staged build drift'):
            self.deployment.activate()
        put(self.paths.operator / 'caddy.pending', '# replaced config')
        with self.assertRaisesRegex(RuntimeError, 'Pending Caddy drift'):
            self.deployment.activate()
        self.assertNotIn(('stop', op.BETA_UNIT), self.runtime.actions)

    def test_immutable_preparation_cannot_overwrite_receipts(self):
        self.deployment.prepare()
        with self.assertRaisesRegex(RuntimeError, 'already attempted'):
            self.deployment.prepare()

    def test_symlink_parent_is_rejected_even_for_a_missing_target(self):
        actual = Path(self.temporary.name) / 'real'
        actual.mkdir()
        alias = Path(self.temporary.name) / 'alias'
        alias.symlink_to(actual, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'Symlink path'):
            op.no_links(alias / 'missing', missing=True)

    def test_tar_traversal_symlinks_and_duplicates_fail_before_extraction(self):
        for kind, name in (('regular', '../outside'), ('symlink', '.next/link'), ('duplicate', '.next/BUILD_ID')):
            with self.subTest(kind=kind):
                archive_path = self.paths.artifact / 'artifact.tar.gz'
                with tarfile.open(archive_path, 'w:gz') as archive:
                    item = tarfile.TarInfo(name)
                    if kind == 'symlink':
                        item.type = tarfile.SYMTYPE
                        item.linkname = '/etc/passwd'
                    archive.addfile(item, io.BytesIO(b''))
                    if kind == 'duplicate':
                        archive.addfile(item, io.BytesIO(b''))
                with self.assertRaises(RuntimeError):
                    op.extract(self.paths, {'files': {name: op.hashlib.sha256(b'').hexdigest()}})
                self.assertFalse((self.paths.operator / 'release').exists())
                self.assertFalse((self.paths.operator / 'outside').exists())

    def test_static_collision_rejects_different_bytes_without_modifying_live(self):
        old = Path(self.temporary.name) / 'old-static'
        new = Path(self.temporary.name) / 'new-static'
        put(old / 'same.js', 'old bytes')
        put(new / 'same.js', 'different bytes')
        with self.assertRaisesRegex(RuntimeError, 'Static URL collision'):
            op.retain_static(old, new)
        self.assertEqual((old / 'same.js').read_text(), 'old bytes')

    def test_action_render_changes_only_two_header_values(self):
        original = self.paths.caddy.read_text()
        rendered, mapping = op.render_actions(original, refs(OLD_IDS)['node'], refs(NEW_IDS)['node'])
        expected = original
        for old, new in zip(OLD_IDS, NEW_IDS):
            expected = expected.replace('header Next-Action ' + old, 'header Next-Action ' + new)
        self.assertEqual(rendered, expected)
        self.assertIn('# preserve ' + OLD_IDS[0], rendered)
        self.assertEqual(len(mapping), 2)
        broken = refs(NEW_IDS)['node']
        broken['9' * 40] = dict(next(iter(broken.values())))
        with self.assertRaisesRegex(RuntimeError, 'unique'):
            op.render_actions(original, refs(OLD_IDS)['node'], broken)

    def test_default_and_action_without_execute_are_dry_runs(self):
        for args in ([], ['activate'], ['rollback']):
            with self.subTest(args=args), redirect_stdout(io.StringIO()) as output:
                op.main(args)
            self.assertTrue(json.loads(output.getvalue())['dryRun'])
        self.assertEqual(self.runtime.actions, [])

    def test_service_api_rejects_main_stop_and_caddy_restart(self):
        runtime = op.Runtime()
        for action, unit in (('stop', 'vibox.service'), ('restart', op.BETA_UNIT), ('restart', 'caddy.service')):
            with self.subTest(action=action, unit=unit), self.assertRaisesRegex(RuntimeError, 'outside Beta policy'):
                runtime.mutate_service(action, unit)


if __name__ == '__main__':
    unittest.main()
