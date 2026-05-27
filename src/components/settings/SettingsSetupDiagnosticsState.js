"use client";

import styles from './SettingsWorkspace.module.css';

export default function SettingsSetupDiagnosticsState({
  showSetupLoadingState,
  showSetupErrorState,
  showSetupDiagnostics,
  setupLoaded,
  setupError,
}) {
  return (
    <>
      {showSetupLoadingState ? (
        <div className={styles.statusBlock}>
          <div className={styles.loadingLine} />
          <div className={styles.loadingLine} />
          <div className={`${styles.loadingLine} ${styles.loadingLineShort}`} />
          <p className={styles.statusText}>Loading diagnostics...</p>
        </div>
      ) : null}

      {showSetupErrorState ? (
        <div className={styles.statusBlock}>
          <p className={styles.statusTitle}>Setup diagnostics error</p>
          <p className={styles.statusText}>{setupError}</p>
        </div>
      ) : null}

      {!showSetupLoadingState && !showSetupErrorState && !showSetupDiagnostics && setupLoaded ? (
        <div className={styles.statusBlock}>
          <p className={styles.statusTitle}>Setup diagnostics unavailable</p>
          <p className={styles.statusText}>The diagnostics payload is missing expected checklist data.</p>
        </div>
      ) : null}
    </>
  );
}

