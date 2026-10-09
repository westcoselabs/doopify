import AnalyticsWorkspace from '@/components/analytics/AnalyticsWorkspace';
import { requirePageRole } from '@/server/auth/page-auth';
import { getAnalytics } from '@/server/services/analytics.service';

export default async function AnalyticsPage() {
  await requirePageRole();
  const metrics = await getAnalytics();
  return <AnalyticsWorkspace metrics={metrics} />;
}
