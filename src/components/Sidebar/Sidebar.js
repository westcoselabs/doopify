"use client";

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSettings } from '../../context/SettingsContext';
import styles from './Sidebar.module.css';

export const NAV_GROUPS = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { href: '/admin', label: 'Dashboard', icon: 'dashboard', exact: true },
      { href: '/admin/settings/general', label: 'Settings', icon: 'settings', activePrefix: '/admin/settings' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { href: '/orders', label: 'Orders', icon: 'shopping_cart' },
      { href: '/draft-orders', label: 'Draft Orders', icon: 'edit_document' },
      { href: '/customers', label: 'Customers', icon: 'groups' },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { href: '/products', label: 'Products', icon: 'inventory_2' },
      { href: '/admin/collections', label: 'Collections', icon: 'dashboard_customize' },
      { href: '/media', label: 'Media', icon: 'photo_library' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    items: [
      { href: '/discounts', label: 'Promotions', icon: 'sell' },
      { href: '/admin/abandoned-checkouts', label: 'Abandoned', icon: 'mark_email_unread' },
      { href: '/analytics', label: 'Analytics', icon: 'analytics' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { href: '/admin/system/developer', label: 'Developer', icon: 'code', ownerOnly: true },
      { href: '/admin/system/team', label: 'Team', icon: 'group', ownerOnly: true },
      { href: '/admin/webhooks', label: 'Delivery logs', icon: 'sync_problem' },
    ],
  },
];

const emptySubscribe = () => () => {};

export default function Sidebar({ role }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { settings } = useSettings();
  const activePathname = useSyncExternalStore(emptySubscribe, () => pathname, () => '');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const storeName = (settings.storeName || 'Doopify Store').trim() || 'Doopify Store';

  return (
    <aside className={`${styles.sidebar} glass-panel refraction-edge admin-spotlight`} data-mobile-open={mobileMenuOpen}>
      <div className={styles.brand}>
        <div className={styles.brandLockup}>
          {settings.logoUrl ? (
            <img alt={storeName} className={styles.brandLogo} src={settings.logoUrl} />
          ) : (
            <div className={`font-headline ${styles.brandBadge}`}>{storeName.slice(0, 2).toUpperCase()}</div>
          )}

          <div className={styles.brandCopy}>
            <h1 className={`font-headline ${styles.brandTitle}`}>{storeName}</h1>
            <p className={`text-xs font-headline tracking-tight ${styles.brandSubtitle}`}>Commerce admin</p>
          </div>
        </div>
      </div>

      <button type="button" className={styles.mobileMenu} aria-expanded={mobileMenuOpen} aria-controls="admin-navigation" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
        <span className="material-symbols-outlined" aria-hidden="true">{mobileMenuOpen ? 'close' : 'menu'}</span>
        {mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
      </button>
      <nav className={styles.nav} id="admin-navigation" aria-label="Admin navigation">
        {NAV_GROUPS.map((group) => (
          <section className={styles.navSection} key={group.id}>
            <p className={`font-headline tracking-widest ${styles.sectionLabel}`}>{group.label}</p>
            <div className={styles.sectionItems}>
              {group.items.map((item) => {
                if (item.ownerOnly && role && role !== 'OWNER') return null;
                const isActive =
                  item.exact
                    ? activePathname === item.href
                    : activePathname === item.href || activePathname.startsWith(`${item.activePrefix || item.href}/`);
                return (
                  <Link prefetch={false}
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''} font-headline`}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className={styles.bottomNav}>
        <Link prefetch={false} href="/admin/account" className={`${styles.navLink} font-headline`} aria-current={activePathname === "/admin/account" ? "page" : undefined}>
          <span className="material-symbols-outlined" aria-hidden="true">account_circle</span>
          <span>My account</span>
        </Link>
        <button className={`${styles.navLink} font-headline`} onClick={handleLogout} type="button">
          <span className="material-symbols-outlined">logout</span>
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
