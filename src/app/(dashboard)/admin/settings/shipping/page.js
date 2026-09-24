import { requirePageRole } from '@/server/auth/page-auth';
import { getShippingSettingsStore } from '@/server/shipping/shipping-settings.service';
import { serializeShippingSettings } from '@/server/shipping/shipping-settings.dto';
import ShippingSettingsWorkspace from '@/components/settings/ShippingSettingsWorkspace';

export default async function ShippingSettingsPage() {
  const user = await requirePageRole();
  const store = await getShippingSettingsStore();
  if (!store) throw new Error('Store not configured');
  return <ShippingSettingsWorkspace initialSettings={serializeShippingSettings(store)} canViewDeveloper={user.role === "OWNER"} />;
}
