import { requirePageRole } from '@/server/auth/page-auth';
import { getShippingSettingsStore } from '@/server/shipping/shipping-settings.service';
import { serializeShippingSettings } from '@/server/shipping/shipping-settings.dto';
import { buildShippingSetupStatus } from '@/server/shipping/shipping-setup.service';
import ShippingSettingsWorkspace from '@/components/settings/ShippingSettingsWorkspace';

export default async function ShippingSettingsPage() {
  await requirePageRole();
  const store = await getShippingSettingsStore();
  if (!store) throw new Error('Store not configured');
  const status = await buildShippingSetupStatus(store);
  return <ShippingSettingsWorkspace initialSettings={serializeShippingSettings(store)} initialSetupStatus={status} />;
}
