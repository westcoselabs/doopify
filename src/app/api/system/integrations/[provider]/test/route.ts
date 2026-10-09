import { err, ok } from "@/lib/api";
import { requireOwner } from "@/server/auth/require-auth";
import {
  getIntegrationStatuses,
  testIntegration,
  type IntegrationId,
} from "@/server/config/integration-status";
import {
  auditActorFromUser,
  recordAuditLogBestEffort,
} from "@/server/services/audit-log.service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;
  const { provider } = await params;
  if (!getIntegrationStatuses().some((entry) => entry.id === provider))
    return err("Unknown integration", 404);
  const result = await testIntegration(provider as IntegrationId);
  await recordAuditLogBestEffort({
    action: "integration.connection_tested",
    actor: auditActorFromUser(auth.user),
    resource: { type: "Integration", id: provider },
    summary: `Connection test ${result.ok ? "passed" : "failed"}: ${provider}`,
    snapshot: { provider, ok: result.ok, checkedAt: result.checkedAt },
  });
  return ok(result);
}
