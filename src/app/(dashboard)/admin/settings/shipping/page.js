import { requirePageRole } from '@/server/auth/page-auth';
import { getShippingWorkspaceSettings } from '@/server/shipping/shipping-settings.service';
import { serializeShippingWorkspace } from '@/server/shipping/shipping-settings.dto';
import ShippingSettingsWorkspace from '@/components/settings/ShippingSettingsWorkspace';

export default async function ShippingSettingsPage() {
  const user = await requirePageRole();
  const store = await getShippingWorkspaceSettings();
  if (!store) throw new Error('Store not configured');
  return <ShippingSettingsWorkspace initialSettings={serializeShippingWorkspace(store)} canViewDeveloper={user.role === "OWNER"} />;
}
