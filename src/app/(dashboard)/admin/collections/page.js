import CollectionsWorkspace from '@/components/collections/CollectionsWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export const metadata = {
  title: 'Doopify | Collections',
  description: 'Merchandising collections and storefront curation.',
};

export default function AdminCollectionsPage() {
  return (
    <DashboardRouteProviders>
      <CollectionsWorkspace />
    </DashboardRouteProviders>
  );
}
