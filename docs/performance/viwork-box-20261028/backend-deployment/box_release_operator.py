"""One verified CT112 Vibox Beta release. No remote transport or implicit mutation.

The reviewed earlier recipe supplies source/dependency hashing only. Its generic
prepare/activate/rollback entry points and historical policy bindings are unused.
"""
from pathlib import Path, PurePosixPath
import argparse
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.parse import urlsplit

APP = 'box-r8'
TARGET = 'backend-r1'
RELEASE = '20261028-box-perf-r1'
BASELINE_BUILD = 'WPoM-LMBBr3AOiI00BlfI'
CANDIDATE_BUILD = '-5ciigDEj7n9M4ZIwVSHg'
SOURCE_COUNT = 988
HELPER_SHA = 'fd78a3d3d13de78fb20bf4cc2fd88ca899a93ce4cdf9c0033ce9ea9b622d072b'
CHANGED = frozenset({
    'lib/dashboard/queries.ts', 'lib/team-boxes/access.ts', 'lib/vi-gateway/navigation.ts',
    '__tests__/dashboard-loading-queries.test.ts', '__tests__/team-box-access.test.ts',
})
UNITS = ('vibox.service', 'vibox-beta.service', 'caddy.service', 'cloudflared-vibox.service')
BETA_UNIT = 'vibox-beta.service'
ACTION_NAMES = frozenset({('app/login/actions.ts', 'logoutAction'),
                          ('app/signup/actions.ts', 'validateSignupAction')})


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def no_links(path, missing=False):
    path = Path(path)
    require(path.is_absolute(), 'Expected absolute path')
    for item in reversed((path, *path.parents)):
        require(not item.is_symlink(), 'Symlink path rejected: ' + str(item))
    require(missing or path.exists(), 'Required path missing: ' + str(path))
    return path


def sha(path):
    path = no_links(path)
    require(path.is_file(), 'Expected regular file: ' + str(path))
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def read_json(path):
    sha(path)
    return json.loads(Path(path).read_text())


def safe_name(name):
    require(isinstance(name, str) and '\\' not in name and '\x00' not in name, 'Unsafe relative path')
    path = PurePosixPath(name)
    require(name == path.as_posix() and not path.is_absolute() and bool(path.parts), 'Unsafe relative path')
    require(all(part not in ('', '.', '..') and not part.startswith('.env') for part in path.parts),
            'Unsafe relative path')
    return path


class Paths:
    def __init__(self, root='/'):
        prefix = Path(root)
        self.artifact = prefix / 'opt/viwork-box-performance-20261028/backend-r1'
        self.operator = prefix / 'opt/viwork-box-performance-20261028/backend-deploy-r1'
        self.live = prefix / 'opt/vibox-beta'
        self.main = prefix / 'opt/vibox'
        self.caddy = prefix / 'etc/caddy/vibox-beta.caddy'
        self.caddy_main = prefix / 'etc/caddy/Caddyfile'
        self.caddy_env = prefix / 'etc/caddy/cloudflare.env'
        self.files_key = prefix / 'etc/viwork-files/verify-key.pem'
        self.helper = self.artifact / 'build-tools/release_common.py'

    def pins(self):
        return {key: str(getattr(self, key)) for key in
                ('artifact', 'operator', 'live', 'main', 'caddy', 'caddy_main', 'caddy_env', 'files_key', 'helper')}


def load_helper(paths):
    require(sha(paths.helper) == HELPER_SHA, 'Reviewed source/dependency helper drift')
    spec = importlib.util.spec_from_file_location('vibox_perf_hash_helpers', paths.helper)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tree_hashes(root, exclude_cache=False):
    root = no_links(root)
    require(root.is_dir(), 'Expected directory')
    result = {}
    for folder, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            no_links(Path(folder) / name)
        if exclude_cache and Path(folder) == root:
            dirs[:] = [name for name in dirs if name != 'cache']
        for name in files:
            path = Path(folder) / name
            result[path.relative_to(root).as_posix()] = sha(path)
    return dict(sorted(result.items()))


def file_metadata(path):
    info = no_links(path).stat()
    return {'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid}


def atomic(path, data, metadata=None):
    path = no_links(path, missing=True)
    no_links(path.parent)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.perf-', dir=path.parent)
    # On failure leave the temporary file for diagnosis; never remove live data.
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data if isinstance(data, bytes) else data.encode())
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary, metadata['mode'] if metadata else 0o600)
    if metadata:
        os.chown(temporary, metadata['uid'], metadata['gid'])
    os.replace(temporary, path)


def save(path, value, exclusive=False):
    if exclusive:
        require(not Path(path).exists() and not Path(path).is_symlink(), 'Immutable receipt already exists')
    atomic(path, json.dumps(value, sort_keys=True, indent=2) + '\n')


class Runtime:
    def command(self, args, log=None, env=None):
        process = subprocess.run([str(value) for value in args], stdout=subprocess.PIPE,
                                 stderr=subprocess.STDOUT, env=env, timeout=50)
        if log:
            with Path(log).open('xb') as out:
                os.chmod(log, 0o600)
                out.write(process.stdout)
        require(process.returncode == 0, 'Command failed: ' + str(args[0]))
        return process.stdout.decode().strip()

    def unit(self, name):
        require(name in UNITS, 'Unexpected service')
        return {
            'state': self.command(['/usr/bin/systemctl', 'show', name,
                                   '--property=ActiveState,MainPID,ExecMainStartTimestampMonotonic']),
            'configSha256': hashlib.sha256(self.command(['/usr/bin/systemctl', 'cat', name]).encode()).hexdigest(),
        }

    def mutate_service(self, action, name):
        require((name == BETA_UNIT and action in ('stop', 'start')) or
                (name == 'caddy.service' and action == 'reload'), 'Service mutation outside Beta policy')
        self.command(['/usr/bin/systemctl', action, name])

    def response(self, port, path, method='GET'):
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
        try:
            connection.request(method, path, headers={'Host': 'viwork.cloud',
                               'X-Forwarded-Proto': 'https', 'Connection': 'close'})
            response = connection.getresponse()
            info = {'status': response.status,
                    'locationPath': urlsplit(response.getheader('Location') or '').path,
                    'csp': bool(response.getheader('Content-Security-Policy')),
                    'cookiePaths': re.findall(r'(?:^|;\s*)Path=([^;]+)',
                         '; '.join(value for name, value in response.getheaders() if name.lower() == 'set-cookie'), re.I)}
            response.read()
            return info
        finally:
            connection.close()

    def direct_boundaries(self):
        result = {}
        for label, port, path, method in (
            ('directHealth', 4201, '/box/api/health', 'GET'),
            ('unprefixedHealth', 4201, '/api/health', 'GET'),
            ('directGateway', 4201, '/box/api/internal/vi/v1/navigation', 'GET'),
            ('streamLookup', 4201, '/box/api/stream/lookup?path=%2Fstream-release-check.mp4', 'GET'),
            ('streamWebhook', 4201, '/box/api/stream/cloudflare/webhook', 'POST'),
            ('directFilesWrite', 4201, '/box/api/files', 'POST'),
        ):
            result[label] = self.response(port, path, method)['status']
        result['root'] = self.response(4201, '/box')
        result['sso'] = self.response(4201, '/box/api/sso/start')
        require(result['directHealth'] == 200 and result['unprefixedHealth'] == 404,
                'Beta health/basePath boundary failed')
        require(all(result[name] == 401 for name in ('directGateway', 'streamLookup', 'streamWebhook')),
                'Unsigned gateway/Stream boundary failed')
        # This exact live baseline authenticates before entering the write API.
        require(result['directFilesWrite'] == 401, 'Unauthenticated direct Beta write boundary failed')
        require(result['root']['status'] in (302, 303, 307, 308) and result['root']['csp'],
                'Beta root authentication/CSP boundary failed')
        require(result['sso']['status'] in (302, 303, 307) and '/box' in result['sso']['cookiePaths'],
                'Beta SSO cookie boundary failed')
        return result

    def boundaries(self):
        result = self.direct_boundaries()
        for label, path, method in (
            ('filesWrite', '/box/api/files', 'POST'),
            ('publicInternalGet', '/box/api/internal/vi/v1/navigation', 'GET'),
            ('publicInternalHead', '/box/api/internal/vi/v1/navigation', 'HEAD'),
            ('publicInternalPost', '/box/api/internal/vi/v1/navigation', 'POST'),
        ):
            result[label] = self.response(8081, path, method)['status']
            require(result[label] == 403, 'Public write/internal boundary failed')
        return result

    def wait_health(self):
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            try:
                if self.response(4201, '/box/api/health')['status'] == 200:
                    return
            except (OSError, TimeoutError):
                pass
            time.sleep(1)
        raise RuntimeError('Beta health did not become ready')

    def validate_caddy(self, paths, pending, label):
        text = paths.caddy_main.read_text()
        needle = 'import /etc/caddy/vibox-beta.caddy'
        require(text.count(needle) == 1, 'Unexpected Caddy import')
        full = paths.operator / ('Caddyfile.' + label)
        require(not full.exists(), 'Caddy validation receipt already exists')
        atomic(full, text.replace(needle, 'import ' + str(pending)))
        token = None
        for line in paths.caddy_env.read_text().splitlines():
            match = re.fullmatch(r'\s*(?:export\s+)?CF_API_TOKEN\s*=\s*(.*?)\s*', line)
            if match:
                token = match[1].strip('"\'')
        require(token, 'Caddy token missing')
        environment = os.environ.copy()
        environment['CF_API_TOKEN'] = token
        self.command(['/usr/local/bin/caddy', 'validate', '--config', full, '--adapter', 'caddyfile'],
                     paths.operator / ('caddy-validation.' + label + '.log'), env=environment)


def env_inventory(root):
    result = {}
    for path in sorted(root.glob('.env*')):
        no_links(path)
        require(path.is_file(), 'Unexpected environment entry')
        result[path.name] = {'sha256': sha(path), **file_metadata(path)}
    return result


def app_files(root, helper, runtime):
    sources = helper.source_hashes(root)
    result = {'sourceCount': len(sources), 'sourceDigest': digest(sources),
              'buildId': (no_links(root / '.next/BUILD_ID')).read_text().strip(),
              'envs': env_inventory(root),
              'dependenciesDigest': digest(helper.dependency_state(root / 'node_modules')),
              'nextDigest': digest(tree_hashes(root / '.next', exclude_cache=True))}
    if (root / '.git').exists():
        git = runtime.command(['/usr/bin/git', '--no-optional-locks', '-C', root, 'status', '--porcelain=v1', '--untracked-files=normal'])
        result['gitStatusSha256'] = hashlib.sha256(git.encode()).hexdigest()
    return result


def assert_beta_flags(live):
    values = {}
    for line in (live / '.env.local').read_text().splitlines():
        match = re.fullmatch(r'\s*(?:export\s+)?(VIBOX_BETA_READ_ONLY|VIBOX_RELEASE_CHANNEL)\s*=\s*(.*?)\s*', line)
        if match:
            values[match[1]] = match[2].split('#', 1)[0].strip().strip('"\'')
    require(values == {'VIBOX_BETA_READ_ONLY': '1', 'VIBOX_RELEASE_CHANNEL': 'beta'},
            'Beta read-only/channel flags changed')


def snapshot(paths, helper, runtime):
    for root in (paths.artifact, paths.live, paths.main):
        require(no_links(root).is_dir(), 'Target must be a real directory')
    assert_beta_flags(paths.live)
    units = {name: runtime.unit(name) for name in UNITS}
    for value in units.values():
        require('ActiveState=active' in value['state'], 'Protected service is not active')
    verify_beta_process(runtime, units[BETA_UNIT])
    result = {'units': units,
              'caddy': {str(path): sha(path) for path in (paths.caddy, paths.caddy_main, paths.caddy_env)},
              'caddyMetadata': {str(path): file_metadata(path) for path in (paths.caddy, paths.caddy_main, paths.caddy_env)},
              'filesKeySha256': sha(paths.files_key)}
    for name, root in (('beta', paths.live), ('main', paths.main)):
        result[name] = app_files(root, helper, runtime)
    result['boundaries'] = runtime.boundaries()
    return result


def verify_beta_process(runtime, unit):
    require(runtime.command(['/usr/bin/systemctl', 'show', BETA_UNIT, '--property=WorkingDirectory']) ==
            'WorkingDirectory=/opt/vibox-beta', 'Wrong Beta working directory')
    require(runtime.command(['/usr/bin/systemctl', 'show', BETA_UNIT, '--property=ReadOnlyPaths']) ==
            'ReadOnlyPaths=/opt/vibox-storage', 'Beta storage read-only boundary changed')
    listener = runtime.command(['/usr/bin/ss', '-H', '-ltnp', 'sport = :4201'])
    pid = re.search(r'(?m)^MainPID=(\d+)$', unit['state'])
    require(pid and listener.count('127.0.0.1:4201') == 1 and 'pid=' + pid[1] + ',' in listener,
            'Beta loopback socket is not owned by the expected service')


def validate_manifest(manifest):
    require((manifest.get('app'), manifest.get('target'), manifest.get('release')) == (APP, TARGET, RELEASE),
            'Wrong backend release manifest')
    current, baseline = manifest.get('sourceHashes'), manifest.get('baselineHashes')
    require(isinstance(current, dict) and isinstance(baseline, dict) and
            len(current) == SOURCE_COUNT and current.keys() == baseline.keys(), 'Wrong source inventory')
    require({name for name in current if current[name] != baseline[name]} == CHANGED, 'Wrong source change scope')
    for name, value in {**baseline, **current}.items():
        safe_name(name)
        require(re.fullmatch('[0-9a-f]{64}', value) is not None, 'Invalid source digest')
    require(manifest.get('baselineBuildId') == BASELINE_BUILD, 'Wrong baseline build')


def bindings(paths, intent, require_archive=True):
    require(intent.get('schemaVersion') == 1 and intent.get('pins') == paths.pins(), 'Wrong deployment target pins')
    require(intent.get('release') == RELEASE and intent.get('operatorSha256') == sha(paths.operator / 'box_release_operator.py'),
            'Operator/intent binding drift')
    require(intent.get('helperSha256') == HELPER_SHA == sha(paths.helper), 'Hash helper binding drift')
    for name in ('manifest.json', 'checks.json', 'artifact.json', 'build-complete.json'):
        require(sha(paths.artifact / name) == intent['inputs'][name], 'Artifact receipt drift: ' + name)
    manifest = read_json(paths.artifact / 'manifest.json')
    artifact = read_json(paths.artifact / 'artifact.json')
    checks = read_json(paths.artifact / 'checks.json')
    complete = read_json(paths.artifact / 'build-complete.json')
    validate_manifest(manifest)
    require(artifact.get('manifestSha256') == intent['inputs']['manifest.json'] == checks.get('manifestSha256'),
            'Manifest/check binding drift')
    require(artifact.get('checksSha256') == intent['inputs']['checks.json'], 'Check/artifact binding drift')
    require((artifact.get('app'), artifact.get('release'), artifact.get('buildId')) == (APP, RELEASE, CANDIDATE_BUILD),
            'Wrong candidate artifact')
    require(checks.get('status') == 'PASS' and checks.get('target') == TARGET and
            checks.get('buildId') == CANDIDATE_BUILD and checks.get('release') == RELEASE, 'Unverified build')
    require(checks.get('toolHashes') == manifest.get('toolHashes') and bool(manifest.get('toolHashes')),
            'Build tool evidence differs')
    for name, value in manifest['toolHashes'].items():
        safe_name(name)
        require(name == 'linux-build.py' or name.startswith('build-tools/'), 'Unexpected build tool path')
        require(sha(paths.artifact / name) == value, 'Verified build tool drift')
    require(checks.get('testSummary') == {'failed': 0, 'files': 29, 'passed': 378, 'skipped': 0, 'tests': 378},
            'Required test evidence differs')
    require({entry['step'] for entry in checks['checks']} == {'tests', 'tsc', 'build'} and
            all(entry['exitCode'] == 0 for entry in checks['checks']), 'Required checks missing')
    require(complete.get('status') == 'BACKEND_BUILD_SMOKE_AND_PACKAGE_PASS' and
            (complete.get('app'), complete.get('target'), complete.get('release')) == (APP, TARGET, RELEASE) and
            complete.get('liveProtectionUnchanged') is True and complete.get('activatesServices') is False,
            'Isolated build protection evidence missing')
    for key, name in (('manifestSha256', 'manifest.json'), ('checksSha256', 'checks.json'), ('artifactSha256', 'artifact.json')):
        require(complete.get(key) == intent['inputs'][name], 'Build completion receipt binding drift')
    require(complete.get('archiveSha256') == artifact.get('archiveSha256') == intent['archiveSha256'],
            'Archive receipt binding drift')
    for name, value in artifact['files'].items():
        path = safe_name(name)
        require(name in manifest['sourceHashes'] or (path.parts[0] == '.next' and len(path.parts) > 1 and path.parts[1] != 'cache'),
                'Archive path outside source/build scope')
        require(re.fullmatch('[0-9a-f]{64}', value) is not None, 'Invalid artifact digest')
    require(all(artifact['files'].get(name) == value for name, value in manifest['sourceHashes'].items()),
            'Artifact source differs from verified source')
    require(intent['observed']['beta']['sourceDigest'] == digest(manifest['baselineHashes']) and
            intent['observed']['beta']['sourceCount'] == SOURCE_COUNT and
            intent['observed']['beta']['buildId'] == BASELINE_BUILD and
            manifest.get('baselineEnvSha256') == intent['observed']['beta']['envs']['.env.local']['sha256'],
            'Observed baseline differs from the build manifest')
    if require_archive:
        require(sha(paths.artifact / 'artifact.tar.gz') == intent['archiveSha256'], 'Archive missing or changed')
    return manifest, artifact


def render_actions(text, old, new):
    pattern = re.compile(r'(?m)^([ \t]*header[ \t]+Next-Action[ \t]+)([0-9a-f]{40,64})([ \t]*)$')
    matches = list(pattern.finditer(text))
    require(len(matches) == 2 and len({match[2] for match in matches}) == 2, 'Expected exactly two action rules')
    mapping = []
    for match in matches:
        entry = old.get(match[2], {})
        name = (entry.get('filename'), entry.get('exportedName'))
        require(name in ACTION_NAMES, 'Unexpected Caddy action identity')
        hits = [key for key, value in new.items() if (value.get('filename'), value.get('exportedName')) == name]
        require(len(hits) == 1 and re.fullmatch('[0-9a-f]{40,64}', hits[0]), 'Action mapping must be unique')
        mapping.append({'old': match[2], 'new': hits[0], 'filename': name[0], 'exportedName': name[1]})
    require({(item['filename'], item['exportedName']) for item in mapping} == ACTION_NAMES and
            len({item['new'] for item in mapping}) == 2, 'Incomplete action mapping')
    replacements = {item['old']: item['new'] for item in mapping}
    # Only the two header values change; preserve all other bytes and whitespace.
    return pattern.sub(lambda match: match[1] + replacements[match[2]] + match[3], text), mapping


def extract(paths, artifact):
    target = paths.operator / 'release'
    require(not target.exists() and not target.is_symlink(), 'Extract target already exists')
    with tarfile.open(paths.artifact / 'artifact.tar.gz', 'r:gz') as archive:
        members = archive.getmembers()
        names = [item.name for item in members]
        require(len(names) == len(set(names)) and set(names) == set(artifact['files']), 'Archive inventory mismatch')
        for item in members:
            safe_name(item.name)
            require(item.isfile() and not item.issym() and not item.islnk(), 'Archive links/special files rejected')
        unpacked = sum(item.size for item in members)
        # The existing package schema records expanded file bytes, not gzip size.
        require(unpacked == artifact['bytes'] and 0 < unpacked < 750 * 2**20, 'Expanded artifact size differs')
        retained = sum(path.stat().st_size for path in (paths.live / '.next/static').rglob('*') if path.is_file())
        require(shutil.disk_usage(paths.operator).free >= 50 * 2**30 + unpacked + retained + 128 * 2**20,
                'Insufficient reserve for measured extraction/static growth')
        target.mkdir(mode=0o700)
        for item in members:
            dest = target / item.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(item) as source, dest.open('xb') as out:
                shutil.copyfileobj(source, out)
            os.chmod(dest, item.mode & 0o755)
            require(sha(dest) == artifact['files'][item.name], 'Extracted artifact digest mismatch')
    return target


def retain_static(old, new):
    old_files = tree_hashes(old)
    for name, expected in old_files.items():
        dest = no_links(new / name, missing=True)
        if dest.exists():
            require(sha(dest) == expected, 'Static URL collision')
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            # Copy instead of hardlinking: later chown must not mutate live inodes.
            shutil.copy2(old / name, dest)
    return old_files


def candidate_next_digest(artifact, old_static):
    files = {name[len('.next/'):]: value for name, value in artifact['files'].items() if name.startswith('.next/')}
    for name, value in tree_hashes(old_static).items():
        key = 'static/' + name
        require(key not in files or files[key] == value, 'Static URL collision')
        files[key] = value
    return digest(files)


def assert_state(current, expected, changed_beta=False, caddy_after=None):
    require(current['main'] == expected['main'], 'Protected main files/build/env/dependencies drift')
    for unit in UNITS:
        require(current['units'][unit]['configSha256'] == expected['units'][unit]['configSha256'], 'Service config drift')
        if unit != BETA_UNIT or not changed_beta:
            require(current['units'][unit]['state'] == expected['units'][unit]['state'], 'Protected service state drift')
    require(current['filesKeySha256'] == expected['filesKeySha256'], 'Files verification key drift')
    require(current['caddyMetadata'] == expected['caddyMetadata'], 'Caddy metadata drift')
    for name, value in expected['caddy'].items():
        require(current['caddy'][name] == (caddy_after if caddy_after is not None and name.endswith('/vibox-beta.caddy') else value),
                'Caddy configuration drift')
    for name in ('envs', 'dependenciesDigest'):
        require(current['beta'][name] == expected['beta'][name], 'Beta protected ' + name + ' drift')
    if not changed_beta:
        require(current['beta'] == expected['beta'], 'Beta source/build changed before activation')
    require(current['boundaries'] == expected['boundaries'], 'Runtime read-only/auth/basePath boundaries drift')


class Deployment:
    def __init__(self, paths, intent, helper, runtime):
        self.paths, self.intent, self.helper, self.runtime = paths, intent, helper, runtime

    def capture(self):
        return snapshot(self.paths, self.helper, self.runtime)

    def journal(self, state, event):
        state.setdefault('events', []).append(event)
        save(self.paths.operator / 'activation.json', state)

    def prepare(self):
        paths = self.paths
        manifest, artifact = bindings(paths, self.intent)
        for name in ('prepared.json', 'prepare-state.json', 'activation.json', 'release', 'backup', 'pending-source'):
            require(not (paths.operator / name).exists(), 'Preparation already attempted; retain existing evidence')
        before = self.capture()
        assert_state(before, self.intent['observed'])
        require(before['beta']['sourceDigest'] == digest(manifest['baselineHashes']) and
                before['beta']['buildId'] == BASELINE_BUILD, 'Wrong live source/build baseline')
        require(shutil.disk_usage(paths.operator).free >= 50 * 2**30 + artifact['bytes'] * 3,
                'Insufficient 50GiB disk reserve')
        require(paths.operator.stat().st_dev == paths.live.stat().st_dev, 'Atomic rename filesystem mismatch')
        state = {'status': 'PREPARING', 'intentSha256': sha(paths.operator / 'intent.json')}
        save(paths.operator / 'prepare-state.json', state, exclusive=True)
        try:
            release = extract(paths, artifact)
            require((release / '.next/BUILD_ID').read_text().strip() == CANDIDATE_BUILD, 'Extracted build ID differs')
            backup = paths.operator / 'backup'
            backup.mkdir(mode=0o700)
            pending = paths.operator / 'pending-source'
            pending.mkdir(mode=0o700)
            for name in sorted(CHANGED):
                self.helper.safe_relative(name)
                source = no_links(paths.live / name)
                require(source.parent.stat().st_dev == paths.operator.stat().st_dev, 'Source target filesystem mismatch')
                for root in (backup / 'source', pending):
                    dest = root / name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source if root == backup / 'source' else release / name, dest)
                    meta = file_metadata(source)
                    os.chmod(dest, meta['mode'])
                    os.chown(dest, meta['uid'], meta['gid'])
            old_static = retain_static(paths.live / '.next/static', release / '.next/static')
            owner = file_metadata(paths.live / '.next')
            for folder, dirs, files in os.walk(release / '.next'):
                os.chown(folder, owner['uid'], owner['gid'])
                for name in files:
                    os.chown(Path(folder) / name, owner['uid'], owner['gid'])
            old = read_json(paths.live / '.next/server/server-reference-manifest.json')['node']
            new = read_json(release / '.next/server/server-reference-manifest.json')['node']
            rendered, actions = render_actions(paths.caddy.read_text(), old, new)
            shutil.copy2(paths.caddy, backup / 'caddy')
            atomic(paths.operator / 'caddy.pending', rendered, file_metadata(paths.caddy))
            if sha(paths.operator / 'caddy.pending') != sha(paths.caddy):
                self.runtime.validate_caddy(paths, paths.operator / 'caddy.pending', 'prepare')
            prepared = {'status': 'PREPARED', 'intentSha256': sha(paths.operator / 'intent.json'),
                        'before': before, 'nextDigest': digest(tree_hashes(release / '.next', exclude_cache=True)),
                        'retainedStaticDigest': digest(old_static), 'retainedStaticCount': len(old_static),
                        'caddyAfter': sha(paths.operator / 'caddy.pending'), 'caddyMetadata': file_metadata(paths.caddy),
                        'actions': actions}
            assert_state(self.capture(), before)
            save(paths.operator / 'prepared.json', prepared, exclusive=True)
            state['status'] = 'PREPARED'
            save(paths.operator / 'prepare-state.json', state)
            return prepared
        except BaseException as error:
            state.update(status='PREPARE_FAILED', errorType=type(error).__name__)
            save(paths.operator / 'prepare-state.json', state)
            raise

    def verify_prepared(self):
        prepared = read_json(self.paths.operator / 'prepared.json')
        require(prepared['status'] == 'PREPARED' and prepared['intentSha256'] == sha(self.paths.operator / 'intent.json'),
                'Prepared intent drift')
        require(prepared['before'] == self.intent['observed'] and
                prepared['caddyAfter'] == self.intent['caddyAfterSha256'] and
                prepared['actions'] == self.intent['actions'] and
                prepared['nextDigest'] == self.intent['candidateNextDigest'], 'Prepared protection/action binding drift')
        require(sha(self.paths.operator / 'caddy.pending') == prepared['caddyAfter'], 'Pending Caddy drift')
        require(sha(self.paths.operator / 'backup/caddy') == prepared['before']['caddy'][str(self.paths.caddy)],
                'Caddy backup drift')
        return prepared

    def activate(self):
        paths = self.paths
        manifest, artifact = bindings(paths, self.intent)
        prepared = self.verify_prepared()
        require(not (paths.operator / 'activation.json').exists(), 'Activation already attempted')
        assert_state(self.capture(), prepared['before'])
        release = paths.operator / 'release'
        require(digest(tree_hashes(release / '.next', exclude_cache=True)) == prepared['nextDigest'], 'Staged build drift')
        for name in CHANGED:
            require(sha(paths.operator / 'pending-source' / name) == manifest['sourceHashes'][name] and
                    sha(paths.operator / 'backup/source' / name) == manifest['baselineHashes'][name], 'Staged source/backup drift')
        require(not (paths.operator / 'backup/.next').exists(), 'Old build backup target exists')
        state = {'status': 'APPLYING', 'intentSha256': sha(paths.operator / 'intent.json'), 'events': []}
        save(paths.operator / 'activation.json', state, exclusive=True)
        try:
            self.journal(state, 'beta-stop-intent')
            self.runtime.mutate_service('stop', BETA_UNIT)
            self.journal(state, 'beta-stopped')
            for name in sorted(CHANGED):
                require(sha(paths.live / name) == manifest['baselineHashes'][name],
                        'Source changed immediately before replacement: ' + name)
                os.replace(paths.operator / 'pending-source' / name, paths.live / name)
                self.journal(state, 'source-replaced:' + name)
            require(digest(tree_hashes(paths.live / '.next', exclude_cache=True)) == prepared['before']['beta']['nextDigest'],
                    'Baseline build changed immediately before retention')
            os.replace(paths.live / '.next', paths.operator / 'backup/.next')
            self.journal(state, 'old-next-retained')
            os.replace(release / '.next', paths.live / '.next')
            self.journal(state, 'new-next-installed')
            if prepared['caddyAfter'] != prepared['before']['caddy'][str(paths.caddy)]:
                require(sha(paths.caddy) == prepared['before']['caddy'][str(paths.caddy)] and
                        not self.foreign_caddy(prepared), 'Caddy changed immediately before replacement')
                atomic(paths.caddy, (paths.operator / 'caddy.pending').read_bytes(), prepared['caddyMetadata'])
                self.journal(state, 'two-caddy-action-ids-installed')
            self.runtime.mutate_service('start', BETA_UNIT)
            self.runtime.wait_health()
            if prepared['caddyAfter'] != prepared['before']['caddy'][str(paths.caddy)]:
                self.runtime.mutate_service('reload', 'caddy.service')
            current = self.capture()
            assert_state(current, prepared['before'], changed_beta=True, caddy_after=prepared['caddyAfter'])
            require(current['beta']['sourceDigest'] == digest(manifest['sourceHashes']) and
                    current['beta']['buildId'] == CANDIDATE_BUILD and
                    current['beta']['nextDigest'] == prepared['nextDigest'], 'Installed candidate verification failed')
            state.update(status='ACTIVE', after=current)
            self.journal(state, 'candidate-and-protected-state-verified')
            return state
        except BaseException as error:
            state['failureType'] = type(error).__name__
            self.journal(state, 'activation-failed')
            try:
                self.rollback()
            except BaseException as rollback_error:
                latest = read_json(paths.operator / 'activation.json')
                latest.update(status='ROLLBACK_FAILED', rollbackFailureType=type(rollback_error).__name__)
                self.journal(latest, 'automatic-rollback-failed')
                raise RuntimeError('Activation and rollback failed; retained receipts require inspection') from None
            raise RuntimeError('Activation failed; previous Beta source/build/Caddy restored') from None

    def rollback(self):
        paths = self.paths
        manifest, _artifact = bindings(paths, self.intent, require_archive=False)
        prepared = self.verify_prepared()
        state = read_json(paths.operator / 'activation.json')
        require(state['intentSha256'] == prepared['intentSha256'] and
                state['status'] in ('APPLYING', 'ACTIVE', 'ROLLBACK_FAILED', 'ROLLED_BACK', 'ROLLED_BACK_WITH_FINDINGS'),
                'No matching rollback state')
        if state['status'] in ('ROLLED_BACK', 'ROLLED_BACK_WITH_FINDINGS'):
            self.verify_restored_beta(prepared)
            return state
        # Recovery of our Beta must not depend on an unrelated main restart or
        # concurrent main edit. Record those findings without overwriting them.
        findings = self.unrelated_findings(prepared)
        current_beta_unit = self.runtime.unit(BETA_UNIT)
        require(current_beta_unit['configSha256'] == prepared['before']['units'][BETA_UNIT]['configSha256'],
                'Beta service config changed; refuse rollback')
        require(sha(paths.files_key) == prepared['before']['filesKeySha256'], 'Files verification key changed; refuse rollback')
        require(env_inventory(paths.live) == prepared['before']['beta']['envs'], 'Beta env changed; refuse rollback')
        require(digest(self.helper.dependency_state(paths.live / 'node_modules')) == prepared['before']['beta']['dependenciesDigest'],
                'Beta dependencies changed; refuse rollback')
        foreign_caddy = self.foreign_caddy(prepared)
        if foreign_caddy:
            findings.append('FOREIGN_CADDY_PRESERVED')
        actual = self.helper.source_hashes(paths.live)
        require(actual.keys() == manifest['baselineHashes'].keys(), 'Source inventory changed outside the release')
        for name, value in actual.items():
            require(value in ({manifest['baselineHashes'][name], manifest['sourceHashes'][name]} if name in CHANGED
                             else {manifest['baselineHashes'][name]}), 'Source changed outside the release: ' + name)
        for name in CHANGED:
            require(sha(paths.operator / 'backup/source' / name) == manifest['baselineHashes'][name], 'Source backup drift')
        old_next = paths.operator / 'backup/.next'
        no_links(old_next, missing=True)
        no_links(paths.live / '.next', missing=True)
        no_links(paths.operator / 'failed.next', missing=True)
        if old_next.exists():
            require(digest(tree_hashes(old_next, exclude_cache=True)) == prepared['before']['beta']['nextDigest'], 'Old build backup drift')
            # Refuse an independently changed live build or occupied retention
            # target before stopping the currently running Beta service.
            if (paths.live / '.next').exists():
                require(not (paths.operator / 'failed.next').exists(), 'Failed candidate build already retained')
                require(digest(tree_hashes(paths.live / '.next', exclude_cache=True)) == prepared['nextDigest'],
                        'Live build changed outside release')
        else:
            require((paths.live / '.next').is_dir() and
                    digest(tree_hashes(paths.live / '.next', exclude_cache=True)) == prepared['before']['beta']['nextDigest'],
                    'No verified old build to restore')
        state['status'] = 'ROLLBACK_FAILED'  # Persist a recoverable state before touching services.
        state['rollbackFindings'] = findings
        self.journal(state, 'rollback-started')
        self.runtime.mutate_service('stop', BETA_UNIT)
        self.journal(state, 'rollback-beta-stopped')
        if old_next.exists():
            if (paths.live / '.next').exists():
                require(not (paths.operator / 'failed.next').exists(), 'Failed candidate build already retained')
                require(digest(tree_hashes(paths.live / '.next', exclude_cache=True)) == prepared['nextDigest'], 'Live build changed outside release')
                os.replace(paths.live / '.next', paths.operator / 'failed.next')
                self.journal(state, 'failed-next-retained')
            os.replace(old_next, paths.live / '.next')
            self.journal(state, 'old-next-restored')
        for name in sorted(CHANGED):
            if sha(paths.live / name) != manifest['baselineHashes'][name]:
                atomic(paths.live / name, (paths.operator / 'backup/source' / name).read_bytes(),
                       file_metadata(paths.operator / 'backup/source' / name))
                self.journal(state, 'source-restored:' + name)
        if not foreign_caddy and self.foreign_caddy(prepared):
            foreign_caddy = True
            findings.append('FOREIGN_CADDY_PRESERVED')
        if not foreign_caddy and sha(paths.caddy) != prepared['before']['caddy'][str(paths.caddy)]:
            atomic(paths.caddy, (paths.operator / 'backup/caddy').read_bytes(), prepared['caddyMetadata'])
            self.journal(state, 'caddy-action-ids-restored')
        if not foreign_caddy and prepared['caddyAfter'] != prepared['before']['caddy'][str(paths.caddy)]:
            # A prior failed reload may already have restored the file on disk.
            self.runtime.mutate_service('reload', 'caddy.service')
            self.journal(state, 'rollback-caddy-reloaded')
        self.runtime.mutate_service('start', BETA_UNIT)
        self.runtime.wait_health()
        current = self.verify_restored_beta(prepared)
        findings = sorted(set(findings + self.unrelated_findings(prepared)))
        if self.foreign_caddy(prepared):
            findings = sorted(set(findings + ['FOREIGN_CADDY_PRESERVED']))
        if not foreign_caddy:
            try:
                require(self.runtime.boundaries() == prepared['before']['boundaries'], 'Edge boundaries changed')
            except Exception:
                findings = sorted(set(findings + ['EDGE_RUNTIME_RECHECK_FAILED']))
        state.update(status='ROLLED_BACK_WITH_FINDINGS' if findings else 'ROLLED_BACK',
                     rollbackAfter=current, rollbackFindings=findings)
        self.journal(state, 'previous-beta-verified-and-unrelated-findings-recorded')
        return state

    def verify_restored_beta(self, prepared):
        paths = self.paths
        assert_beta_flags(paths.live)
        current = {'beta': app_files(paths.live, self.helper, self.runtime), 'unit': self.runtime.unit(BETA_UNIT),
                   'directBoundaries': self.runtime.direct_boundaries()}
        require(sha(paths.files_key) == prepared['before']['filesKeySha256'], 'Files verification key changed during rollback')
        require(current['beta'] == prepared['before']['beta'], 'Restored Beta differs from original')
        require(current['unit']['configSha256'] == prepared['before']['units'][BETA_UNIT]['configSha256'] and
                'ActiveState=active' in current['unit']['state'], 'Restored Beta service is not active with the original config')
        verify_beta_process(self.runtime, current['unit'])
        expected_direct = {name: value for name, value in prepared['before']['boundaries'].items()
                           if name not in ('filesWrite', 'publicInternalGet', 'publicInternalHead', 'publicInternalPost')}
        require(current['directBoundaries'] == expected_direct, 'Restored direct Beta boundaries differ')
        return current

    def unrelated_findings(self, prepared):
        findings = []
        try:
            if app_files(self.paths.main, self.helper, self.runtime) != prepared['before']['main']:
                findings.append('UNRELATED_MAIN_FILES_DRIFT')
        except Exception:
            findings.append('UNRELATED_MAIN_FILES_UNAVAILABLE')
        for unit in UNITS:
            if unit == BETA_UNIT:
                continue
            try:
                if self.runtime.unit(unit) != prepared['before']['units'][unit]:
                    findings.append('UNRELATED_UNIT_DRIFT:' + unit)
            except Exception:
                findings.append('UNRELATED_UNIT_UNAVAILABLE:' + unit)
        return findings

    def foreign_caddy(self, prepared):
        paths = self.paths
        try:
            if sha(paths.caddy) not in (prepared['before']['caddy'][str(paths.caddy)], prepared['caddyAfter']):
                return True
            for path in (paths.caddy_main, paths.caddy_env):
                if sha(path) != prepared['before']['caddy'][str(path)]:
                    return True
            for path in (paths.caddy, paths.caddy_main, paths.caddy_env):
                if file_metadata(path) != prepared['before']['caddyMetadata'][str(path)]:
                    return True
            unit = self.runtime.unit('caddy.service')
            return unit['configSha256'] != prepared['before']['units']['caddy.service']['configSha256'] or \
                'ActiveState=active' not in unit['state']
        except Exception:
            return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', nargs='?', default='plan', choices=('plan', 'inspect', 'prepare', 'activate', 'rollback'))
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--intent-sha256')
    args = parser.parse_args(argv)
    paths = Paths()
    if not args.execute:
        print(json.dumps({'dryRun': True, 'action': args.action, 'release': RELEASE, 'pins': paths.pins(),
                          'baselineBuild': BASELINE_BUILD, 'candidateBuild': CANDIDATE_BUILD,
                          'sourceChanges': sorted(CHANGED), 'serviceMutations': ['stop/start vibox-beta.service',
                          'reload caddy.service only when the two action header values change'],
                          'envChanges': False, 'dependencyChanges': False, 'storageWrites': False,
                          'uploads': False, 'contactsRemoteHosts': False}, sort_keys=True))
        return
    require(args.action != 'plan', 'Plan cannot execute')
    require(sys.platform == 'linux' and os.geteuid() == 0, 'Execute only as root inside CT112')
    require(Path(__file__).absolute() == paths.operator / 'box_release_operator.py' and
            no_links(paths.operator).is_dir(), 'Execute only from the exact operator staging root')
    require(args.intent_sha256 and re.fullmatch('[0-9a-f]{64}', args.intent_sha256) and
            sha(paths.operator / 'intent.json') == args.intent_sha256, 'Explicit intent digest required')
    intent = read_json(paths.operator / 'intent.json')
    helper = load_helper(paths)
    deployment = Deployment(paths, intent, helper, Runtime())
    # The existing Box lock serializes this operator with earlier Box releases.
    with open('/run/lock/single-address-box.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == 'inspect':
            bindings(paths, intent)
            assert_state(deployment.capture(), intent['observed'])
            result = {'status': 'BASELINE_AND_INPUTS_VERIFIED', 'readOnly': True}
        else:
            result = getattr(deployment, args.action)()
        print(json.dumps({'release': RELEASE, 'action': args.action, 'status': result['status']}, sort_keys=True))


if __name__ == '__main__':
    main()
