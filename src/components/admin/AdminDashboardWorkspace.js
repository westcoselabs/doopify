"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../AppShell';
import AdminCard from '../admin/ui/AdminCard';
import AdminPage from '../admin/ui/AdminPage';
import AdminPageHeader from '../admin/ui/AdminPageHeader';
import AdminSkeleton from '../admin/ui/AdminSkeleton';
import AdminStatCard, { AdminStatsGrid } from '../admin/ui/AdminStatCard';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import { useCustomers } from '../../context/CustomersContext';
import { useOrders } from '../../context/OrdersContext';
import { useProducts } from '../../context/ProductsContext';
import { useSettings } from '../../context/SettingsContext';
import styles from './AdminDashboardWorkspace.module.css';

function formatCompactNumber(value) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'USD').toUpperCase(),
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatRelativeTime(dateValue) {
  const timestamp = new Date(dateValue).getTime();
  const diffMinutes = Math.round((timestamp - Date.now()) / 60000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');
  return formatter.format(Math.round(diffHours / 24), 'day');
}

export default function AdminDashboardWorkspace() {
  const { orders, loading: ordersLoading } = useOrders();
  const { products, loading: productsLoading } = useProducts();
  const { customers, loading: customersLoading } = useCustomers();
  const { settings } = useSettings();
  const [sessionUser, setSessionUser] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      try {
        const response = await fetch('/api/auth/me');
        const payload = await response.json().catch(() => null);

        if (!ignore && response.ok && payload?.success) {
          setSessionUser(payload.data);
        }
      } catch {}
    }

    loadSession();

    return () => {
      ignore = true;
    };
  }, []);

  const lowInventoryThreshold = Number(settings.lowInventoryAlert || 5);

  const overview = useMemo(() => {
    const grossSales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const averageOrderValue = orders.length ? grossSales / orders.length : 0;
    const activeProducts = products.filter((product) => product.status === 'active').length;
    const inventoryUnits = products.reduce(
      (sum, product) =>
        sum +
        product.variants.reduce((variantSum, variant) => variantSum + Number(variant.inventoryQty || 0), 0),
      0
    );
    const lowStockCount = products.filter((product) => {
      const inventory = product.variants.reduce((sum, variant) => sum + Number(variant.inventoryQty || 0), 0);
      return inventory <= lowInventoryThreshold;
    }).length;

    const activity = orders
      .flatMap((order) =>
        (order.timeline || []).map((entry) => ({
          id: `${order.id}-${entry.id}`,
          title: entry.event,
          detail: entry.detail || `${order.orderNumber} for ${order.customer.name}`,
          href: `/orders/${encodeURIComponent(order.orderNumber.replace('#', ''))}`,
          time: formatRelativeTime(entry.createdAt),
          timestamp: new Date(entry.createdAt).getTime(),
          icon:
            entry.event.toLowerCase().includes('payment')
              ? 'credit_card'
              : entry.event.toLowerCase().includes('fulfilled')
                ? 'local_shipping'
                : 'notifications_active',
        }))
      )
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 6);

    return {
      grossSales,
      averageOrderValue,
      activeProducts,
      inventoryUnits,
      lowStockCount,
      activity,
    };
  }, [lowInventoryThreshold, orders, products]);

  const recentActivity = overview.activity;
  const loading = ordersLoading || productsLoading || customersLoading;
  const userName =
    [sessionUser?.firstName, sessionUser?.lastName].filter(Boolean).join(' ') ||
    sessionUser?.email ||
    'Admin team';

  return (
    <AppShell>
      <AdminPage>
        <AdminPageHeader
          description={
            loading
              ? 'Syncing the latest commerce signals from orders, products, and customer activity.'
              : `${settings.storeName} is live. Welcome back, ${userName}.`
          }
          eyebrow="Dashboard"
          title="Commerce admin"
          actions={<AdminStatusChip tone="success">Live</AdminStatusChip>}
        />

        <AdminStatsGrid>
          <AdminStatCard label="Orders" meta="Active system queue" value={loading ? '--' : formatCompactNumber(orders.length)} />
          <AdminStatCard
            label="Gross sales"
            meta="Across all recorded orders"
            value={loading ? '--' : formatCurrency(overview.grossSales, settings?.currency || 'USD')}
          />
          <AdminStatCard label="Active catalog" meta="Products currently sellable" value={loading ? '--' : formatCompactNumber(overview.activeProducts)} />
          <AdminStatCard label="Customers" meta="Profiles available to support" value={loading ? '--' : formatCompactNumber(customers.length)} />
        </AdminStatsGrid>

        {sessionUser?.role === 'OWNER' && <AdminCard className={styles.setupPanel} variant="card">
          <h2 className="font-headline">Environment and launch readiness</h2>
          <p>Review configured integrations and run a launch check before accepting orders.</p>
          <Link prefetch={false} href="/admin/system/developer">Open Developer</Link>
        </AdminCard>}

        <div className={styles.grid}>
          <AdminCard className={styles.primaryCard} variant="panel">
            <div className={styles.cardHeader}>
              <h2 className="font-headline">Recent activity</h2>
              <span className={styles.cardTag}>Operations feed</span>
            </div>

            {loading ? (
              <div className={styles.loadingWrap}>
                <AdminSkeleton variant="table" rows={5} columns={1} />
              </div>
            ) : !recentActivity.length ? (
              <div className={styles.activityEmptyState}>
                <h3>No activity yet</h3>
                <p>Create your first product, then run setup checks before placing a test checkout.</p>
                <div className={styles.activityEmptyActions}>
                  <Link prefetch={false} className={styles.activityPrimaryAction} href="/admin/system/developer">Open Developer</Link>
                  <Link prefetch={false} className={styles.activitySecondaryAction} href="/products">Add product</Link>
                </div>
              </div>
            ) : (
              <div className={styles.activityList}>
                {recentActivity.map((item) => (
                  <Link prefetch={false} className={styles.activityRow} href={item.href} key={item.id}>
                    <span className={`material-symbols-outlined ${styles.activityIcon}`} aria-hidden="true">{item.icon}</span>
                    <div className={styles.activityCopy}>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </div>
                    <span className={styles.activityTime}>{item.time}</span>
                  </Link>
                ))}
              </div>
            )}
          </AdminCard>

          <div className={styles.sideRail}>
            <AdminCard className={`${styles.sideCard} ${styles.healthCard}`} variant="card">
              <div className={styles.cardHeader}>
                <h2 className="font-headline">Commerce health</h2>
              </div>
              <div className={styles.metricList}>
                <div><span>AOV</span><strong>{loading ? '--' : formatCurrency(overview.averageOrderValue)}</strong></div>
                <div><span>Inventory units</span><strong>{loading ? '--' : formatCompactNumber(overview.inventoryUnits)}</strong></div>
                <div><span>Low stock products</span><strong>{loading ? '--' : formatCompactNumber(overview.lowStockCount)}</strong></div>
              </div>
            </AdminCard>

            <AdminCard className={`${styles.sideCard} ${styles.linksCard}`} variant="card">
              <div className={styles.cardHeader}>
                <h2 className="font-headline">Quick links</h2>
              </div>
              <div className={styles.linkList}>
                <Link prefetch={false} href="/orders">Review orders</Link>
                <Link prefetch={false} href="/products">Add product</Link>
                <Link prefetch={false} href="/settings?section=shipping">Review shipping and rates</Link>
                <Link prefetch={false} href="/admin/webhooks">Open delivery logs</Link>
              </div>
            </AdminCard>
          </div>
        </div>
      </AdminPage>
    </AppShell>
  );
}
