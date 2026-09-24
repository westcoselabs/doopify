import { getAdminSettings } from '@/server/services/admin-settings.service';
import styles from "@/components/settings/SettingsWorkspace.module.css";
import SettingsRouteShell from '@/components/settings/SettingsRouteShell';
import { getPageUser } from '@/server/auth/page-auth';
import { getOwnerMfaStatus } from '@/server/services/mfa.service';
import AccountSettingsPanel from '@/components/settings/AccountSettingsPanel';

export default async function AccountSettingsPage() {
  const user = await getPageUser();
  const [mfa, store] = await Promise.all([
    user.role === 'OWNER' ? getOwnerMfaStatus(user.id) : null,
    getAdminSettings(),
  ]);
  return <SettingsRouteShell store={store} role={user.role} area="account"><div className={styles.configStack}><h1>My account</h1><AccountSettingsPanel currentUser={user} initialMfaStatus={mfa} /></div></SettingsRouteShell>;
}
