"use client";

import AdminButton from "../admin/ui/AdminButton";
import styles from "./SettingsWorkspace.module.css";

export default function ShippingSettingsWorkspaceHeader({ onRefresh }) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderCopy}>
        <h2>Shipping & delivery</h2>
        <p>
          Choose what customers pay at checkout, how labels are created after order placement, and what fallback behavior applies when live rates fail.
        </p>
        <p className={styles.pageHeaderHint}>
          Pilot sequence: set checkout method, confirm provider intent, save origin/package defaults, then verify live-rate readiness.
        </p>
      </div>
      <AdminButton onClick={onRefresh} size="sm" variant="secondary">
        Refresh
      </AdminButton>
    </div>
  );
}
