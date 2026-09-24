import { requirePageRole } from '@/server/auth/page-auth';
import { getBrandKit } from '@/server/services/settings.service';
import BrandSettingsForm from '@/components/settings/BrandSettingsForm';

export default async function BrandSettingsPage() {
  await requirePageRole();
  return <BrandSettingsForm initialBrand={await getBrandKit()} />;
}
