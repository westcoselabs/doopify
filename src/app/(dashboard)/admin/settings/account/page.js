import { getPageUser } from '@/server/auth/page-auth';
import { getOwnerMfaStatus } from '@/server/services/mfa.service';
import AccountSettingsPanel from '@/components/settings/AccountSettingsPanel';

export default async function AccountSettingsPage() {
  const user = await getPageUser();
  const mfa = user.role === 'OWNER' ? await getOwnerMfaStatus(user.id) : null;
  return <><h1>My account</h1><AccountSettingsPanel currentUser={user} initialMfaStatus={mfa} /></>;
}
