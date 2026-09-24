"use client";

import styles from "./SettingsWorkspace.module.css";

export default function ShippingSettingsWorkspaceStatusStack({
  error,
  notice,
}) {
  return (
    <>
      {error ? (
        <div className={`${styles.statusBlock} ${styles.statusBlockError}`} role="alert">
          <p className={styles.statusTitle}>Action needed</p>
          <p className={styles.statusText}>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className={`${styles.statusBlock} ${styles.statusBlockNotice}`} aria-live="polite">
          <p className={styles.statusTitle}>Saved</p>
          <p className={styles.statusText}>{notice}</p>
        </div>
      ) : null}
    </>
  );
}
