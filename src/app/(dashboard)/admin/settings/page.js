import { redirect } from 'next/navigation';
import { settingsSectionPath } from '@/lib/settings-navigation';

export default async function SettingsPage({ searchParams }) {
  redirect(settingsSectionPath((await searchParams)?.section));
}
