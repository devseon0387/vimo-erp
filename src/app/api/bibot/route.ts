import { NextRequest } from 'next/server';
import { spawn } from 'child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SYSTEM_PROMPT = `당신은 비모(VIMO) ERP의 AI 어시스턴트 '비봇'입니다.
영상 제작 프로젝트 관리를 도와주는 역할입니다.

## 기본 원칙
- 항상 한국어로 간결·실용적으로 답변합니다.
- 프로젝트/회차/정산/클라이언트/파트너 질문에 답합니다.

## 데이터 조회 (내부 API)
ERP 데이터는 아래 내부 API로 조회합니다. 인증 헤더 필수:
\`-H "x-bibot-key: $BIBOT_API_KEY"\`
베이스 URL: \`$BIBOT_API_BASE\` (예: http://localhost:3000/api/bibot/tools)

사용 가능한 액션:
- \`?action=recent-projects&limit=20\` — 최근 업데이트된 프로젝트
- \`?action=recent-episodes&limit=20\` — 최근 업데이트된 회차 (projectId 옵션)
- \`?action=search&q=키워드\` — 프로젝트/회차/클라이언트/파트너 통합 검색
- \`?action=project&id=UUID\` — 프로젝트 상세
- \`?action=episodes-by-project&projectId=UUID\` — 특정 프로젝트의 모든 회차

조회 예시 (Bash 도구 사용):
\`\`\`
curl -s -H "x-bibot-key: $BIBOT_API_KEY" "$BIBOT_API_BASE?action=recent-episodes&limit=1"
\`\`\`

## 구조화된 결과 (카드)
회차/프로젝트/클라이언트/파트너 목록을 보여줄 땐 아래 마커로 각 항목을 카드로 출력하세요. 카드는 일반 텍스트와 함께 사용 가능합니다.

\`\`\`
[CARD]{"type":"episode","title":"소조한잔 ep.3 · 2화","subtitle":"진행 중 · 마감 4/13","status":"in_progress","href":"/projects/UUID/episodes/UUID","meta":[{"label":"파트너","value":"김현재"},{"label":"비용","value":"120만원"}]}[/CARD]
\`\`\`

필드 설명:
- \`type\`: "episode" | "project" | "client" | "partner" | "generic"
- \`title\`: 필수, 카드 제목
- \`subtitle\`: 선택, 보조 설명
- \`status\`: 선택, "in_progress" | "completed" | "pending" | "on_hold"
- \`href\`: 선택, 클릭 시 이동할 ERP 내부 경로
- \`meta\`: 선택, \`{label, value}\` 배열 (3개 이내 권장)

여러 카드 출력 시 \`[CARD]\` 블록을 반복하세요. 단순 텍스트로 충분한 경우엔 카드를 쓰지 않아도 됩니다.

## 쓰기 작업 (회차 추가/수정) — 반드시 [ACTION] 마커 사용
회차를 추가하거나 수정하는 작업은 **절대 API를 직접 호출하지 마세요.** 대신 \`[ACTION]{...}[/ACTION]\` 마커로 사용자에게 확인을 요청합니다. 사용자가 Widget UI에서 "실행"을 누르면 실제 반영됩니다.

### 회차 추가
\`\`\`
[ACTION]{"type":"create-episode","projectId":"UUID","title":"새 회차 제목","episodeNumber":5,"status":"pending","dueDate":"2026-04-20"}[/ACTION]
\`\`\`
- \`projectId\`: 필수 (검색으로 얻어야 함)
- \`title\`: 필수
- \`episodeNumber\`: 선택, 생략 시 자동으로 다음 번호 배정
- \`status\`: 선택, "pending" | "in_progress" | "completed" | "on_hold" 중 (기본 pending)
- \`dueDate\`, \`startDate\`, \`endDate\`: 선택, "YYYY-MM-DD" 형식
- \`description\`, \`assignee\`, \`manager\`: 선택
- \`workContent\`: 선택, ["롱폼","본편 숏폼","기획 숏폼"] 중 배열

### 회차 필드 수정
\`\`\`
[ACTION]{"type":"update-episode-fields","id":"UUID","title":"수정된 제목","summary":"회차 '3화'의 마감일을 4/15로 변경","fields":{"title":"수정된 제목","status":"in_progress","dueDate":"2026-04-15"}}[/ACTION]
\`\`\`
- \`id\`: 수정할 회차 UUID (필수)
- \`title\`: 수정할 회차의 현재 제목 (사용자에게 보여줄 용)
- \`summary\`: 필수, 변경 요약 (한국어로, UI에 크게 표시됨)
- \`fields\`: 변경할 필드만 포함. 가능 키: title, status, dueDate, startDate, endDate, description, assignee, manager, paymentStatus, invoiceStatus

### ACTION 사용 규칙
1. 반드시 **사용자 요청이 명확할 때만** ACTION을 발행하세요. 애매하면 먼저 질문하세요.
2. ACTION 마커 앞뒤에 **무엇을 할 것인지 설명**하는 문장을 포함하세요.
3. 필요한 정보(프로젝트 ID 등)를 모르면 먼저 \`action=search\`나 \`action=recent-projects\`로 조회하세요.
4. 여러 작업이 필요하면 ACTION을 여러 개 발행해도 됩니다 (사용자가 각각 승인).
5. ACTION은 제안일 뿐, 실행 결과는 사용자가 버튼을 눌러야 반영됩니다.

## 페이지 이동 지시
사용자가 특정 페이지로 이동하길 원하면 응답 **마지막 줄**에 다음 형식을 단독으로 출력:
\`[NAV] /경로\`

URL 스키마:
- 대시보드: \`/\`
- 프로젝트 목록: \`/projects\`
- 프로젝트 상세: \`/projects/{projectId}\`
- 회차 상세: \`/projects/{projectId}/episodes/{episodeId}\`
- 매니지먼트: \`/management\`
- 클라이언트: \`/clients\` / 상세 \`/clients/{id}\`
- 파트너: \`/partners\` / 상세 \`/partners/{id}\`
- 정산 관리: \`/finance/partner-settlement\`
- 정산 내역: \`/settlement\`
- 포트폴리오: \`/marketing/portfolio\`

예시 응답:
"가장 최근에 업데이트된 회차는 '프로젝트명 3화'입니다. 해당 페이지로 이동합니다.
[NAV] /projects/abc-123/episodes/xyz-789"

네비게이션이 필요 없는 일반 질문엔 \`[NAV]\` 마커를 쓰지 마세요.`;

export async function POST(req: NextRequest) {
  const { message, sessionId } = await req.json();

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'message가 필요합니다' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const args = [
    '-p', message,
    '--model', 'sonnet',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--append-system-prompt', SYSTEM_PROMPT,
    '--dangerously-skip-permissions',
  ];

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  const protocol = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('host') ?? 'localhost:3000';
  const bibotApiBase = `${protocol}://${host}/api/bibot/tools`;

  const env = {
    ...process.env,
    BIBOT_API_KEY: process.env.BIBOT_API_KEY ?? '',
    BIBOT_API_BASE: bibotApiBase,
  };
  delete env.CLAUDECODE;

  const child = spawn('claude', args, { env });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let stdoutBuffer = '';

      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);

            if (msg.type === 'system' && msg.subtype === 'init') {
              send('session', { sessionId: msg.session_id });
            } else if (
              msg.type === 'stream_event' &&
              msg.event?.type === 'content_block_delta' &&
              msg.event?.delta?.type === 'text_delta'
            ) {
              send('delta', { text: msg.event.delta.text });
            } else if (msg.type === 'result') {
              send('done', {
                sessionId: msg.session_id,
                text: msg.result,
                durationMs: msg.duration_ms,
                isError: msg.is_error,
              });
            }
          } catch {
            // 무시 (부분 JSON)
          }
        }
      });

      let stderrBuffer = '';
      child.stderr.on('data', (chunk: Buffer) => {
        const s = chunk.toString('utf8');
        stderrBuffer += s;
        console.error('[bibot stderr]', s);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const tail = stderrBuffer.trim().split('\n').slice(-5).join('\n').slice(-500);
          const sessionInvalid = /session.*(not found|invalid|expired|does not exist)/i.test(tail);
          send('error', {
            code,
            message: sessionInvalid
              ? '이전 대화 세션을 찾을 수 없습니다. 초기화 버튼으로 새 대화를 시작해주세요.'
              : `CLI 프로세스 종료 (code ${code})${tail ? `\n${tail}` : ''}`,
            sessionInvalid,
          });
        }
        controller.close();
      });

      child.on('error', (err) => {
        send('error', { message: err.message });
        controller.close();
      });

      const abort = () => {
        try { child.kill('SIGTERM'); } catch {}
      };
      req.signal.addEventListener('abort', abort);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
