import { requirePageRole } from '@/server/auth/page-auth';
import { getAdminSettings } from '@/server/services/admin-settings.service';
import { getIntegrationStatuses } from '@/server/config/integration-status';
import { getLatestLaunchReadinessSnapshot } from '@/server/services/launch-readiness-snapshot.service';
import SettingsRouteShell from '@/components/settings/SettingsRouteShell';
import DeveloperIntegrationsPanel from '@/components/settings/DeveloperIntegrationsPanel';

export default async function DeveloperPage() {
  const user=await requirePageRole(['OWNER']);
  const [store,readiness]=await Promise.all([getAdminSettings(),getLatestLaunchReadinessSnapshot()]);
  return <SettingsRouteShell store={store} role={user.role} area="system"><DeveloperIntegrationsPanel initialIntegrations={getIntegrationStatuses()} initialReadiness={readiness}/></SettingsRouteShell>;
}
