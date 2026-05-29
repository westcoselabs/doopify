import AdminButton from '@/components/admin/ui/AdminButton';
import AdminThemeToggle from '@/components/admin/ui/AdminThemeToggle';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';

export const PAGE_META = [
  { match: '/admin/webhooks', label: 'Delivery logs', icon: 'sync_problem' },
  { match: '/admin/collections', label: 'Collections', icon: 'dashboard_customize' },
  { match: '/admin/abandoned-checkouts', label: 'Abandoned', icon: 'mark_email_unread' },
  { match: '/settings', label: 'Settings', icon: 'settings' },
  { match: '/orders', label: 'Orders', icon: 'shopping_cart' },
  { match: '/draft-orders', label: 'Draft orders', icon: 'edit_document' },
  { match: '/products', label: 'Products', icon: 'inventory_2' },
  { match: '/customers', label: 'Customers', icon: 'groups' },
  { match: '/discounts', label: 'Discounts & Promotions', icon: 'sell' },
  { match: '/analytics', label: 'Analytics', icon: 'analytics' },
  { match: '/media', label: 'Media', icon: 'photo_library' },
  { match: '/admin', label: 'Dashboard', icon: 'dashboard' },
];

function getPageMeta(pathname) {
  if (!pathname) {
    return { label: 'Dashboard', icon: 'dashboard' };
  }

  const matched = PAGE_META.find((item) =>
    pathname === item.match || pathname.startsWith(`${item.match}/`)
  );

  return matched || { label: 'Dashboard', icon: 'dashboard' };
}

export default function Header({
  onCreateOrder,
  primaryActionLabel = 'New order',
}) {
  const pathname = usePathname();
  const pageMeta = getPageMeta(pathname);

  function openCommandPalette() {
    window.dispatchEvent(
      new CustomEvent('admin-command-palette', {
        detail: { action: 'open' },
      })
    );
  }

  return (
    <header className={`${styles.header} glass-card refraction-edge admin-spotlight`}>
      <div className={styles.leftGroup}>
        <div className={`${styles.pageIndicator} admin-spotlight`}>
          <span className="material-symbols-outlined" aria-hidden="true">
            {pageMeta.icon}
          </span>
          <span>{pageMeta.label}</span>
        </div>
      </div>

      <div className={styles.centerGroup}>
        <button className={`${styles.commandTrigger} admin-spotlight`} onClick={openCommandPalette} type="button">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <span className={styles.commandText}>Search orders, products, customers...</span>
          <kbd className={styles.commandKbd}>Cmd+K</kbd>
        </button>
      </div>

      <div className={styles.rightGroup}>
        <AdminThemeToggle className={styles.themeToggle} />

        {primaryActionLabel ? (
          <AdminButton
            className={`${styles.createBtn} text-sm font-bold tracking-tight font-headline`}
            onClick={onCreateOrder}
            variant="primary"
          >
            {primaryActionLabel}
          </AdminButton>
        ) : null}
      </div>
    </header>
  );
}
