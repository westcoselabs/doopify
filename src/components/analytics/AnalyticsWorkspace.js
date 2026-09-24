"use client";

import AppShell from '../AppShell';
import AdminCard from '../admin/ui/AdminCard';
import AdminEmptyState from '../admin/ui/AdminEmptyState';
import AdminPage from '../admin/ui/AdminPage';
import AdminPageHeader from '../admin/ui/AdminPageHeader';
import AdminStatCard, { AdminStatsGrid } from '../admin/ui/AdminStatCard';
import AdminTable from '../admin/ui/AdminTable';
import AdminToolbar from '../admin/ui/AdminToolbar';
import styles from './AnalyticsWorkspace.module.css';

function formatMoney(cents, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export default function AnalyticsWorkspace({ metrics }) {
  return (
    <AppShell>
      <AdminPage>
        <AdminPageHeader
          description="Live commerce performance snapshots across sales, customers, discounts, and inventory."
          eyebrow="Analytics"
          title="Business pulse"
        />

        <AdminStatsGrid>
          <AdminStatCard label="Paid orders" value={String(metrics.paidOrderCount)} />
          <AdminStatCard label="Repeat customers" value={String(metrics.repeatCustomers)} />
        </AdminStatsGrid>

        <AdminCard className={styles.panel} variant="panel">
          <h2 className={styles.snapshotTitle}>Paid order value</h2>
          <p>All-time paid orders, including partially and fully refunded orders. Value includes discounts, tax and shipping, before refunds. Refunds are shown separately.</p>
          {metrics.currencies.length ? <AdminTable
            columns={[
              { key: 'currency', header: 'Currency', render: (row) => row.currency },
              { key: 'paidOrderValueCents', header: 'Paid order value', render: (row) => formatMoney(row.paidOrderValueCents, row.currency) },
              { key: 'paidOrderCount', header: 'Paid orders', render: (row) => row.paidOrderCount },
              { key: 'averageOrderValueCents', header: 'Average order value', render: (row) => formatMoney(row.averageOrderValueCents, row.currency) },
              { key: 'refundCents', header: 'Issued refunds', render: (row) => formatMoney(row.refundCents, row.currency) },
            ]}
            rows={metrics.currencies.map((row) => ({ ...row, id: row.currency }))}
          /> : <AdminEmptyState title="No paid orders yet" description="Paid order value appears after a verified payment." icon="payments" />}
        </AdminCard>

        <AdminCard className={styles.panel} variant="panel">
          <AdminToolbar>
            <span className={styles.toolbarText}>Performance snapshots</span>
          </AdminToolbar>

          <div className={styles.gridTwo}>
            <AdminCard className={styles.snapshotCard} variant="card">
              <h2 className={styles.snapshotTitle}>Top discount usage</h2>
              {metrics.topDiscounts.length ? (
                <AdminTable
                  columns={[
                    { key: 'title', header: 'Discount', render: (discount) => discount.title },
                    { key: 'method', header: 'Method', render: (discount) => discount.method },
                    { key: 'usageCount', header: 'Usage', render: (discount) => `${discount.usageCount} uses` },
                  ]}
                  rows={metrics.topDiscounts}
                />
              ) : (
                <AdminEmptyState
                  description="Discount performance will appear after checkout usage data accumulates."
                  icon="sell"
                  title="No discount activity yet"
                />
              )}
            </AdminCard>

            <AdminCard className={styles.snapshotCard} variant="card">
              <h2 className={styles.snapshotTitle}>Inventory pressure</h2>
              {metrics.inventoryPressure.length ? (
                <AdminTable
                  columns={[
                    { key: 'title', header: 'Product', render: (product) => product.title },
                    { key: 'inventory', header: 'Available', render: (product) => `${product.inventory} in stock` },
                  ]}
                  rows={metrics.inventoryPressure}
                />
              ) : (
                <AdminEmptyState
                  description="Inventory trends appear here once products are available in the catalog."
                  icon="inventory_2"
                  title="No inventory data yet"
                />
              )}
            </AdminCard>
          </div>
        </AdminCard>
      </AdminPage>
    </AppShell>
  );
}
