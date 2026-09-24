import { ok } from "@/lib/api";
import { requireOwner } from "@/server/auth/require-auth";
import { getIntegrationStatuses } from "@/server/config/integration-status";

export async function GET(req: Request) {
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;
  return ok({ integrations: getIntegrationStatuses() });
}
