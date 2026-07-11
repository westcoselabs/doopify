import MediaLibraryWorkspace from '@/components/media/MediaLibraryWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export default function MediaPage() {
  return (
    <DashboardRouteProviders>
      <MediaLibraryWorkspace />
    </DashboardRouteProviders>
  );
}
