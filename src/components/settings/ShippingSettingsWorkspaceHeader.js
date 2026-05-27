"use client";

import AdminButton from "../admin/ui/AdminButton";
import styles from "./SettingsWorkspace.module.css";

export default function ShippingSettingsWorkspaceHeader({ onRefresh }) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderCopy}>
        <h2>Shipping & delivery</h2>
        <p>
          Choose what customers pay at checkout, how labels are created, and what happens if live rates fail.
        </p>
        <p className={styles.pageHeaderHint}>Confirm mode, provider intent, and defaults before going live.</p>
      </div>
      <AdminButton onClick={onRefresh} size="sm" variant="secondary">
        Refresh
      </AdminButton>
    </div>
  );
}
