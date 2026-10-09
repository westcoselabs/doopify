import { getPageUser } from '@/server/auth/page-auth';
import { getAdminSettings } from '@/server/services/admin-settings.service';
import SettingsRouteShell from '@/components/settings/SettingsRouteShell';

export default async function SettingsLayout({ children }) {
  const user = await getPageUser();
  const store = await getAdminSettings();
  return <SettingsRouteShell store={store} role={user.role}>{children}</SettingsRouteShell>;
}
