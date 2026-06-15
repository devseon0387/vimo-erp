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

const MAX_EMAILS = 50;

export function isInboundConfigured(): boolean {
  if (process.env.INBOUND_S3_BUCKET && process.env.INBOUND_AWS_ACCESS_KEY_ID) return true;
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
type RawItem = { uid: string; raw: Buffer };

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

  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 300 }),
  );
  const objects = (listed.Contents || [])
    // 폴더 마커 + SES가 권한확인용으로 넣는 설정 알림 객체 제외
    .filter((o) => o.Key && !o.Key.endsWith('/') && !o.Key.includes('AMAZON_SES_SETUP_NOTIFICATION'))
    .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
    .slice(0, MAX_EMAILS);

  const items = await Promise.all(
    objects.map(async (o) => {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: o.Key! }));
      const raw = Buffer.from(await res.Body!.transformToByteArray());
      return { uid: o.Key!, raw };
    }),
  );
  return items;
}

function listRawFromLocal(dir: string): RawItem[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.eml'))
    .map((f) => ({ uid: f, raw: fs.readFileSync(path.join(dir, f)) }));
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

async function parseRaw(raw: Buffer, uid: string): Promise<InboundEmail> {
  const p = await simpleParser(raw);
  const fromAddr = Array.isArray(p.from?.value) ? p.from!.value[0] : undefined;
  const text = p.text || '';
  const html = typeof p.html === 'string' ? p.html : '';
  const preview = (text || html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  const toText = (p.to && !Array.isArray(p.to) ? p.to.text : '') || '';
  const ccText = (p.cc && !Array.isArray(p.cc) ? p.cc.text : '') || '';
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
    date: (p.date instanceof Date ? p.date : new Date()).toISOString(),
    preview,
    text,
    html,
  };
}

/** 받은 메일 목록 (최신순). 소스 미설정이면 빈 배열. */
export async function getInboundEmails(): Promise<InboundEmail[]> {
  let raws: RawItem[] = [];
  if (process.env.INBOUND_S3_BUCKET && process.env.INBOUND_AWS_ACCESS_KEY_ID) {
    raws = await listRawFromS3();
  } else {
    const dir = localSampleDir();
    if (dir) raws = listRawFromLocal(dir);
  }
  const parsed = await Promise.all(
    raws.map((r) =>
      parseRaw(r.raw, r.uid).catch(() => null),
    ),
  );
  return parsed
    .filter((e): e is InboundEmail => e !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_EMAILS);
}
