import { NextRequest, NextResponse } from 'next/server';
import {
  dbGetGroups, dbGetGroup, dbCreateGroup,
  dbGetDocs, dbGetDoc, dbCreateDoc, dbUpdateDoc, dbDeleteDoc,
  StrategyBlock,
} from '../strategy/_lib';

// ─── helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

function markdownToBlocks(text: string): StrategyBlock[] {
  const blocks: StrategyBlock[] = [];
  for (const line of text.split('\n')) {
    const t = line.trimEnd();
    if      (t.startsWith('### ')) blocks.push({ id: uid(), type: 'heading3', content: t.slice(4), checked: false });
    else if (t.startsWith('## '))  blocks.push({ id: uid(), type: 'heading2', content: t.slice(3), checked: false });
    else if (t.startsWith('# '))   blocks.push({ id: uid(), type: 'heading1', content: t.slice(2), checked: false });
    else if (t.startsWith('- '))   blocks.push({ id: uid(), type: 'bullet',   content: t.slice(2), checked: false });
    else if (/^\d+\.\s/.test(t))   blocks.push({ id: uid(), type: 'numbered', content: t.replace(/^\d+\.\s/, ''), checked: false });
    else if (t.startsWith('[x] ')) blocks.push({ id: uid(), type: 'todo',     content: t.slice(4), checked: true  });
    else if (t.startsWith('[ ] ') || t.startsWith('[] ')) blocks.push({ id: uid(), type: 'todo', content: t.replace(/^\[[ ]?\] /, ''), checked: false });
    else if (t === '---')          blocks.push({ id: uid(), type: 'divider',  content: '', checked: false });
    else if (t.startsWith('> '))   blocks.push({ id: uid(), type: 'callout',  content: t.slice(2), checked: false });
    else                           blocks.push({ id: uid(), type: 'paragraph', content: t, checked: false });
  }
  if (!blocks.length) blocks.push({ id: uid(), type: 'paragraph', content: '', checked: false });
  return blocks;
}

function blocksToMarkdown(blocks: StrategyBlock[]): string {
  return blocks.map(b => {
    switch (b.type) {
      case 'heading1': return `# ${b.content}`;
      case 'heading2': return `## ${b.content}`;
      case 'heading3': return `### ${b.content}`;
      case 'bullet':   return `- ${b.content}`;
      case 'numbered': return `1. ${b.content}`;
      case 'todo':     return `[${b.checked ? 'x' : ' '}] ${b.content}`;
      case 'divider':  return '---';
      case 'callout':  return `> ${b.content}`;
      default:         return b.content;
    }
  }).join('\n');
}

// ─── tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'strategy_list_groups',
    description: '전략 그룹 목록을 조회합니다.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'strategy_list_pages',
    description: '특정 그룹의 페이지 목록을 조회합니다.',
    inputSchema: { type: 'object', properties: { groupId: { type: 'string', description: '그룹 ID' } }, required: ['groupId'] },
  },
  {
    name: 'strategy_read_page',
    description: '페이지의 전체 내용을 마크다운 형식으로 읽습니다.',
    inputSchema: { type: 'object', properties: { pageId: { type: 'string', description: '페이지 ID' } }, required: ['pageId'] },
  },
  {
    name: 'strategy_write_page',
    description: '페이지 내용을 마크다운으로 작성합니다. 기존 내용을 완전히 교체합니다.\n\n지원 문법:\n- `# 제목` → H1\n- `## 제목` → H2\n- `### 제목` → H3\n- `- 항목` → 글머리\n- `1. 항목` → 번호 목록\n- `[ ] 항목` → 할 일\n- `[x] 항목` → 완료된 할 일\n- `---` → 구분선\n- `> 텍스트` → 콜아웃\n- 일반 텍스트 → 단락',
    inputSchema: { type: 'object', properties: { pageId: { type: 'string', description: '페이지 ID' }, content: { type: 'string', description: '마크다운 형식의 내용' } }, required: ['pageId', 'content'] },
  },
  {
    name: 'strategy_append_to_page',
    description: '페이지 끝에 내용을 추가합니다. 기존 내용은 유지됩니다.',
    inputSchema: { type: 'object', properties: { pageId: { type: 'string', description: '페이지 ID' }, content: { type: 'string', description: '추가할 마크다운 내용' } }, required: ['pageId', 'content'] },
  },
  {
    name: 'strategy_create_page',
    description: '그룹 안에 새 페이지를 만들고 내용을 작성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: '그룹 ID' },
        title:   { type: 'string', description: '페이지 제목' },
        content: { type: 'string', description: '초기 내용 (마크다운, 선택사항)' },
        emoji:   { type: 'string', description: '이모지 (선택사항, 기본값: 📝)' },
      },
      required: ['groupId', 'title'],
    },
  },
  {
    name: 'strategy_create_group',
    description: '새 전략 그룹을 만듭니다.',
    inputSchema: {
      type: 'object',
      properties: {
        name:  { type: 'string', description: '그룹 이름' },
        emoji: { type: 'string', description: '이모지 (선택사항, 기본값: 📁)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'strategy_update_page_title',
    description: '페이지 제목과 이모지를 수정합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: '페이지 ID' },
        title:  { type: 'string', description: '새 제목 (선택사항)' },
        emoji:  { type: 'string', description: '새 이모지 (선택사항)' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'strategy_delete_page',
    description: '페이지를 삭제합니다.',
    inputSchema: { type: 'object', properties: { pageId: { type: 'string', description: '페이지 ID' } }, required: ['pageId'] },
  },
];

// ─── input validation ────────────────────────────────────────────────────────
const MAX_TITLE  = 200;
const MAX_CONTENT = 50_000;
const MAX_NAME   = 100;

function requireString(args: Args, key: string, maxLen: number): string {
  const val = args[key];
  if (!val || typeof val !== 'string' || !val.trim()) throw new Error(`${key}은(는) 필수입니다.`);
  if (val.length > maxLen) throw new Error(`${key}은(는) ${maxLen}자 이하여야 합니다.`);
  return val.trim();
}

function optionalString(args: Args, key: string, maxLen: number): string | undefined {
  const val = args[key];
  if (!val) return undefined;
  if (typeof val !== 'string') throw new Error(`${key}이(가) 올바르지 않습니다.`);
  if (val.length > maxLen) throw new Error(`${key}은(는) ${maxLen}자 이하여야 합니다.`);
  return val.trim();
}

// ─── tool handler ─────────────────────────────────────────────────────────────
type Args = Record<string, string>;

async function handleTool(name: string, args: Args) {
  switch (name) {
    case 'strategy_list_groups': {
      const groups = await dbGetGroups();
      if (!groups.length) return { content: [{ type: 'text', text: '아직 그룹이 없습니다.' }] };
      const lines = await Promise.all(groups.map(async g => {
        const docs = await dbGetDocs(g.id);
        return `${g.emoji} **${g.name}** (id: \`${g.id}\`, 페이지 ${docs.length}개)`;
      }));
      return { content: [{ type: 'text', text: `## 전략 그룹 목록\n\n${lines.join('\n')}` }] };
    }

    case 'strategy_list_pages': {
      const groupId = requireString(args, 'groupId', 100);
      const [group, docs] = await Promise.all([dbGetGroup(groupId), dbGetDocs(groupId)]);
      if (!group) return { content: [{ type: 'text', text: `그룹을 찾을 수 없습니다: ${groupId}` }] };
      if (!docs.length) return { content: [{ type: 'text', text: `${group.emoji} **${group.name}** — 아직 페이지가 없습니다.` }] };
      const lines = docs.map(d => `${d.emoji} **${d.title}** (id: \`${d.id}\`, 수정: ${new Date(d.updatedAt).toLocaleDateString('ko-KR')})`);
      return { content: [{ type: 'text', text: `## ${group.emoji} ${group.name}\n\n${lines.join('\n')}` }] };
    }

    case 'strategy_read_page': {
      const pageId = requireString(args, 'pageId', 100);
      const [doc, groups] = await Promise.all([dbGetDoc(pageId), dbGetGroups()]);
      if (!doc) return { content: [{ type: 'text', text: `페이지를 찾을 수 없습니다: ${pageId}` }] };
      const group = groups.find(g => g.id === doc.groupId);
      const header = [
        `# ${doc.emoji} ${doc.title}`,
        `> 그룹: ${group ? `${group.emoji} ${group.name}` : doc.groupId}`,
        `> 마지막 수정: ${new Date(doc.updatedAt).toLocaleString('ko-KR')}`,
        '', '---', '',
      ].join('\n');
      return { content: [{ type: 'text', text: header + blocksToMarkdown(doc.blocks) }] };
    }

    case 'strategy_write_page': {
      const pageId = requireString(args, 'pageId', 100);
      const content = requireString(args, 'content', MAX_CONTENT);
      const doc = await dbUpdateDoc(pageId, { blocks: markdownToBlocks(content) });
      return { content: [{ type: 'text', text: `✅ **${doc.title}** 페이지가 업데이트되었습니다.` }] };
    }

    case 'strategy_append_to_page': {
      const pageId = requireString(args, 'pageId', 100);
      const content = requireString(args, 'content', MAX_CONTENT);
      const doc = await dbGetDoc(pageId);
      if (!doc) return { content: [{ type: 'text', text: `페이지를 찾을 수 없습니다: ${pageId}` }] };
      const existing = doc.blocks.filter((b, i) =>
        !(i === doc.blocks.length - 1 && b.type === 'paragraph' && !b.content)
      );
      const updated = await dbUpdateDoc(pageId, { blocks: [...existing, ...markdownToBlocks(content)] });
      return { content: [{ type: 'text', text: `✅ **${updated.title}** 페이지에 내용이 추가되었습니다.` }] };
    }

    case 'strategy_create_page': {
      const groupId = requireString(args, 'groupId', 100);
      const title = requireString(args, 'title', MAX_TITLE);
      const content = optionalString(args, 'content', MAX_CONTENT);
      const emoji = optionalString(args, 'emoji', 10) || '📝';
      const group = await dbGetGroup(groupId);
      if (!group) return { content: [{ type: 'text', text: `그룹을 찾을 수 없습니다: ${groupId}` }] };
      const doc = await dbCreateDoc({
        id: uid(),
        groupId,
        title,
        emoji,
        blocks: content
          ? markdownToBlocks(content)
          : [{ id: uid(), type: 'paragraph', content: '', checked: false }],
        createdAt: '',
        updatedAt: '',
      });
      return { content: [{ type: 'text', text: `✅ 새 페이지 **${doc.emoji} ${doc.title}** 가 생성되었습니다.\n- id: \`${doc.id}\`\n- 그룹: ${group.emoji} ${group.name}` }] };
    }

    case 'strategy_create_group': {
      const name = requireString(args, 'name', MAX_NAME);
      const emoji = optionalString(args, 'emoji', 10) || '📁';
      const group = await dbCreateGroup({ id: uid(), name, emoji });
      return { content: [{ type: 'text', text: `✅ 새 그룹 **${group.emoji} ${group.name}** 이 생성되었습니다.\n- id: \`${group.id}\`` }] };
    }

    case 'strategy_update_page_title': {
      const pageId = requireString(args, 'pageId', 100);
      const patch: Partial<{ title: string; emoji: string }> = {};
      const title = optionalString(args, 'title', MAX_TITLE);
      const emoji = optionalString(args, 'emoji', 10);
      if (title) patch.title = title;
      if (emoji) patch.emoji = emoji;
      const doc = await dbUpdateDoc(pageId, patch);
      return { content: [{ type: 'text', text: `✅ 페이지가 **${doc.emoji} ${doc.title}** 로 업데이트되었습니다.` }] };
    }

    case 'strategy_delete_page': {
      const pageId = requireString(args, 'pageId', 100);
      const doc = await dbGetDoc(pageId);
      if (!doc) return { content: [{ type: 'text', text: `페이지를 찾을 수 없습니다: ${pageId}` }] };
      await dbDeleteDoc(pageId);
      return { content: [{ type: 'text', text: `✅ **${doc.emoji} ${doc.title}** 페이지가 삭제되었습니다.` }] };
    }

    default:
      throw new Error(`알 수 없는 도구: ${name}`);
  }
}

// ─── defense in depth: proxy 우회 시에도 라우트 자체에서 키 재검증 + IP rate limit + audit
const RL_WINDOW_MS = 60_000;
const RL_MAX_PER_WINDOW = 60;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function takeRateToken(clientKey: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientKey);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(clientKey, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  if (entry.count >= RL_MAX_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

type AuthOk = { ok: true; clientKey: string };
type AuthFail = { ok: false; status: number; message: string };

function authorizeMcp(req: NextRequest): AuthOk | AuthFail {
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.API_SECRET_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return { ok: false, status: 401, message: 'unauthorized' };
  }
  const clientKey = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!takeRateToken(clientKey)) {
    return { ok: false, status: 429, message: 'rate limit exceeded (60 req/min)' };
  }
  return { ok: true, clientKey };
}

// ─── route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = authorizeMcp(req);
  if (!auth.ok) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: auth.message } },
      { status: auth.status },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  const { method, params, id } = body;

  // audit — 호출 출처·메서드 추적용. 운영 시 Supabase audit 테이블/Sentry 이관 권장.
  console.info(`[mcp] ${new Date().toISOString()} from=${auth.clientKey} method=${method ?? 'unknown'} id=${id ?? 'notif'}`);

  // Notifications (no id) don't need a response
  if (id === undefined || id === null) {
    return new NextResponse(null, { status: 202 });
  }

  const ok = (result: unknown) =>
    NextResponse.json({ jsonrpc: '2.0', id, result });
  const err = (code: number, message: string) =>
    NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } });

  try {
    if (method === 'initialize') {
      return ok({
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'strategy', version: '2.0.0' },
        capabilities: { tools: {} },
      });
    }

    if (method === 'tools/list') {
      return ok({ tools: TOOLS });
    }

    if (method === 'tools/call') {
      const result = await handleTool(params.name, params.arguments || {});
      return ok(result);
    }

    return err(-32601, 'Method not found');
  } catch (e) {
    return err(-32603, e instanceof Error ? e.message : '내부 오류');
  }
}

// Stateless HTTP transport: GET not supported
export function GET() {
  return new NextResponse('MCP Streamable HTTP — POST only', { status: 405 });
}
