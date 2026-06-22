/**
 * Amazon SES SMTP 메일러 — 비모 ERP 발송 백본.
 * ★ 서버 전용 (nodemailer = Node 모듈). 라우트 핸들러/서버 액션에서만 import.
 *
 * 도메인 vi-mo.kr 은 SES 에서 DKIM 인증 완료 → @vi-mo.kr 주소로 서명 발송 가능.
 * From 은 반드시 인증 도메인(vi-mo.kr)이어야 DKIM 정렬로 DMARC 통과한다.
 *  - 로그인 유저 이메일이 @<MAIL_FROM 도메인> 이면 그 주소로 발송(본인 명의)
 *  - 아니면 MAIL_FROM_ADDRESS 로 폴백, Reply-To 에 유저 실제 이메일을 넣어 회신은 본인에게
 *
 * env:
 *   SES_SMTP_HOST   = email-smtp.ap-northeast-2.amazonaws.com
 *   SES_SMTP_PORT   = 587
 *   SES_SMTP_USER   = (SES SMTP 자격증명)
 *   SES_SMTP_PASS   = (SES SMTP 자격증명 — 비밀)
 *   MAIL_FROM_ADDRESS = noreply@vi-mo.kr (또는 대표 발신 주소)
 *   MAIL_FROM_NAME    = 비모
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** SMTP 설정이 모두 갖춰졌는지 — 미설정 시 발송 라우트는 503 으로 막는다. */
export function isMailConfigured(): boolean {
  return Boolean(
    process.env.SES_SMTP_HOST &&
      process.env.SES_SMTP_USER &&
      process.env.SES_SMTP_PASS &&
      process.env.MAIL_FROM_ADDRESS,
  );
}

let _transporter: Transporter | null = null;
function transporter(): Transporter {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: process.env.SES_SMTP_HOST,
    port: Number(process.env.SES_SMTP_PORT || 587),
    secure: false, // 587 = STARTTLS (465 면 true)
    auth: {
      user: process.env.SES_SMTP_USER,
      pass: process.env.SES_SMTP_PASS,
    },
  });
  return _transporter;
}

/**
 * 발신자 결정. From 도메인은 항상 인증 도메인(MAIL_FROM_ADDRESS 의 도메인)으로 강제.
 * 유저 이메일이 같은 도메인이면 본인 명의로, 아니면 대표 주소로 발송 + Reply-To=유저.
 */
export function resolveSender(user: { email?: string | null; name?: string | null }): {
  senderEmail: string;
  senderName: string;
  replyTo: string;
} {
  const fromAddr = (process.env.MAIL_FROM_ADDRESS || '').trim();
  const domain = fromAddr.split('@')[1]?.toLowerCase() || '';
  const userEmail = (user.email || '').trim().toLowerCase();
  const useUserAddr = Boolean(domain) && userEmail.endsWith(`@${domain}`);

  const senderEmail = useUserAddr ? userEmail : fromAddr;
  const senderName = (user.name || process.env.MAIL_FROM_NAME || '').trim();
  const replyTo = userEmail || senderEmail;
  return { senderEmail, senderName, replyTo };
}

/**
 * 실제 발송. 모든 수신자 거부 시 throw(라우트 502). 일부만 거부되면 resolve하며
 * accepted/rejected를 반환 — 라우트가 부분 실패를 사용자에게 알릴 수 있게 한다.
 */
export async function sendMail(opts: {
  from: string; // "이름 <addr>" 또는 addr
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text?: string; // plain-text 대체본 (도달률↑). 없으면 html 에서 자동 생성.
}): Promise<{ accepted: string[]; rejected: string[] }> {
  const text =
    opts.text ??
    opts.html
      .replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  const info = await transporter().sendMail({
    from: opts.from,
    to: opts.to.join(', '),
    cc: opts.cc && opts.cc.length > 0 ? opts.cc.join(', ') : undefined,
    bcc: opts.bcc && opts.bcc.length > 0 ? opts.bcc.join(', ') : undefined,
    replyTo: opts.replyTo,
    subject: opts.subject,
    html: opts.html,
    text: text || undefined,
  });
  const norm = (arr: unknown): string[] =>
    Array.isArray(arr)
      ? arr.map((a) => (typeof a === 'string' ? a : (a as { address?: string })?.address || '')).filter(Boolean)
      : [];
  return { accepted: norm(info.accepted), rejected: norm(info.rejected) };
}
