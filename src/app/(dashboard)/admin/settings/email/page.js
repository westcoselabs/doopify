import { requirePageRole } from '@/server/auth/page-auth';
import { getAdminSettings } from '@/server/services/admin-settings.service';
import { EDITABLE_TEMPLATE_KEYS, getEmailTemplateSetting } from '@/server/services/email-template-settings.service';
import EmailSettingsForm from '@/components/settings/EmailSettingsForm';

export default async function EmailSettingsPage() {
  await requirePageRole();
  const [store, templates] = await Promise.all([getAdminSettings(), Promise.all(EDITABLE_TEMPLATE_KEYS.map(getEmailTemplateSetting))]);
  return <EmailSettingsForm storeEmail={store.email} templates={templates} />;
}
