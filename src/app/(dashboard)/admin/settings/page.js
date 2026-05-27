import { redirect } from 'next/navigation';

function appendParam(params, key, value) {
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (entry != null && String(entry).length > 0) {
        params.append(key, String(entry));
      }
    });
    return;
  }

  if (value != null && String(value).length > 0) {
    params.append(key, String(value));
  }
}

export default async function AdminSettingsPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams();

  if (resolvedSearchParams && typeof resolvedSearchParams === 'object') {
    Object.entries(resolvedSearchParams).forEach(([key, value]) => {
      appendParam(params, key, value);
    });
  }

  const queryString = params.toString();
  redirect(queryString ? `/settings?${queryString}` : '/settings');
}
