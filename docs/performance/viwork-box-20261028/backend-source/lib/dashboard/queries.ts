import { and, desc, eq, gte, inArray, ne, sql, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  users,
  fileUploads,
  comments,
  shareLinks,
  shareViews,
} from "@/lib/db/schema";
import { listDirectory, ensureDir } from "@/lib/fs/storage";
import {
  teamProjectShortcutFromUploadPath,
  type TeamProjectShortcut,
} from "@/lib/navigation";
import {
  approvalCoversUpload,
  currentReviewState,
  reviewTimestampMs,
} from "@/lib/review/pending";
import type { SessionPayload } from "@/lib/auth/session";
import { getAccessibleFilePaths } from "@/lib/auth/access";
import { teamBoxesEnabled } from "@/lib/team-boxes/access";
import { parseStoredSharePaths, visibleOwnedSharePaths } from "@/lib/team-boxes/share-access";
import { readRecentFileDetails } from "./recent-file-details";

/**
 * The old dashboard APIs predate Team Box grants. When the Beta gate is on,
 * never infer permission from an uploader id: callers must provide the signed
 * session and every rendering path is checked through the central ACL.
 */
async function visiblePathsForSession(
  session: SessionPayload | null | undefined,
  paths: readonly string[],
): Promise<Set<string>> {
  if (!teamBoxesEnabled()) return new Set(paths);
  if (!session) return new Set();
  return getAccessibleFilePaths(session, paths);
}

// 기존 import 경로를 유지하면서 사용량 API와 동일한 캐시·디스크 walk를 공유한다.
export {
  getPersonalSummary,
  invalidatePersonalSummary,
  type PersonalSummary,
} from "@/lib/fs/usage";

/** 파일 경로에서 공간 판별 — /personal/{userId}/...면 personal, 그 외 team */
export type FileSpace = "personal" | "team";
export function spaceOfPath(filePath: string, userId?: string): FileSpace {
  if (!filePath.startsWith("/")) filePath = "/" + filePath;
  if (filePath.startsWith("/personal/")) {
    // userId 지정 시 본인 영역만 personal 확인 (다른 사람 personal은 접근 불가지만 안전)
    if (userId) {
      const parts = filePath.split("/").filter(Boolean);
      return parts[1] === userId ? "personal" : "team";
    }
    return "personal";
  }
  return "team";
}

/** 홈에 표시할 최근 파일 — 코멘트 수와 현재 버전의 검수 상태 포함 */
export type MyRecentFile = {
  path: string;
  filename: string;
  uploadedAt: number;
  space: FileSpace;
  commentCount: number;
  /** 현재 업로드 이후 매니저의 top-level 수정 요청이 있으면 true */
  needsNewVersion: boolean;
  /** 현재 업로드 이후 매니저의 top-level approve가 있으면 true */
  approved: boolean;
};

export async function getMyRecentFiles(
  userId: string,
  limit = 12,
  session?: SessionPayload | null,
): Promise<MyRecentFile[]> {
  const candidateRows = await db
    .select({
      path: fileUploads.path,
      uploadedAt: fileUploads.uploadedAt,
    })
    .from(fileUploads)
    .where(eq(fileUploads.uploadedBy, userId))
    .orderBy(desc(fileUploads.uploadedAt))
    .limit(limit);

  const useFastPath = process.env.VIBOX_FAST_HOME_RECENTS === "1"
    && teamBoxesEnabled()
    && session?.sub === userId
    && Number.isInteger(limit)
    && limit >= 0
    && limit <= 30;
  if (useFastPath && session) {
    const fast = await readRecentFileDetails(session, candidateRows);
    if (!fast.legacyFallback) {
      return candidateRows.flatMap((row) => {
        const detail = fast.details.get(row.path);
        if (!detail) return [];
        const approvedAt = reviewTimestampMs(detail.approvedAt);
        const feedbackAt = reviewTimestampMs(detail.feedbackAt);
        const { approved, needsNewVersion } = currentReviewState({
          approvedAt: approvedAt !== null && approvedAt > 0 ? approvedAt : undefined,
          feedbackAt: feedbackAt !== null && feedbackAt > 0 ? feedbackAt : undefined,
          uploadedAt: row.uploadedAt,
        });
        return [{
          path: row.path,
          filename: row.path.split("/").pop() ?? row.path,
          uploadedAt: row.uploadedAt.getTime(),
          space: spaceOfPath(row.path, userId),
          commentCount: detail.commentCount,
          needsNewVersion,
          approved,
        }];
      });
    }
  }

  const visiblePaths = await visiblePathsForSession(
    session,
    candidateRows.map((row) => row.path),
  );
  const rows = candidateRows.filter((row) => visiblePaths.has(row.path));
  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.path);

  // 권한으로 좁힌 경로만 집계한다. 댓글 수와 검수 상태는 독립적인 두 조회다.
  const [cmtRows, managerCmtRows] = await Promise.all([
    db
      .select({
        filePath: comments.filePath,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(comments)
      // 합성 approve는 사용자에게 보이는 댓글 수에서 제외한다.
      .where(and(inArray(comments.filePath, paths), ne(comments.kind, "approve")))
      .groupBy(comments.filePath),
    // 매니저 목록을 먼저 왕복 조회하지 않고 같은 쿼리에서 현재 역할을 확인한다.
    db
      .select({
        filePath: comments.filePath,
        kind: comments.kind,
        latestAt: sql<unknown>`max(${comments.createdAt})`.as("latestAt"),
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(
        and(
          inArray(comments.filePath, paths),
          inArray(users.role, ["admin", "member"]),
          isNull(comments.parentId),
          inArray(comments.kind, ["approve", "feedback"]),
        ),
      )
      .groupBy(comments.filePath, comments.kind),
  ]);
  const commentMap = new Map(cmtRows.map((r) => [r.filePath, Number(r.count)]));
  const latestApprovalAtByPath = new Map<string, number>();
  const latestFeedbackAtByPath = new Map<string, number>();
  for (const r of managerCmtRows) {
    const latestAt = reviewTimestampMs(r.latestAt);
    if (latestAt === null) continue;
    const target = r.kind === "approve"
      ? latestApprovalAtByPath
      : latestFeedbackAtByPath;
    if (latestAt > (target.get(r.filePath) ?? 0)) {
      target.set(r.filePath, latestAt);
    }
  }

  return rows.map((r) => {
    const { approved, needsNewVersion } = currentReviewState({
      approvedAt: latestApprovalAtByPath.get(r.path),
      feedbackAt: latestFeedbackAtByPath.get(r.path),
      uploadedAt: r.uploadedAt,
    });
    return {
      path: r.path,
      filename: r.path.split("/").pop() ?? r.path,
      uploadedAt: r.uploadedAt.getTime(),
      space: spaceOfPath(r.path, userId),
      commentCount: commentMap.get(r.path) ?? 0,
      needsNewVersion,
      approved,
    };
  });
}

/** 내가 올린 파일에 달린 최근 코멘트 (24시간 이내) */
export type MyNewComment = {
  id: string;
  filePath: string;
  filename: string;
  body: string;
  authorName: string;
  createdAt: number;
  space: FileSpace;
};

export async function getMyNewComments(
  userId: string,
  limit = 5,
  session?: SessionPayload | null,
): Promise<MyNewComment[]> {
  const since = new Date(Date.now() - 86400_000);
  const rows = await db
    .select({
      id: comments.id,
      filePath: comments.filePath,
      body: comments.body,
      authorName: comments.authorName,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(fileUploads, eq(comments.filePath, fileUploads.path))
    .where(and(eq(fileUploads.uploadedBy, userId), gte(comments.createdAt, since)))
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  const visiblePaths = await visiblePathsForSession(session, rows.map((row) => row.filePath));
  return rows.filter((row) => visiblePaths.has(row.filePath)).map((r) => ({
    id: r.id,
    filePath: r.filePath,
    filename: r.filePath.split("/").pop() ?? r.filePath,
    body: r.body,
    authorName: r.authorName,
    createdAt: r.createdAt.getTime(),
    space: spaceOfPath(r.filePath, userId),
  }));
}

/** 내 공유 링크 + 조회 통계 */
export type MyShareActivity = {
  token: string;
  filePath: string;
  filename: string;
  title: string | null;
  totalViews: number;
  lastViewedAt: number | null;
  space: FileSpace;
};

export async function getMyShareActivity(
  userId: string,
  limit = 5,
  session?: SessionPayload | null,
): Promise<MyShareActivity[]> {
  const slRows = await db
    .select({
      token: shareLinks.token,
      filePath: shareLinks.filePath,
      paths: shareLinks.paths,
      kind: shareLinks.kind,
      title: shareLinks.title,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .where(and(eq(shareLinks.createdBy, userId), isNull(shareLinks.revokedAt)))
    .orderBy(desc(shareLinks.createdAt))
    .limit(20);

  const visibleLinks = session
    ? await Promise.all(slRows.map(async (row) => ({ row, paths: await visibleOwnedSharePaths(session, row) })))
    : teamBoxesEnabled()
      ? []
      : slRows.map((row) => ({ row, paths: parseStoredSharePaths(row) }));
  const authorizedLinks = visibleLinks.filter((entry): entry is { row: typeof slRows[number]; paths: string[] } => entry.paths !== null);
  if (authorizedLinks.length === 0) return [];
  const tokens = authorizedLinks.map(({ row }) => row.token);
  const viewRows = await db
    .select({
      token: shareViews.shareToken,
      count: sql<number>`count(*)`.as("count"),
      latestAt: sql<number>`max(${shareViews.openedAt})`.as("latestAt"),
    })
    .from(shareViews)
    .where(inArray(shareViews.shareToken, tokens))
    .groupBy(shareViews.shareToken);
  const viewMap = new Map(viewRows.map((v) => [v.token, { count: Number(v.count), latestAt: Number(v.latestAt) }]));

  return authorizedLinks
    .map(({ row, paths }) => {
      const v = viewMap.get(row.token);
      return {
        token: row.token,
        filePath: paths[0],
        filename: paths[0].split("/").pop() ?? paths[0],
        title: row.title,
        totalViews: v?.count ?? 0,
        lastViewedAt: v?.latestAt ?? null,
        space: spaceOfPath(paths[0], userId),
      };
    })
    .sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0))
    .slice(0, limit);
}

/** 받은편지함 — 매니저(admin/member)가 검수 대기인 최근 14일 업로드 */
export type InboxItem = {
  path: string;
  filename: string;
  uploadedByName: string;
  uploadedAt: number;
};

export async function getInboxItems(
  currentUserId: string,
  limit = 5,
  session?: SessionPayload | null,
): Promise<InboxItem[]> {
  const since = new Date(Date.now() - 14 * 86400_000);
  const recent = await db
    .select({
      path: fileUploads.path,
      uploadedByName: fileUploads.uploadedByName,
      uploadedAt: fileUploads.uploadedAt,
    })
    .from(fileUploads)
    .where(gte(fileUploads.uploadedAt, since))
    .orderBy(desc(fileUploads.uploadedAt))
    .limit(50);

  const visiblePaths = await visiblePathsForSession(session, recent.map((row) => row.path));
  const visibleRecent = recent.filter((row) => visiblePaths.has(row.path));
  if (visibleRecent.length === 0) return [];
  const paths = visibleRecent.map((r) => r.path);

  // 일반 코멘트·수정 요청은 완료가 아니다. 현재 업로드 이후 매니저가 남긴
  // kind="approve"만 이 버전의 검수 완료로 인정한다.
  const managers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "member"]));
  const managerIds = managers.map((m) => m.id);

  const approvedRows = managerIds.length === 0
    ? []
    : await db
        .select({
          filePath: comments.filePath,
          approvedAt: sql<unknown>`max(${comments.createdAt})`,
        })
        .from(comments)
        .where(
          and(
            inArray(comments.filePath, paths),
            inArray(comments.authorId, managerIds),
            eq(comments.kind, "approve"),
            isNull(comments.parentId),
          ),
        )
        .groupBy(comments.filePath);
  const approvedAtByPath = new Map(
    approvedRows.map((row) => [row.filePath, row.approvedAt]),
  );

  return visibleRecent
    .filter(
      (upload) =>
        !approvalCoversUpload(
          approvedAtByPath.get(upload.path),
          upload.uploadedAt,
        ),
    )
    .slice(0, limit)
    .map((r) => ({
      path: r.path,
      filename: r.path.split("/").pop() ?? r.path,
      uploadedByName: r.uploadedByName,
      uploadedAt: r.uploadedAt.getTime(),
    }));
}

// ───── 파트너 컨텍스트 패널 데이터 (사이드바 오른쪽 관련 메뉴) ─────
export type PanelFolder = { name: string; children: string[] };
export type PartnerPanelData = {
  folders: PanelFolder[]; // My box 폴더 트리 (상위 + 1단계 하위)
  projects: TeamProjectShortcut[]; // 비모와의 작업 — 내 업로드가 들어있는 프로젝트 폴더
  shares: { name: string; token: string }[]; // 내 공유 링크 (활성)
};

/** 파트너 컨텍스트 패널 데이터. 모든 소스를 try/catch로 감싸 부분 실패해도 빈 배열로. */
export async function getPartnerPanelData(
  userId: string,
  session?: SessionPayload | null,
  { navigationOnly = false, includeFolders = true }: { navigationOnly?: boolean; includeFolders?: boolean } = {},
): Promise<PartnerPanelData> {
  const out: PartnerPanelData = { folders: [], projects: [], shares: [] };

  // My box 폴더 (상위 + 1단계 하위). 프로젝트만 쓰는 게이트웨이는 이 I/O를 생략한다.
  if (includeFolders) {
    try {
      // 내비게이션 조회는 폴더를 생성하지 않으며 최상위 폴더 수만 필요하다.
      if (!navigationOnly) await ensureDir(`/personal/${userId}`);
      const top = await listDirectory(`/personal/${userId}`);
      const topFolders = top.filter((e) => e.isFolder).slice(0, 16);
      out.folders = navigationOnly
        ? topFolders.map((folder) => ({ name: folder.name, children: [] }))
        : await Promise.all(
            topFolders.map(async (f) => {
              let children: string[] = [];
              try {
                const sub = await listDirectory(`/personal/${userId}/${f.name}`);
                children = sub.filter((e) => e.isFolder).map((e) => e.name).slice(0, 10);
              } catch {}
              return { name: f.name, children };
            }),
          );
    } catch {}
  }

  // 비모 프로젝트 — 내 팀 업로드 파일의 부모 폴더 모음
  // Team box 내비게이션은 현재 membership/grant 목록을 이미 사용한다.
  if (!navigationOnly || !teamBoxesEnabled()) {
    try {
      const rows = await db
        .select({ p: fileUploads.path })
        .from(fileUploads)
        .where(eq(fileUploads.uploadedBy, userId))
        .orderBy(desc(fileUploads.uploadedAt));
      const visiblePaths = await visiblePathsForSession(session, rows.map((row) => row.p));
      const shortcuts = new Map<string, TeamProjectShortcut>();
      for (const r of rows) {
        if (!visiblePaths.has(r.p)) continue;
        const shortcut = teamProjectShortcutFromUploadPath(r.p);
        if (shortcut) shortcuts.set(shortcut.path, shortcut);
      }
      out.projects = [...shortcuts.values()].slice(0, 16);
    } catch {}
  }

  // 공유 링크 (활성)
  if (!navigationOnly) {
    try {
      const rows = await db
        .select({ filePath: shareLinks.filePath, paths: shareLinks.paths, kind: shareLinks.kind, title: shareLinks.title, token: shareLinks.token })
        .from(shareLinks)
        .where(and(eq(shareLinks.createdBy, userId), isNull(shareLinks.revokedAt)))
        .orderBy(desc(shareLinks.createdAt))
        .limit(24);
      const visible = session
        ? await Promise.all(rows.map(async (row) => ({ row, paths: await visibleOwnedSharePaths(session, row) })))
        : teamBoxesEnabled()
          ? []
          : rows.map((row) => ({ row, paths: parseStoredSharePaths(row) }));
      const authorized = visible.filter((entry): entry is { row: typeof rows[number]; paths: string[] } => entry.paths !== null);
      out.shares = authorized.map(({ row, paths }) => ({
        name: row.title || (paths[0].split("/").pop() ?? paths[0]),
        token: row.token,
      }));
    } catch {}
  }

  return out;
}
