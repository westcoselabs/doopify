import { getAdminSettings } from '@/server/services/admin-settings.service';
import styles from "@/components/settings/SettingsWorkspace.module.css";
import SettingsRouteShell from '@/components/settings/SettingsRouteShell';
import { requirePageRole } from '@/server/auth/page-auth';
import { listTeamUsers, listPendingInvites } from '@/server/services/team.service';
import TeamSettingsPanel from '@/components/settings/TeamSettingsPanel';

export default async function TeamSettingsPage() {
  const user = await requirePageRole(['OWNER']);
  // Authorization must finish before any team data is loaded.
  const [users, invites, store] = await Promise.all([listTeamUsers(), listPendingInvites(), getAdminSettings()]);
  return <SettingsRouteShell store={store} role={user.role} area="system"><div className={styles.configStack}><h1>Team</h1><TeamSettingsPanel currentUserRole={user.role} currentUserId={user.id} initialUsers={users} initialInvites={invites} /></div></SettingsRouteShell>;
}
