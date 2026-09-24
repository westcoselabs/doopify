import { requirePageRole } from '@/server/auth/page-auth';
import { EDITABLE_TEMPLATE_KEYS, getEmailTemplateSetting } from '@/server/services/email-template-settings.service';
import EmailSettingsForm from '@/components/settings/EmailSettingsForm';

export default async function EmailSettingsPage() {
  await requirePageRole();
  const templates = await Promise.all(EDITABLE_TEMPLATE_KEYS.map(getEmailTemplateSetting));
  return <EmailSettingsForm templates={templates} />;
}
