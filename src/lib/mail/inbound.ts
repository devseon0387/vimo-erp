/**
 * 받은 메일 수신 — Amazon SES Inbound → S3 원본(MIME)을 읽어 파싱.
 * ★ 서버 전용 (mailparser·@aws-sdk·fs = Node). 라우트 핸들러에서만 import.
 *
 * 소스 추상화:
 *  - S3 설정(INBOUND_S3_BUCKET + 키)이 있으면 → S3 버킷에서 원본 목록·조회
 *  - 없으면 → 로컬 `_inbound_samples/*.eml` (개발/테스트 폴백)
 * MVP는 DB 저장 없이 매 조회 시 S3에서 읽어 파싱(저용량). 읽음상태·성능 캐시는 후속.
 *
 * env:
 *   INBOUND_S3_BUCKET          = 수신 메일 S3 버킷
 *   INBOUND_S3_REGION          = ap-northeast-2 (기본)
 *   INBOUND_S3_PREFIX          = inbound/ (선택)
 *   INBOUND_AWS_ACCESS_KEY_ID  = S3 읽기 IAM 키
 *   INBOUND_AWS_SECRET_ACCESS_KEY
 */
import fs from 'node:fs';
import path from 'node:path';
import { simpleParser } from 'mailparser';

export interface InboundEmail {
  id: string;
  uid: string; // 고유키 (S3 객체키 또는 샘플 파일명)
  from: string;
  fromName: string;
  to: string;
  cc: string;
  /** to+cc의 수신 주소(소문자) — 주소 디렉토리 분류 기준 */
  toAddresses: string[];
  subject: string;
  date: string; // ISO
  preview: string;
  text: string;
  html: string;
}

// 받은편지함 표시 상한. 근본 해결(수신 시 DB 적재 + 서버 페이지네이션)은 후속 부채.
const MAX_EMAILS = 200;
const MAX_LIST_PAGES = 50; // S3 목록 페이지네이션 안전장치(최대 ~5만 객체까지 스캔)

function s3Configured(): boolean {
  return Boolean(
    process.env.INBOUND_S3_BUCKET &&
      process.env.INBOUND_AWS_ACCESS_KEY_ID &&
      process.env.INBOUND_AWS_SECRET_ACCESS_KEY,
  );
}

export function isInboundConfigured(): boolean {
  // SECRET까지 있어야 configured 처리 — 키 일부만 있으면 '미설정' 배너가 뜨게 해서
  // (자격증명 누락이 받은함 502 "네트워크 오류"로 오안내되는 것을 방지)
  if (s3Configured()) return true;
  // 로컬 샘플 폴백이 있으면 개발 중 configured 취급
  return localSampleDir() !== null;
}

function localSampleDir(): string | null {
  const dir = path.join(process.cwd(), '_inbound_samples');
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  } catch {
    /* ignore */
  }
  return null;
}

// ─── 원본(raw MIME) 소스 ────────────────────────────────────────
type RawItem = { uid: string; raw: Buffer; lastModified?: Date };

async function listRawFromS3(): Promise<RawItem[]> {
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const bucket = process.env.INBOUND_S3_BUCKET!;
  const prefix = process.env.INBOUND_S3_PREFIX || '';
  const client = new S3Client({
    region: process.env.INBOUND_S3_REGION || 'ap-northeast-2',
    credentials: {
      accessKeyId: process.env.INBOUND_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.INBOUND_AWS_SECRET_ACCESS_KEY!,
    },
  });

  // ⚠️ ListObjectsV2는 키를 '사전순'으로 반환하고 SES Inbound 키는 랜덤(메시지ID)이라,
  // 단일 호출 + slice 로는 최신 메일이 누락된다. 전 페이지를 ContinuationToken으로 모아
  // 메타데이터(LastModified)로 정렬한 뒤 최신 MAX_EMAILS개의 본문만 내려받는다.
  type Meta = { key: string; lastModified?: Date };
  const metas: Meta[] = [];
  let token: string | undefined;
  let pages = 0;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000, ContinuationToken: token }),
    );
    for (const o of listed.Contents || []) {
      // 폴더 마커 + SES가 권한확인용으로 넣는 설정 알림 객체 제외
      if (o.Key && !o.Key.endsWith('/') && !o.Key.includes('AMAZON_SES_SETUP_NOTIFICATION')) {
        metas.push({ key: o.Key, lastModified: o.LastModified });
      }
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    pages += 1;
  } while (token && pages < MAX_LIST_PAGES);
  if (token) {
    console.warn(
      `[mail] inbound S3 객체가 ~${MAX_LIST_PAGES * 1000}개를 초과 — 사전순 앞쪽 ~${MAX_LIST_PAGES * 1000}개만 스캔되어 최신 일부가 누락될 수 있음. 수신 시 DB 적재로 전환 필요.`,
    );
  }

  metas.sort((a, b) => (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0));
  const top = metas.slice(0, MAX_EMAILS);

  // 본문 다운로드: 동시성 제한(메모리/연결 버스트 방지) + 개별 실패 격리
  // (한 객체 다운로드 실패가 받은편지함 전체를 502로 만들지 않도록 — 파싱 단계와 동일한 격리).
  const items: RawItem[] = [];
  const CHUNK = 8;
  for (let i = 0; i < top.length; i += CHUNK) {
    const got = await Promise.all(
      top.slice(i, i + CHUNK).map(async (m): Promise<RawItem | null> => {
        try {
          const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: m.key }));
          const raw = Buffer.from(await res.Body!.transformToByteArray());
          return { uid: m.key, raw, lastModified: m.lastModified };
        } catch (e) {
          console.error('[mail] inbound 객체 다운로드 실패:', m.key, e instanceof Error ? e.message : e);
          return null;
        }
      }),
    );
    for (const g of got) if (g) items.push(g);
  }
  return items;
}

function listRawFromLocal(dir: string): RawItem[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.eml'))
    .map((f) => {
      const fp = path.join(dir, f);
      let lastModified: Date | undefined;
      try { lastModified = fs.statSync(fp).mtime; } catch { /* ignore */ }
      return { uid: f, raw: fs.readFileSync(fp), lastModified };
    });
}

// ─── 파싱 ────────────────────────────────────────────────────────
type AddrObj = { value?: { address?: string }[]; text?: string };
function collectAddresses(v: AddrObj | AddrObj[] | undefined): string[] {
  const objs = !v ? [] : Array.isArray(v) ? v : [v];
  return objs
    .flatMap((o) => o.value ?? [])
    .map((a) => (a.address || '').trim().toLowerCase())
    .filter(Boolean);
}

async function parseRaw(raw: Buffer, uid: string, lastModified?: Date): Promise<InboundEmail> {
  const p = await simpleParser(raw);
  const fromAddr = Array.isArray(p.from?.value) ? p.from!.value[0] : undefined;
  const text = p.text || '';
  const html = typeof p.html === 'string' ? p.html : '';
  const preview = (text || html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  // To/Cc 헤더가 배열(중복 헤더 라인)로 와도 표시되도록 정규화
  const toList = Array.isArray(p.to) ? p.to : p.to ? [p.to] : [];
  const ccList = Array.isArray(p.cc) ? p.cc : p.cc ? [p.cc] : [];
  const toText = toList.map((a) => a.text).filter(Boolean).join(', ');
  const ccText = ccList.map((a) => a.text).filter(Boolean).join(', ');
  const toAddresses = [
    ...new Set([
      ...collectAddresses(p.to as AddrObj | AddrObj[] | undefined),
      ...collectAddresses(p.cc as AddrObj | AddrObj[] | undefined),
    ]),
  ];
  return {
    id: uid,
    uid,
    from: fromAddr?.address || '',
    fromName: fromAddr?.name || '',
    to: toText,
    cc: ccText,
    toAddresses,
    subject: p.subject || '(제목 없음)',
    // Date 헤더가 없으면 S3 수신시각(LastModified)으로 폴백 — new Date()(현재시각)면 헤더없는 메일이 항상 최상단 고정됨
    date: (p.date instanceof Date ? p.date : lastModified instanceof Date ? lastModified : new Date()).toISOString(),
    preview,
    text,
    html,
  };
}

/** 받은 메일 목록 (최신순). 소스 미설정이면 빈 배열. */
export async function getInboundEmails(): Promise<InboundEmail[]> {
  let raws: RawItem[] = [];
  if (s3Configured()) {
    raws = await listRawFromS3();
  } else {
    const dir = localSampleDir();
    if (dir) raws = listRawFromLocal(dir);
  }
  const parsed = await Promise.all(
    raws.map((r) =>
      parseRaw(r.raw, r.uid, r.lastModified).catch((e) => {
        // 파싱 실패한 메일을 조용히 버리지 않고 최소한 로그로 남긴다(진단 가능하도록)
        console.error('[mail] inbound 파싱 실패:', r.uid, e instanceof Error ? e.message : e);
        return null;
      }),
    ),
  );
  return parsed
    .filter((e): e is InboundEmail => e !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_EMAILS);
}
