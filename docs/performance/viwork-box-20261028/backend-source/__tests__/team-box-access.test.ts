import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamBoxAccess, TeamProjectGrant } from "@/lib/team-boxes/contracts";
import type { SessionPayload } from "@/lib/auth/session";

const state = vi.hoisted(() => ({
  access: null as TeamBoxAccess | null,
  owned: [] as { path: string }[],
  readAccess: vi.fn(),
  readOwned: vi.fn(),
}));
vi.mock("@/lib/team-boxes/repository", () => ({ readTeamBoxAccess: state.readAccess }));
vi.mock("@/lib/db/client", () => ({ db: { select: () => ({ from: () => ({ where: state.readOwned }) }) } }));

import { canAccessFile, getAccessibleFilePaths } from "@/lib/auth/access";
import { grantedDirectoryPaths, grantedFilePaths, projectForPath, teamAccessibleDirectories, teamAccessibleFilePaths, teamBoxesEnabled } from "@/lib/team-boxes/access";

const project = (id: string, storagePrefix: string, accessScope: "project" | "own_uploads" = "project"): TeamProjectGrant => ({
  id, storagePrefix, name: id, teamBoxId: "alpha", teamBoxName: "Alpha", clientId: null, role: "viewer", accessScope,
});
const access = (...projects: TeamProjectGrant[]): TeamBoxAccess => ({ boxes: [{ id: "alpha", name: "Alpha", role: "manager" }], projects, catalog: projects.map(({ id, storagePrefix }) => ({ id, storagePrefix })) });
const admin = { sub: "user-a", role: "admin", username: "alpha", name: "Alpha" } as SessionPayload;

describe("Team box file authorization", () => {
  beforeEach(() => {
    vi.stubEnv("VIBOX_TEAM_BOXES_ENABLED", "1");vi.stubEnv("VIBOX_RELEASE_CHANNEL", "beta");vi.stubEnv("VIBOX_BETA_READ_ONLY", "1");
    state.access = access();state.owned = [];
    state.readAccess.mockReset().mockImplementation(async () => state.access);
    state.readOwned.mockReset().mockImplementation(async () => state.owned);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires the read-only Beta and never enables write-channel permission by accident", () => {
    expect(teamBoxesEnabled()).toBe(true);
    vi.stubEnv("VIBOX_BETA_READ_ONLY", "0");expect(() => teamBoxesEnabled()).toThrow();
    vi.stubEnv("VIBOX_TEAM_BOXES_ENABLED", "0");expect(teamBoxesEnabled()).toBe(false);
  });
  it("does not turn admin or manager membership into a file grant", async () => {
    expect(await canAccessFile(admin, "/Rendering/Alpha/private.mp4")).toBe(false);
    expect(await getAccessibleFilePaths(admin, ["/Rendering/Alpha/private.mp4"])).toEqual(new Set());
  });
  it("honors segment boundaries and prevents traversal into an ungranted project", async () => {
    state.access = access(project("a", "/Rendering/Alpha"));
    expect(await getAccessibleFilePaths(admin, ["/Rendering/Alpha/a.mp4", "/Rendering/AlphaTwo/a.mp4", "/Rendering/Alpha/../Other/a.mp4", "/Rendering/Alpha/.vibox/key"]))
      .toEqual(new Set(["/Rendering/Alpha/a.mp4"]));
  });
  it("denies nested ungranted or archived roots even when their parent is granted", () => {
    const permissions = access(project("parent", "/Rendering/Client"));
    permissions.catalog.push({ id: "private-child", storagePrefix: "/Rendering/Client/Private" });
    expect(projectForPath(permissions, "/Rendering/Client/Private/a.mp4")).toBeUndefined();
    expect(grantedFilePaths(permissions, ["/Rendering/Client/Private/a.mp4", "/Rendering/Client/public.mp4"], new Set())).toEqual(new Set(["/Rendering/Client/public.mp4"]));
    expect(grantedDirectoryPaths(permissions, ["/Rendering/Client/Private", "/Rendering/Client/Private/sub", "/Rendering/Client/Public"], new Set())).toEqual(new Set(["/Rendering/Client/Public"]));
  });
  it("preserves a legacy partner's two owned files without revealing sibling output or cover art", async () => {
    state.access = access(project("a", "/Rendering/Alpha", "own_uploads"));
    state.owned = [{ path: "/Rendering/Alpha/episode/v1.mp4" }, { path: "/Rendering/Alpha/episode/v2.mp4" }];
    const paths = [...state.owned.map(row => row.path), "/Rendering/Alpha/episode/private.mp4", "/Rendering/Alpha/cover.png"];
    expect(await getAccessibleFilePaths({ ...admin, role: "partner" }, paths)).toEqual(new Set(state.owned.map(row => row.path)));
    expect(grantedDirectoryPaths(state.access, ["/Rendering/Alpha", "/Rendering/Alpha/episode", "/Rendering/Alpha/secret"], new Set(state.owned.map(row => row.path)))).toEqual(new Set(["/Rendering/Alpha", "/Rendering/Alpha/episode"]));
  });
  it("treats NFC and NFD disk names as different authorization roots", () => {
    const prefix = "/Rendering/한글";
    const permissions = access(project("nfc", prefix));
    expect(grantedFilePaths(permissions, [`${prefix}/a.mp4`, `${prefix.normalize("NFD")}/a.mp4`], new Set())).toEqual(new Set([`${prefix}/a.mp4`]));
  });
  it("keeps the existing personal/library and non-project legacy zones", async () => {
    expect(await canAccessFile(admin, "/library/example.mp4")).toBe(true);
    expect(await canAccessFile(admin, "/personal/another/file.mp4")).toBe(true);
    expect(await canAccessFile({ ...admin, role: "member" }, "/personal/another/file.mp4")).toBe(false);
    expect(await canAccessFile(admin, "/legacy.mp4")).toBe(true);
    expect(state.readAccess).not.toHaveBeenCalled();
    expect(state.readOwned).not.toHaveBeenCalled();
  });

  describe.each([
    ["files", teamAccessibleFilePaths],
    ["directories", teamAccessibleDirectories],
  ] as const)("%s authorization query budget", (_kind, authorize) => {
    it("returns an empty Set without membership or ownership reads for enabled empty input", async () => {
      state.access = access(project("a", "/Rendering/Alpha", "own_uploads"));
      await expect(authorize(admin, [])).resolves.toEqual(new Set());
      expect(state.readAccess).not.toHaveBeenCalled();
      expect(state.readOwned).not.toHaveBeenCalled();
    });

    it("preserves the disabled null sentinel without membership or ownership reads", async () => {
      vi.stubEnv("VIBOX_TEAM_BOXES_ENABLED", "0");
      await expect(authorize(admin, [])).resolves.toBeNull();
      expect(state.readAccess).not.toHaveBeenCalled();
      expect(state.readOwned).not.toHaveBeenCalled();
    });

    it("still enforces the read-only Beta gate before returning for empty input", async () => {
      vi.stubEnv("VIBOX_RELEASE_CHANNEL", "main");
      await expect(authorize(admin, [])).rejects.toThrow("read-only Beta");
      vi.stubEnv("VIBOX_RELEASE_CHANNEL", "beta");
      vi.stubEnv("VIBOX_BETA_READ_ONLY", "0");
      await expect(authorize(admin, [])).rejects.toThrow("read-only Beta");
      expect(state.readAccess).not.toHaveBeenCalled();
      expect(state.readOwned).not.toHaveBeenCalled();
    });

    it("continues to read current grants for nonempty paths and observes revocation", async () => {
      const prefix = "/Rendering/한글";
      state.access = access(project("nfc", prefix));
      const paths = [`${prefix}/episode`, `${prefix.normalize("NFD")}/episode`];
      await expect(authorize(admin, paths)).resolves.toEqual(new Set([paths[0]]));
      expect(state.readAccess).toHaveBeenCalledExactlyOnceWith(admin.sub);
      state.access = access();
      await expect(authorize(admin, paths)).resolves.toEqual(new Set());
      expect(state.readAccess).toHaveBeenCalledTimes(2);
      expect(state.readOwned).not.toHaveBeenCalled();
    });
  });

  it("keeps ownership reads and filtering for nonempty own-upload file and directory requests", async () => {
    const owned = "/Rendering/Alpha/episode/owned.mp4";
    state.access = access(project("a", "/Rendering/Alpha", "own_uploads"));
    state.owned = [{ path: owned }];
    await expect(teamAccessibleFilePaths(admin, [owned, "/Rendering/Alpha/episode/private.mp4", "/Rendering/Other/owned.mp4"]))
      .resolves.toEqual(new Set([owned]));
    await expect(teamAccessibleDirectories(admin, ["/Rendering/Alpha", "/Rendering/Alpha/episode", "/Rendering/Alpha/private", "/Rendering/Other"]))
      .resolves.toEqual(new Set(["/Rendering/Alpha", "/Rendering/Alpha/episode"]));
    expect(state.readAccess).toHaveBeenCalledTimes(2);
    expect(state.readOwned).toHaveBeenCalledTimes(2);
  });
});
