# 비박스 백엔드 적용 — 2026-10-28

세온님의 “준비한 프런트는 아직 건들지말고 백엔드만 진행해 봐” 지시에 따라 **비박스 베타 백엔드만 적용했다.** 이후 “인증 완료했어” 응답을 받고 SFF 접속을 새로 확인했다. 준비된 프런트 후보는 사용자 보류 상태로 유지했다.

적용 release는 `20261028-box-perf-r1`, 실제 Next build ID는 `-5ciigDEj7n9M4ZIwVSHg`다. 대상은 CT112 `/opt/vibox-beta`, `vibox-beta.service`, `127.0.0.1:4201`이다. 검증된 988개 소스 가운데 변경한 실행 코드3개·검사2개와 컴파일된 `.next`를 반영했다. 메뉴 DTO에 쓰이지 않는 폴더 조회를 생략하고, 빈 목록 권한 검사에서 불필요한 membership/ownership 조회를 생략하는 변경이다.

새 읽기 전용 inspect에서 실제 기존 소스·빌드·환경·의존성·서비스·Caddy가 고정 기준과 일치했다. prepare는 구본과 바뀔 파일을 백업하고, 새 산출물과 이전 static213개를 검증했으며 전체 Caddy validate를 통과했다. 2026-10-28 11:07 UTC에 activate가 성공했고 새로운 fresh snapshot도 `ACTIVE` 영수증과 정확히 일치했다. 배포 호환을 위해 Caddy의 logout/signup action ID2개만 갱신했다.

| 확인 항목 | 실제 결과 |
| --- | --- |
| 후보988개 소스·빌드·compiled runtime 결속 | PASS |
| Beta health | HTTP200 |
| 인증 없는 gateway·Stream·direct write 요청 | HTTP401 |
| 공개 internal GET/HEAD/POST·write 경로 | HTTP403 |
| Main 전체 소스·빌드·env·의존성·서비스·unit | 변경 없음 |
| Beta env·의존성·검증 키·unit 설정 | 변경 없음 |
| Caddy | 허용한 action ID2개 외 바이트 보존 |
| 기존 static | 213개 해시 보존 |
| 구본·변경 소스·Caddy 백업 | 해시 검증 통과, 실제 rollback은 미실행 |
| 공개 Main health | 적용 전후 HTTP200 |
| 공개 Box 루트 | 적용 전후 `/files/home` 307 |
| 공개 Vi.WORK frontend health | 적용 전후 HTTP200, `20261028-front-perf-r2` |

프런트 source1,082개와 준비한 operator는 이전 해시와 같고, 준비 intent의 `productionApproved`는 계속 false다. 이번 실행에서 CT111 명령을 실행하지 않았다. 프런트 후보 `20261028-front-box-perf-r3`는 수정·활성화하지 않았다.

기존 Linux backend378검사와 operator26검사는 source/tool hash가 같아 재사용했다. 실제 배포 inspect·prepare·activate·후속 snapshot·공개 응답은 이번 실행에서 새로 확인했다. `/root/performance_review`가 로컬로 전달된 영수증의 결속과 허용 변경·보호 상태를 독립 검수했다. 독립 검수자가 운영 명령을 실행했다는 의미는 아니다.

실제 사용자 계정의 파일 목록·공유·업로드 종단 QA, 운영 전후 지연 비교, 운영 rollback, Galaxy/One UI·Safari는 미실행이다. 앞선 프런트 후보의12–13% 화면 준비 시간 개선은 이번 백엔드 적용 효과로 합산하지 않는다. DB 마이그레이션·직접 데이터 변경·사용자 스토리지 쓰기는 실행하지 않았다.

실행 순서·반환값은 `*-command.json`, 전후 보호 상태는 `ct112-prepared.json`·`ct112-after.json`, 허용 변화는 `protected-state-diff.json`, 최종 판정은 `result.json`과 `independent-review.json`을 참조한다. 원본 QA는 result의 `originalEvidence` 경로에 보존했다. 구본과 실패 시도, 기존 릴리스, HANDOFF, 공용 Harness의 다른 작업 상태는 변경하지 않았다.
