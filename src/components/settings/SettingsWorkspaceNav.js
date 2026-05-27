"use client";

import AdminButton from '../admin/ui/AdminButton';
import styles from './SettingsWorkspace.module.css';

export default function SettingsWorkspaceNav({
  activeSection,
  loading,
  onSelectSection,
  sections,
}) {
  return (
    <div className={`${styles.navPanel} glass-card refraction-edge admin-spotlight`}>
      <div className={styles.navHeader}>
        <p className={styles.eyebrow}>Settings</p>
        <h2 className={styles.title}>Store settings</h2>
        <p className={styles.navDescription}>
          Complete setup in this order for pilot launch: General, Payments, Shipping, then Setup diagnostics.
        </p>
      </div>
      <div className={styles.sectionList}>
        {sections.map((section) => (
          <AdminButton
            key={section.id}
            className={activeSection === section.id ? styles.sectionButtonActive : styles.sectionButton}
            disabled={loading}
            onClick={() => onSelectSection(section.id)}
            size="sm"
            variant={activeSection === section.id ? 'primary' : 'secondary'}
          >
            {section.label}
          </AdminButton>
        ))}
      </div>
    </div>
  );
}
