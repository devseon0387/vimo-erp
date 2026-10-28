# 비박스 성능 후보 Beta 배포·복구 준비

이 폴더는 **검증된 후보를 위한 운영 도구와 검수 증거**다. 현재 단계에서는 원격 파일 업로드,
운영 prepare/activate/rollback, 서비스 변경을 실행하지 않았다. 실제 전환은 독립 검수 후
메인 운영자가 기존 Vibox Beta 승인 범위에서 수행한다.

## 고정된 대상과 증거

| 항목 | 고정값 |
| --- | --- |
| 대상 | CT112, `/opt/vibox-beta`, `vibox-beta.service`, `127.0.0.1:4201`, basePath `/box` |
| 기존 빌드 | `WPoM-LMBBr3AOiI00BlfI` |
| 후보 빌드 | `-5ciigDEj7n9M4ZIwVSHg` |
| 검증된 산출물 | `/opt/viwork-box-performance-20261028/backend-r1` |
| 새 운영 도구 경로 | `/opt/viwork-box-performance-20261028/backend-deploy-r1` |
| 소스 | 기존·후보 988개, 승인된 5개만 변경 |
| 빌드 증거 | `../linux-backend/result/`: 29개 검사 파일·378개 테스트, tsc·build·격리 smoke·package PASS |
| operator SHA256 | `24c760e9cc2d2870b6a5f4602b5754a639188d9a513af8a18ea6ce1feb075d44` |
| intent SHA256 | `8f8fe259a235f8194e5db6254d6ca1b2b2fe5302ba2c89cc03a58a379de42f57` |

승인된 5개 파일은 `lib/dashboard/queries.ts`, `lib/team-boxes/access.ts`,
`lib/vi-gateway/navigation.ts`, `__tests__/dashboard-loading-queries.test.ts`,
`__tests__/team-box-access.test.ts`다. 후보 전체 소스·기존 dirty 개발 루트·기존 Main을
통째로 덮어쓰지 않는다. 기존 `.env*`, `node_modules`, 사용자 스토리지, unit/drop-in은
교체 대상이 아니다.

`observed-final.json`은 `revisions/r2/observed-final.json`의 실제 관측을 명시적으로 재사용한 것이다.
원래 관측은 CT112에서 두 번 연속 일치했다. r3 시점 새 SSH 관측은 추가 인증 요구로
실패하여 재시도하지 않았으며, 원래 관측 시각을 새 실측으로 승격하지 않았다. 현재 상태의
최종 일치는 인증 복구 후 운영자가 실행할 `inspect`와 `prepare`의 새 읽기로 강제한다. 환경 값과
HTTP 본문·쿠키·토큰을 저장하지 않으며 환경 파일은 해시·권한·소유자만 기록한다.
기존 `.env.local.new.*` 같은 파일도 그대로 보호한다. Main의 소스·빌드·환경·의존성,
네 개 unit의 설정·PID·시작 시각, Caddy 세 파일, 파일 권한 검증 키를 함께 고정한다.

`intent.json`은 operator, 검증 helper, manifest/checks/artifact/build-complete 및 archive
해시를 결속한다. 새 `.next`의 예상 해시는 후보 산출물과 유지할 기존 static 자산의 합으로
결정한다. 현재 action manifest를 대조한 결과 logout·signup action ID **두 개의 교체가 필요**하다.
현재 Caddy의 다른 바이트는 그대로 보존한다.

## 기본 동작과 명시적 실행

다음 두 명령은 원격 접속이나 파일 변경 없이 계획만 출력한다. `prepare`, `activate`,
`rollback`을 지정하더라도 `--execute`가 없으면 계획만 출력한다.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 deployment-box/box_release_operator.py
PYTHONDONTWRITEBYTECODE=1 python3 deployment-box/capture_intent.py
```

`capture_intent.py --capture`는 기존 `../viwork-single-address-2026-10-27/deploy/sff.sh`를
통해 CT112에 Python 정의를 stdin으로 전달하여 **읽기만** 한다. remote bytecode 저장도
끄며 업로드·서비스 변경·운영 상태 파일 생성을 하지 않는다. 이미 만든 `intent.json`과
`observed-final.json`은 덮어쓰지 않는다. 새 관측이 필요하면 기존 증거를 보존하고 새 검수
revision을 먼저 준비한다.

독립 검수를 마친 운영자는 새 operator 경로에 `box_release_operator.py`와 `intent.json`
**두 파일만** 별도 전송한다. 이 도구에는 전송·설치 명령이 없다. 이미 검증된 backend-r1
산출물과 build-tools를 다시 만들거나 교체하지 않는다. remote operator는 해당 새 경로의
정확한 파일명으로 Linux root에서만 실행할 수 있고 경로 override 옵션이 없다.

CT112에서 사용할 실제 명령은 다음과 같다. 아래 명령은 이 하위 작업에서 실행하지 않았다.
각 단계는 동일한 기존 Box 배포 lock을 사용한다.

```sh
python3 /opt/viwork-box-performance-20261028/backend-deploy-r1/box_release_operator.py inspect --execute --intent-sha256 8f8fe259a235f8194e5db6254d6ca1b2b2fe5302ba2c89cc03a58a379de42f57
python3 /opt/viwork-box-performance-20261028/backend-deploy-r1/box_release_operator.py prepare --execute --intent-sha256 8f8fe259a235f8194e5db6254d6ca1b2b2fe5302ba2c89cc03a58a379de42f57
python3 /opt/viwork-box-performance-20261028/backend-deploy-r1/box_release_operator.py activate --execute --intent-sha256 8f8fe259a235f8194e5db6254d6ca1b2b2fe5302ba2c89cc03a58a379de42f57
```

`inspect`는 현재 baseline과 모든 입력을 확인한다. `prepare`는 현재 baseline·보호 상태를
다시 대조하고 실제 archive inventory·내용을 검증해 새 경로에 추출한다. 원격 잔여 공간은
50GiB와 측정한 압축 해제·static 복사 증가분을 함께 요구한다. 기존 소스 5개와 Caddy를
백업하고 교체할 소스 파일을 미리 준비한다. 이전 static은 URL·내용 충돌 검사 후 **복사**한다.
hardlink 뒤 chown으로 기존 live inode를 바꾸는 방식은 사용하지 않는다. Caddy는 현재
텍스트의 두 `header Next-Action` 값만 동일 filename/exportedName의 새 ID로 치환하고
전체 설정을 validate한다. 이 단계는 live 소스·`.next`·Caddy·서비스를 바꾸지 않는다.

`activate`는 prepared/intent 및 모든 입력·보호 상태를 재확인한다. 베타만 정지한 뒤
소스 파일 5개를 atomic rename으로 교체하고, 기존 `.next`를 백업 위치로 옮긴 뒤 새 `.next`를
설치한다. 각 소스와 기존 빌드의 실제 교체 직전에 기존 해시를 다시 확인한다. 필요한 두 Caddy ID도
쓰기 직전 해시·권한·보호 입력을 다시 대조한 뒤 atomic 교체하고 베타를 시작한다. health 확인 후 Caddy를
reload하고 후보 source/build, 기존 Main/env/deps/unit·읽기 전용·Stream·gateway 경계를
대조한다. 환경 파일, 의존성 설치·수정, DB, 사용자 스토리지 쓰기, Main restart는 없다.

현재 실측은 direct `:4201 POST /box/api/files`가 인증 선행으로 **401**, Caddy `:8081`의 같은
요청은 **403**이다. 이 결과를 그대로 pin한다. public internal GET/HEAD/POST는 403,
unsigned direct gateway와 Stream lookup/webhook은 401, `/box/api/health`는 200,
unprefixed `/api/health`는 404다. SSO는 응답의 경로와 cookie Path만 대조한다.

## 실패와 복구

여러 소스 파일과 두 디렉터리 rename 전체는 하나의 원자적 트랜잭션이 아니다. 따라서
베타 정지 구간과 mutation 전후의 `activation.json` 이벤트를 남긴다. 잡을 수 있는 실패는
자동 rollback을 시도한다. 프로세스 강제 종료처럼 처리할 수 없는 중단은 `APPLYING`
receipt와 실제 파일 상태를 보존하므로 같은 intent의 아래 명령으로 검토 후 복구한다.

```sh
python3 /opt/viwork-box-performance-20261028/backend-deploy-r1/box_release_operator.py rollback --execute --intent-sha256 8f8fe259a235f8194e5db6254d6ca1b2b2fe5302ba2c89cc03a58a379de42f57
```

복구는 자기 Beta의 unit 설정·env·deps·검증 키와 소스가 허용된 old/new 범위인지 검사한다.
실패한 새 `.next`는 `failed.next`에 보존하고 검증된 기존 `.next`와 5개 소스를 복원한다.
새 archive가 없어도 검증된 백업을 통한 복구는 가능하다. 원래 환경 파일은 다시 쓰지 않는다.

다른 작업이 Main 또는 다른 unit을 바꿨다면 이를 덮어쓰지 않고 자기 Beta를 복원한 뒤
`ROLLED_BACK_WITH_FINDINGS`로 차이를 보고한다. Caddy fragment/main/env 또는 해당 unit 설정이
이번 작업의 허용 상태를 벗어나면 foreign Caddy를 덮어쓰기·reload하지 않는다. 이때도
자기 Beta의 파일·서비스·direct health/auth/read-only 경계 복원을 검증하고 외부 edge 상태는
미해결 finding으로 남긴다. `ROLLED_BACK_WITH_FINDINGS`는 전체 보호 상태가 원래와 같다는
판정이 아니다.

자기 Beta의 env/deps/key/unit 설정 또는 소스·백업이 허용 범위를 벗어나면 자동 덮어쓰기를
거부한다. `ROLLBACK_FAILED`와 최신 부분 이벤트를 보존하며 메인 운영자의 검토가 필요하다.
실패한 prepare와 기존 prepared/activation/backup을 덮어쓰는 retry·reset·삭제 명령은 없다.
성공·실패·구본·QA·release를 자동 정리하지 않는다.

## 검증과 남은 범위

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s deployment-box -p test_operator.py -v
```

로컬 검사 26개는 실제 임시 파일시스템과 가짜 명령 실행기를 사용한다. 잘못된 baseline,
누락 artifact, 다른 target/tool hash, symlink/경로 탈출/중복 archive, 다른 바이트의 static URL,
prepared drift, Beta 정지 전 env/unit drift, `.next` rename 사이 실패, readiness 실패 자동 복구,
부분 복구 영수증 보존, Main/다른 unit drift, 활성화 도중 foreign Caddy 변경 보존,
복구 전 foreign live build·기존 failed.next·broken symlink 거부, 기존 package 규격의
expanded bytes 합계 검증도 검사한다. 운영 명령과
원격 호스트 호출은 이 검사에서 실행하지 않는다.

운영 prepare·activation·실제 systemd 실패·실제 Caddy validate/reload·운영 rollback은 아직
실행하지 않았다. 실제 사용자 브라우저·Galaxy/One UI·Safari QA도 이 도구 검증 범위가 아니다.
`remote-release.py`의 범용 진입점이나 `scripts/deploy-beta.sh`는 실행하지 않는다.
