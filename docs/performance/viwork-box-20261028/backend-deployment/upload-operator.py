"""Stage a reviewed Box Beta operator only; no service or application changes."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import os
import shlex
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
STAGE = '/opt/viwork-box-performance-20261028/backend-deploy-r1'
TRANSPORT = '/Users/vimo/Desktop/Dev/video-moment/_docs/qa/viwork-single-address-2026-10-27/deploy/sff.sh'


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def sha(value):
    return hashlib.sha256(value).hexdigest()


REMOTE = r'''
from pathlib import Path
import hashlib,io,json,os,shutil,subprocess,sys,tarfile
stage=Path('/opt/viwork-box-performance-20261028/backend-deploy-r1')
def require(ok,message):
    if not ok: raise RuntimeError(message)
def sha(data): return hashlib.sha256(data).hexdigest()
def units():
    return {name:sha(subprocess.run(['/usr/bin/systemctl','show',name,'--property=ActiveState,MainPID,ExecMainStartTimestampMonotonic'],capture_output=True,check=True).stdout) for name in ('vibox.service','vibox-beta.service','caddy.service','cloudflared-vibox.service')}
require(os.geteuid()==0 and sys.platform=='linux','CT112 root required')
require(stage.parent.is_dir() and not stage.parent.is_symlink(),'Stage parent unavailable')
require(not stage.exists() and not stage.is_symlink(),'Immutable operator stage already exists')
data=sys.stdin.buffer.read(2*2**20+1)
require(len(data)<=2*2**20 and sha(data)==ARCHIVE_SHA,'Operator transfer changed')
payload={}
with tarfile.open(fileobj=io.BytesIO(data),mode='r:') as archive:
    members=archive.getmembers()
    require(len(members)==2 and {m.name for m in members}==set(FILES),'Unexpected operator files')
    for member in members:
        require(member.isfile() and member.name in ('box_release_operator.py','intent.json'),'Unsafe operator entry')
        value=archive.extractfile(member).read()
        require(sha(value)==FILES[member.name],'Operator hash mismatch')
        payload[member.name]=value
intent=json.loads(payload['intent.json'])
require(intent['operatorSha256']==FILES['box_release_operator.py'] and intent['pins']['operator']==str(stage),'Wrong operator binding')
require(shutil.disk_usage(stage.parent).free>=50*2**30+len(data),'Insufficient 50GiB reserve')
before=units()
stage.mkdir(mode=0o700)
for name,value in payload.items():
    target=stage/name
    with target.open('xb') as stream: stream.write(value)
    os.chmod(target,0o600)
require(units()==before,'Existing CT112 service state changed during upload')
print(json.dumps({'stage':str(stage),'files':FILES,'prepared':False,'activated':False,'servicesModified':False}))
'''


def main(execute):
    if not execute:
        print(json.dumps({'dryRun': True, 'stage': STAGE, 'ct': 112,
                          'prepare': False, 'activate': False, 'requiresSuccessfulIndependentReview': True}))
        return
    require(not (HERE / 'upload-command.json').exists(), 'Upload already attempted')
    data = {name: (HERE / name).read_bytes() for name in ('box_release_operator.py', 'intent.json')}
    hashes = {name: sha(value) for name, value in data.items()}
    review = json.loads((HERE / 'independent-review.json').read_text())
    require(review['status'] == 'PASS' and review['operatorSha256'] == hashes['box_release_operator.py']
            and review['intentSha256'] == hashes['intent.json'], 'Independent review binding missing')
    intent = json.loads(data['intent.json'])
    require(intent['operatorSha256'] == hashes['box_release_operator.py'] and intent['pins']['operator'] == STAGE, 'Operator intent mismatch')
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:') as archive:
        for name, value in data.items():
            member = tarfile.TarInfo(name)
            member.size, member.mode = len(value), 0o600
            archive.addfile(member, io.BytesIO(value))
    archive = buffer.getvalue()
    script = 'FILES=' + repr(hashes) + '\nARCHIVE_SHA=' + repr(sha(archive)) + '\n' + REMOTE
    command = 'pct exec 112 -- ' + shlex.join(['python3', '-c', script])
    result = subprocess.run([TRANSPORT, command], input=archive, capture_output=True, timeout=120)
    receipt = {'exitCode': result.returncode, 'stdout': result.stdout.decode(), 'stderr': result.stderr.decode(), 'files': hashes}
    with (HERE / 'upload-command.json').open('x') as output:
        os.chmod(output.fileno(), 0o600)
        json.dump(receipt, output, indent=2)
        output.write('\n')
    require(result.returncode == 0, 'Upload failed; preserve receipt and partial stage')
    print(result.stdout.decode())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    main(parser.parse_args().execute)
