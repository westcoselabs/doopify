import { requirePageRole } from '@/server/auth/page-auth';
import { listTeamUsers, listPendingInvites } from '@/server/services/team.service';
import TeamSettingsPanel from '@/components/settings/TeamSettingsPanel';

export default async function TeamSettingsPage() {
  const user = await requirePageRole(['OWNER']);
  const [users,invites] = await Promise.all([listTeamUsers(),listPendingInvites()]);
  return <><h1>Team</h1><TeamSettingsPanel currentUserRole={user.role} currentUserId={user.id} initialUsers={users} initialInvites={invites} /></>;
}
