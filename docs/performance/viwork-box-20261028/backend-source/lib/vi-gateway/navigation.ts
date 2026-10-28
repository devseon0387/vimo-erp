import type { SessionPayload } from "@/lib/auth/session-core";
import { getTeamBoxAccess } from "@/lib/team-boxes/access";
import { getPartnerPanelData } from "@/lib/dashboard/queries";
import { FilesGatewayError, parseTeamQuery } from "./contracts";

export async function readNavigation(params: URLSearchParams, session: SessionPayload) {
  const query = parseTeamQuery(params);
  const [access, panel] = await Promise.all([
    getTeamBoxAccess(session),
    getPartnerPanelData(session.sub, session, { navigationOnly: true, includeFolders: false }),
  ]);
  const selectedBoxId = query.box && query.box !== "all" ? query.box : undefined;
  if (selectedBoxId && !access?.boxes.some(box => box.id === selectedBoxId)) throw new FilesGatewayError(404);
  return { schemaVersion: 1, readOnly: true, role: session.role,
    teamBoxes: { enabled: access !== null, boxes: access?.boxes ?? [], selectedBoxId, projectCount: access?.projects.length },
    projects: panel.projects };
}
