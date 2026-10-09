import { requirePageRole } from '@/server/auth/page-auth';
import { getAdminSettings } from '@/server/services/admin-settings.service';
import GeneralSettingsForm from '@/components/settings/GeneralSettingsForm';

export default async function GeneralSettingsPage() {
  await requirePageRole();
  return <GeneralSettingsForm initialStore={await getAdminSettings()} />;
}
