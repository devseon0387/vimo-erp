import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";
import type { SessionPayload } from "@/lib/auth/session";
import { canonicalStoragePath, isReservedStoragePath, parseZoneFromPath } from "@/lib/fs/storage-path";
import { readTeamBoxAccess } from "./repository";
import type { TeamBoxAccess, TeamProjectGrant } from "./contracts";

/** First activation is the read-only Beta. Write permission rollout is separate. */
export function teamBoxesEnabled(): boolean {
  if (process.env.VIBOX_TEAM_BOXES_ENABLED !== "1") return false;
  if (process.env.VIBOX_RELEASE_CHANNEL !== "beta" || process.env.VIBOX_BETA_READ_ONLY !== "1") {
    throw new Error("Team box activation requires the read-only Beta channel");
  }
  return true;
}

// React cache only deduplicates inside a server-render request; no cross-request
// membership cache or JWT-derived grants can revive a revoked membership.
const requestAccess = cache(readTeamBoxAccess);
export async function getTeamBoxAccess(session: SessionPayload | null): Promise<TeamBoxAccess | null> {
  if (!teamBoxesEnabled()) return null;
  if (!session) return { boxes: [], projects: [], catalog: [] };
  return requestAccess(session.sub);
}

export function normalizedTeamPath(value: string): string | null {
  try {
    if (isReservedStoragePath(value)) return null;
    // Authorization follows exact filesystem names; NFC/NFD may be distinct
    // directories on Linux and must never be merged into the same grant.
    const canonical = canonicalStoragePath(value);
    return parseZoneFromPath(canonical).zone === "rendering" ? canonical : null;
  } catch { return null; }
}

export function isTeamProjectPath(value: string): boolean {
  const path = normalizedTeamPath(value);
  return path === "/Rendering" || (path?.startsWith("/Rendering/") ?? false);
}

export function pathInProject(filePath: string, prefix: string): boolean {
  const path = normalizedTeamPath(filePath), root = normalizedTeamPath(prefix);
  return path !== null && root !== null && (path === root || path.startsWith(`${root}/`));
}

export function projectForPath(access: TeamBoxAccess, filePath: string): TeamProjectGrant | undefined {
  const owner = access.catalog.filter(project => pathInProject(filePath, project.storagePrefix))
    .sort((left, right) => right.storagePrefix.length - left.storagePrefix.length)[0];
  return owner ? access.projects.find(project => project.id === owner.id) : undefined;
}

const requestOwnedPaths = cache(async (userId: string): Promise<Set<string>> => {
  const rows = await db.select({ path: fileUploads.path }).from(fileUploads).where(eq(fileUploads.uploadedBy, userId));
  return new Set(rows.map(row => normalizedTeamPath(row.path)).filter((path): path is string => path !== null));
});

export function grantedFilePaths(
  access: TeamBoxAccess,
  paths: readonly string[],
  owned: ReadonlySet<string>,
): Set<string> {
  return new Set(paths.filter(path => {
    const project = projectForPath(access, path), canonical = normalizedTeamPath(path);
    return project !== undefined && canonical !== null &&
      (project.accessScope === "project" || owned.has(canonical));
  }));
}

export async function teamAccessibleFilePaths(session: SessionPayload, paths: readonly string[]): Promise<Set<string> | null> {
  if (paths.length === 0) return teamBoxesEnabled() ? new Set<string>() : null;
  const access = await getTeamBoxAccess(session);
  if (access === null) return null;
  const owned = access.projects.some(project => project.accessScope === "own_uploads")
    ? await requestOwnedPaths(session.sub) : new Set<string>();
  return grantedFilePaths(access, paths, owned);
}

export function grantedDirectoryPaths(
  access: TeamBoxAccess,
  paths: readonly string[],
  owned: ReadonlySet<string>,
): Set<string> {
  return new Set(paths.filter(path => {
    const canonical = normalizedTeamPath(path);
    if (!canonical) return false;
    if (canonical === "/" || canonical === "/Rendering") return true;
    const owner = access.catalog.filter(project => pathInProject(canonical, project.storagePrefix))
      .sort((a, b) => b.storagePrefix.length - a.storagePrefix.length)[0];
    return access.projects.some(project => {
      if (owner && owner.id !== project.id && !project.storagePrefix.startsWith(`${canonical}/`)) return false;
      const root = normalizedTeamPath(project.storagePrefix);
      if (!root) return false;
      const intersects = pathInProject(canonical, root) || root.startsWith(`${canonical}/`);
      if (!intersects) return false;
      return project.accessScope === "project" || [...owned].some(file => file.startsWith(`${canonical}/`) && pathInProject(file, root));
    });
  }));
}

export async function teamAccessibleDirectories(session: SessionPayload, paths: readonly string[]): Promise<Set<string> | null> {
  if (paths.length === 0) return teamBoxesEnabled() ? new Set<string>() : null;
  const access = await getTeamBoxAccess(session);
  if (access === null) return null;
  const owned = access.projects.some(project => project.accessScope === "own_uploads")
    ? await requestOwnedPaths(session.sub) : new Set<string>();
  return grantedDirectoryPaths(access, paths, owned);
}

/** One authorization snapshot for a bounded storage walk; no DB query per file. */
export async function teamSearchVisibility(session: SessionPayload, access: TeamBoxAccess, selectedBoxId?: string) {
  const scoped = { ...access, projects: access.projects.filter(project => !selectedBoxId || project.teamBoxId === selectedBoxId) };
  const owned = scoped.projects.some(project => project.accessScope === "own_uploads")
    ? await requestOwnedPaths(session.sub) : new Set<string>();
  return (entry: { path: string; isFolder: boolean }): boolean =>
    (entry.isFolder ? grantedDirectoryPaths(scoped, [entry.path], owned) : grantedFilePaths(scoped, [entry.path], owned)).has(entry.path);
}
