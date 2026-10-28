import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import type { TeamBoxAccess } from "@/lib/team-boxes/contracts";

const state = vi.hoisted(() => ({
  teamEnabled: true,
  teamAccess: { boxes: [], projects: [], catalog: [] } as TeamBoxAccess,
  readTeamAccess: vi.fn(),
  visible: new Set<string>(),
  queries: [] as { sql: string; params: unknown[] }[],
  candidates: [] as unknown[][],
  counts: [] as unknown[][],
  reviews: [] as unknown[][],
  projectPaths: [] as unknown[][],
  shares: [] as unknown[][],
  activeAggregates: 0,
  maxAggregates: 0,
  listDirectory: vi.fn(),
  ensureDir: vi.fn(),
  visiblePaths: vi.fn(),
}));

vi.mock("@/lib/db/client", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return {
    db: drizzle(async (sql, params) => {
      state.queries.push({ sql, params });
      if (sql.includes('from "file_uploads"')) {
        return { rows: sql.includes('"uploaded_at" from') ? state.candidates : state.projectPaths };
      }
      if (sql.includes('from "comments"')) {
        state.activeAggregates += 1;
        state.maxAggregates = Math.max(state.maxAggregates, state.activeAggregates);
        await new Promise((resolve) => setTimeout(resolve, 5));
        state.activeAggregates -= 1;
        return { rows: sql.includes('inner join "users"') ? state.reviews : state.counts };
      }
      if (sql.includes('from "share_links"')) return { rows: state.shares };
      throw new Error(`Unexpected dashboard query: ${sql}`);
    }),
  };
});
vi.mock("@/lib/fs/storage", () => ({
  listDirectory: state.listDirectory,
  ensureDir: state.ensureDir,
  getZoneRoot: () => "/unused-dashboard-test-storage",
}));
vi.mock("@/lib/auth/access", () => ({ getAccessibleFilePaths: state.visiblePaths }));
vi.mock("@/lib/team-boxes/access", () => ({
  teamBoxesEnabled: () => state.teamEnabled,
  getTeamBoxAccess: state.readTeamAccess,
}));
vi.mock("@/lib/team-boxes/share-access", () => ({
  parseStoredSharePaths: (row: { filePath: string }) => [row.filePath],
  visibleOwnedSharePaths: async (_session: unknown, row: { filePath: string }) =>
    state.visible.has(row.filePath) ? [row.filePath] : null,
}));

import { getMyRecentFiles, getPartnerPanelData } from "@/lib/dashboard/queries";
import { readNavigation } from "@/lib/vi-gateway/navigation";

const session: SessionPayload = { sub: "reader", name: "Reader", username: "reader", role: "partner" };
const allowed = "/Rendering/client/project/01/allowed.mp4";
const denied = "/Rendering/private/project/01/private.mp4";
const uploadedAt = "2026-09-20T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  state.teamEnabled = true;
  state.teamAccess = { boxes: [], projects: [], catalog: [] };
  state.readTeamAccess.mockImplementation(async () => state.teamEnabled ? state.teamAccess : null);
  state.visible = new Set([allowed]);
  state.queries = [];
  state.candidates = [[allowed, uploadedAt], [denied, uploadedAt]];
  state.counts = [[allowed, "3"]];
  state.reviews = [[allowed, "approve", "2026-09-21T00:00:00.000Z"]];
  state.projectPaths = [[allowed]];
  state.shares = [];
  state.activeAggregates = 0;
  state.maxAggregates = 0;
  state.ensureDir.mockResolvedValue(undefined);
  state.listDirectory.mockResolvedValue([]);
  state.visiblePaths.mockImplementation(async (_session: unknown, paths: readonly string[]) =>
    new Set(paths.filter((path) => state.visible.has(path))));
});

describe("home loading query budget and authorization", () => {
  it("returns only authorized files with unchanged review state using three queries", async () => {
    const files = await getMyRecentFiles(session.sub, 30, session);
    expect(files).toEqual([{
      path: allowed, filename: "allowed.mp4", uploadedAt: Date.parse(uploadedAt),
      space: "team", commentCount: 3, approved: true, needsNewVersion: false,
    }]);
    expect(state.queries).toHaveLength(3);
    expect(state.visiblePaths).toHaveBeenCalledWith(session, [allowed, denied]);
    for (const query of state.queries.slice(1)) {
      expect(query.params).toContain(allowed);
      expect(query.params).not.toContain(denied);
    }
    const reviewQuery = state.queries.find((query) => query.sql.includes('inner join "users"'))!;
    expect(reviewQuery.params).toEqual(expect.arrayContaining(["admin", "member", "approve", "feedback"]));
    expect(reviewQuery.sql).toContain('"comments"."parent_id" is null');
    expect(state.queries.some((query) => /share_links|share_views/.test(query.sql))).toBe(false);
  });

  it("runs the two independent aggregates together after checking access", async () => {
    await getMyRecentFiles(session.sub, 30, session);
    expect(state.maxAggregates).toBe(2);
  });

  it("does not retain an allowed result after access is revoked", async () => {
    await expect(getMyRecentFiles(session.sub, 30, session)).resolves.toHaveLength(1);
    state.visible.clear();
    state.queries = [];
    await expect(getMyRecentFiles(session.sub, 30, session)).resolves.toEqual([]);
    expect(state.queries).toHaveLength(1);
  });

  it("fails closed without a session and skips aggregates for empty results", async () => {
    await expect(getMyRecentFiles(session.sub, 30)).resolves.toEqual([]);
    expect(state.queries).toHaveLength(1);
    state.candidates = [];
    state.queries = [];
    await expect(getMyRecentFiles(session.sub, 30, session)).resolves.toEqual([]);
    expect(state.queries).toHaveLength(1);
  });

  it("keeps older approval from marking a new upload complete", async () => {
    state.reviews = [[allowed, "approve", "2026-09-19T00:00:00.000Z"], [allowed, "feedback", "2026-09-21T00:00:00.000Z"]];
    const [file] = await getMyRecentFiles(session.sub, 30, session);
    expect(file).toMatchObject({ approved: false, needsNewVersion: true });
  });
});

describe("navigation-only panel loading", () => {
  it("reads only the personal root and does not create folders or query hidden panels", async () => {
    const folders = Array.from({ length: 18 }, (_, i) => ({ name: `folder-${i}`, isFolder: true }));
    state.listDirectory.mockResolvedValue([...folders, { name: "video.mp4", isFolder: false }]);
    const panel = await getPartnerPanelData(session.sub, session, { navigationOnly: true });
    expect(panel.folders).toHaveLength(16);
    expect(panel.folders.every((folder) => folder.children.length === 0)).toBe(true);
    expect(panel.projects).toEqual([]);
    expect(panel.shares).toEqual([]);
    expect(state.listDirectory).toHaveBeenCalledExactlyOnceWith("/personal/reader");
    expect(state.ensureDir).not.toHaveBeenCalled();
    expect(state.queries).toEqual([]);
  });

  it("tolerates a missing personal folder without a write or unrelated query", async () => {
    state.listDirectory.mockRejectedValue(new Error("ENOENT"));
    await expect(getPartnerPanelData(session.sub, session, { navigationOnly: true })).resolves.toEqual({ folders: [], projects: [], shares: [] });
    expect(state.ensureDir).not.toHaveBeenCalled();
    expect(state.queries).toEqual([]);
  });

  it("keeps legacy project shortcuts when Team boxes are disabled", async () => {
    state.teamEnabled = false;
    const panel = await getPartnerPanelData(session.sub, session, { navigationOnly: true });
    expect(panel.projects).toHaveLength(1);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].sql).toContain('from "file_uploads"');
    expect(panel.shares).toEqual([]);
  });

  it("preserves full panel folders and share authorization for existing callers", async () => {
    state.listDirectory.mockImplementation(async (path: string) =>
      path === "/personal/reader" ? [{ name: "folder", isFolder: true }] : [{ name: "child", isFolder: true }]);
    state.shares = [[allowed, null, "file", "Allowed", "allowed-token"], [denied, null, "file", "Denied", "denied-token"]];
    const panel = await getPartnerPanelData(session.sub, session);
    expect(panel.folders).toEqual([{ name: "folder", children: ["child"] }]);
    expect(panel.shares).toEqual([{ name: "Allowed", token: "allowed-token" }]);
    expect(state.ensureDir).toHaveBeenCalledExactlyOnceWith("/personal/reader");
    expect(state.listDirectory).toHaveBeenCalledTimes(2);
  });
});

describe("gateway navigation loading", () => {
  it("uses current Team boxes without personal folder IO or legacy panel queries", async () => {
    state.teamAccess.boxes = [{ id: "alpha", name: "Alpha", role: "member" }];
    state.teamAccess.projects = [{
      id: "project-alpha", name: "Alpha project", storagePrefix: "/Rendering/Alpha",
      teamBoxId: "alpha", teamBoxName: "Alpha", clientId: null, role: "viewer", accessScope: "project",
    }];
    const navigation = await readNavigation(new URLSearchParams("box=alpha"), session);
    expect(navigation).toEqual({
      schemaVersion: 1, readOnly: true, role: "partner",
      teamBoxes: { enabled: true, boxes: state.teamAccess.boxes, selectedBoxId: "alpha", projectCount: 1 },
      projects: [],
    });
    expect(state.readTeamAccess).toHaveBeenCalledExactlyOnceWith(session);
    expect(state.listDirectory).not.toHaveBeenCalled();
    expect(state.ensureDir).not.toHaveBeenCalled();
    expect(state.queries).toEqual([]);
    expect(state.visiblePaths).not.toHaveBeenCalled();
  });

  it("keeps legacy project shortcuts with zero personal folder IO when Team boxes are disabled", async () => {
    state.teamEnabled = false;
    const navigation = await readNavigation(new URLSearchParams(), session);
    expect(navigation.teamBoxes).toEqual({ enabled: false, boxes: [], selectedBoxId: undefined, projectCount: undefined });
    expect(navigation.projects).toHaveLength(1);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].sql).toContain('from "file_uploads"');
    expect(state.listDirectory).not.toHaveBeenCalled();
    expect(state.ensureDir).not.toHaveBeenCalled();
  });

  it("rejects a revoked selected box without unrelated folder or query work", async () => {
    state.teamAccess.boxes = [{ id: "alpha", name: "Alpha", role: "member" }];
    await expect(readNavigation(new URLSearchParams("box=alpha"), session)).resolves.toMatchObject({ teamBoxes: { selectedBoxId: "alpha" } });
    state.teamAccess = { boxes: [], projects: [], catalog: [] };
    await expect(readNavigation(new URLSearchParams("box=alpha"), session)).rejects.toMatchObject({ status: 404 });
    expect(state.readTeamAccess).toHaveBeenCalledTimes(2);
    expect(state.listDirectory).not.toHaveBeenCalled();
    expect(state.ensureDir).not.toHaveBeenCalled();
    expect(state.queries).toEqual([]);
  });

  it("rejects malformed query before any navigation IO", async () => {
    await expect(readNavigation(new URLSearchParams("box=alpha&box=beta"), session)).rejects.toMatchObject({ status: 400 });
    expect(state.readTeamAccess).not.toHaveBeenCalled();
    expect(state.listDirectory).not.toHaveBeenCalled();
    expect(state.ensureDir).not.toHaveBeenCalled();
    expect(state.queries).toEqual([]);
  });
});
