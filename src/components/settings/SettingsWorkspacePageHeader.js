"use client";

import AdminButton from '../admin/ui/AdminButton';
import AdminSavedState from '../admin/ui/AdminSavedState';
import styles from './SettingsWorkspace.module.css';

export default function SettingsWorkspacePageHeader({
  activeSavedErrorCopy,
  activeSavedState,
  activeSection,
  activeTitle,
  headerSaveButtonDisabled,
  headerSaveButtonLabel,
  onHeaderSaveClick,
  onRefreshSetupStatus,
  setupLoading,
  showHeaderSaveButton,
}) {
  return (
    <div className={styles.detailHeader}>
      <div>
        <p className={styles.eyebrow}>Settings</p>
        <h2 className={styles.title}>{activeTitle}</h2>
      </div>
      {activeSection === 'setup' ? (
        <AdminButton disabled={setupLoading} onClick={onRefreshSetupStatus} size="sm" variant="secondary">
          {setupLoading ? 'Refreshing...' : 'Refresh diagnostics'}
        </AdminButton>
      ) : (
        <div className={styles.headerActions}>
          <AdminSavedState errorCopy={activeSavedErrorCopy} state={activeSavedState} />
          <AdminButton
            disabled={!showHeaderSaveButton || headerSaveButtonDisabled}
            onClick={onHeaderSaveClick}
            size="sm"
            variant="primary"
          >
            {headerSaveButtonLabel}
          </AdminButton>
        </div>
      )}
    </div>
  );
}

