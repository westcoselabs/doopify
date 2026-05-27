"use client";

import AdminButton from "../admin/ui/AdminButton";
import AdminCard from "../admin/ui/AdminCard";
import AdminField from "../admin/ui/AdminField";
import AdminInput from "../admin/ui/AdminInput";
import AdminSelect from "../admin/ui/AdminSelect";
import styles from "./SettingsWorkspace.module.css";

/**
 * @param {{
 *   settings: {
 *     storeName?: string | null
 *     supportEmail?: string | null
 *     phone?: string | null
 *     timezone?: string | null
 *     currency?: string | null
 *     address?: string | null
 *   }
 *   hasStoreAddress: boolean
 *   currencyOptions: Array<{ value: string, label: string }>
 *   timezoneOptions: Array<{ value: string, label: string }>
 *   onSettingsPatch: (patch: Record<string, unknown>) => void
 *   onNavigateSection: (sectionId: string) => void
 * }} props
 */
export default function GeneralSettingsPanel({
  settings,
  hasStoreAddress,
  currencyOptions,
  timezoneOptions,
  onSettingsPatch,
  onNavigateSection,
}) {
  return (
    <div className={styles.configStack}>
      <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
          <h4>Store identity</h4>
        </div>
        <p className={styles.cardSubtext}>Core store details used across admin and customer messages.</p>
        <div className={styles.drawerFormGrid}>
          <AdminField label="Store name">
            <AdminInput
              onChange={(event) => onSettingsPatch({ storeName: event.target.value })}
              placeholder="Doopify Store"
              value={settings.storeName || ''}
            />
          </AdminField>
          <AdminField label="Support email">
            <AdminInput
              onChange={(event) => onSettingsPatch({ supportEmail: event.target.value })}
              placeholder="support@example.com"
              value={settings.supportEmail || ''}
            />
          </AdminField>
          <AdminField label="Phone">
            <AdminInput
              onChange={(event) => onSettingsPatch({ phone: event.target.value })}
              placeholder="+1 555 555 5555"
              value={settings.phone || ''}
            />
          </AdminField>
          <AdminField
            hint="Used for admin date displays, scheduled actions, and merchant-facing timestamps."
            label="Time zone"
          >
            <AdminSelect
              className={styles.input}
              onChange={(nextValue) => onSettingsPatch({ timezone: nextValue })}
              options={timezoneOptions}
              value={settings.timezone || 'America/New_York'}
            />
          </AdminField>
          <AdminField
            hint="Used for new checkout sessions, payment intents, shipping rates, and new orders. Existing orders keep their original currency."
            label="Currency"
          >
            <AdminSelect
              className={styles.input}
              onChange={(nextValue) => onSettingsPatch({ currency: nextValue })}
              options={currencyOptions}
              value={settings.currency || 'USD'}
            />
          </AdminField>
        </div>
      </AdminCard>

      <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
          <h4>Store address</h4>
        </div>
        <p className={styles.cardSubtext}>Used in shipping docs and customer-facing records.</p>
        <div className={styles.compactDrawerGrid}>
          <p className={styles.compactMeta}>
            <strong>Status:</strong> {hasStoreAddress ? 'Configured' : 'No store address configured'}
          </p>
          {hasStoreAddress ? (
            <p className={styles.compactMeta}>
              <strong>Address:</strong> {settings.address}
            </p>
          ) : (
            <p className={styles.compactMeta}>Add a default ship-from location in Shipping & delivery to complete address setup.</p>
          )}
        </div>
        <div className={styles.compactActionRow}>
          <AdminButton onClick={() => onNavigateSection('shipping')} size="sm" variant="secondary">
            {hasStoreAddress ? 'Edit address' : 'Add address'}
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
          <h4>Operational defaults</h4>
        </div>
        <p className={styles.cardSubtext}>
          Payment, shipping, and email providers are configured in their dedicated tabs.
        </p>
        <div className={styles.compactActionRow}>
          <AdminButton onClick={() => onNavigateSection('payments')} size="sm" variant="secondary">
            Open payments
          </AdminButton>
          <AdminButton onClick={() => onNavigateSection('shipping')} size="sm" variant="secondary">
            Open shipping
          </AdminButton>
          <AdminButton onClick={() => onNavigateSection('email')} size="sm" variant="secondary">
            Open email
          </AdminButton>
        </div>
      </AdminCard>
    </div>
  );
}
