# 거대 페이지 리팩토링 로드맵

작성일: 2026-04-23

## 현황

| 파일 | 라인 수 | 주요 책임 |
|---|---|---|
| `src/app/(dashboard)/projects/[id]/page.tsx` | **2905** (원 2940) | 프로젝트 상세, 편집, 파트너/매니저, 회차 CRUD, 체크리스트 모달 |
| `src/app/(dashboard)/projects/[id]/episodes/[episodeId]/page.tsx` | **2706** | 회차 상세, 작업 단계, 예산 계산, 체크리스트, 자료 관리 |

## 완료된 추출 (1차)

- [x] `StatusBadge`, `EpisodeStatusBadge` → `projects/[id]/StatusBadges.tsx` (35줄 분리)

## 권장 추출 순서 (다음 단계)

### Phase 1 — 순수 UI 컴포넌트 (위험 낮음)

프로젝트 페이지:
- [ ] **`ProjectEditModal`** — 편집 모달 JSX 및 로컬 폼 상태 (`tempWorkTypeCost`, `tempTotalAmount` 등) → `projects/[id]/ProjectEditModal.tsx`
- [ ] **`WorkTypeBudgetEditor`** — 작업 유형별 비용 입력 표 (현재 `updateTempWorkTypeCost` 등 포함) → 같은 폴더 내
- [ ] **`EpisodeInlineEditor`** — 인라인 회차 편집 행 (line 1270, 1571 두 곳에서 비슷한 로직 중복)

회차 페이지:
- [ ] **`WorkStepList`** — 작업 단계 UI
- [ ] **`EpisodeAssetsSection`** — 자료(이미지·링크) 관리 영역

### Phase 2 — 커스텀 훅 (중간 위험)

- [ ] **`useProjectData(projectId)`** — `loadData`, `project`, `clients`, `partners`, `episodes` 상태를 묶음
- [ ] **`useEpisodeActions(project)`** — `handleEpisodeStatusChange`, `handleAddEpisode`, `handleDeleteEpisode` 묶음
- [ ] **`useProjectPartners(project)`** — 파트너 추가/삭제 + 매니저 로직
- [ ] **`useProjectEdit(project)`** — 편집 모달용 임시 상태 + save 로직

### Phase 3 — 상태 기계·도메인 로직 (위험 큼)

- [ ] **`lib/project/budget.ts`** — `updateTempWorkTypeCost`, `updateTempTotalAmount`, 총액 계산 등
- [ ] **`lib/project/episode.ts`** — 회차 상태 전이 규칙, bulk update 로직

## 진행 원칙

1. **각 추출마다 별도 커밋** — 한 번에 하나씩, diff 검토 용이하게
2. **타입 체크 필수** — `npx tsc --noEmit` 매번 확인
3. **UI 회귀 테스트** — 실 브라우저에서 주요 플로우 수동 확인 (정산·회차 수정·편집 모달)
4. **테스트 커버리지 없음을 감안** — 작게 쪼개서 한 번에 바꾸는 영역 최소화

## 왜 한 번에 다 안 했나

- 두 파일 합쳐 5600+라인에 30+ useState, 20+ 핸들러, 복잡한 모달 중첩
- 테스트 커버리지 부재 → 대규모 이동은 회귀 위험 ×
- 추출은 **한 단위씩 + 수동 확인**이 안전. 주말 한 번씩 Phase 1 항목 하나를 떼내는 식이 현실적

## 참고 지표 (리팩토링 목표)

- [ ] `projects/[id]/page.tsx` < **800줄**
- [ ] `episodes/[episodeId]/page.tsx` < **800줄**
- [ ] 각 커스텀 훅 < 150줄
- [ ] 각 추출 컴포넌트 < 300줄
