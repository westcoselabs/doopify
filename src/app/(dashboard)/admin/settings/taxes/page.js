import { requirePageRole } from '@/server/auth/page-auth';
import { getTaxSettingsStore } from '@/server/services/tax-settings.service';
import { listTaxRules } from '@/server/services/shipping-tax-config.service';
import TaxSettingsForm from '@/components/settings/TaxSettingsForm';

export default async function TaxSettingsPage() {
  await requirePageRole();
  const [store,rules] = await Promise.all([getTaxSettingsStore(),listTaxRules()]);
  if (!store) throw new Error('Store not configured');
  const settings = {enabled:store.taxEnabled,strategy:store.taxStrategy,defaultTaxRatePercent:store.defaultTaxRateBps/100,taxShipping:store.taxShipping,pricesIncludeTax:store.pricesIncludeTax,originCountry:store.taxOriginCountry,originState:store.taxOriginState,originPostalCode:store.taxOriginPostalCode};
  return <TaxSettingsForm initialSettings={settings} initialRules={rules} />;
}
