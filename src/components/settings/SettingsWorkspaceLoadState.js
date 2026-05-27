"use client";

import styles from './SettingsWorkspace.module.css';
import SettingsPageSkeleton from './SettingsSkeletons';

export default function SettingsWorkspaceLoadState({
  activeSection,
  activeTabLoading,
  loading,
  error,
}) {
  if (activeTabLoading && !error) {
    return <SettingsPageSkeleton section={activeSection} />;
  }

  if (!activeTabLoading && !loading && error) {
    return (
      <div className={styles.statusBlock}>
        <p className={styles.statusTitle}>Settings could not be loaded.</p>
        <p className={styles.statusText}>{error}</p>
      </div>
    );
  }

  return null;
}

