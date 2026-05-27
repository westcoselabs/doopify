"use client";

import { SettingsProviderRowsSkeleton } from "./SettingsSkeletons";
import styles from "./SettingsWorkspace.module.css";

export default function ShippingSettingsWorkspaceSkeleton() {
  return (
    <div className={styles.configStack} data-testid="shipping-settings-skeleton">
      <section className={styles.configSection}>
        <div className={styles.sectionHeading}>
          <div className={styles.loadingLine} style={{ width: "10rem" }} />
        </div>
        <div className={styles.statusBlock}>
          <div className={styles.loadingLine} />
          <div className={styles.loadingLine} style={{ width: "82%" }} />
        </div>
        <div className={styles.methodChipRow}>
          <span className={styles.settingsSkeletonChip} />
          <span className={styles.settingsSkeletonChip} />
          <span className={styles.settingsSkeletonChip} />
        </div>
      </section>

      <section className={styles.configSection}>
        <div className={styles.sectionHeading}>
          <div className={styles.loadingLine} style={{ width: "13rem" }} />
        </div>
        <SettingsProviderRowsSkeleton rows={3} />
      </section>

      <section className={styles.configSection}>
        <div className={styles.sectionHeading}>
          <div className={styles.loadingLine} style={{ width: "14rem" }} />
        </div>
        <SettingsProviderRowsSkeleton rows={3} />
      </section>

      <section className={styles.configSection}>
        <div className={styles.sectionHeading}>
          <div className={styles.loadingLine} style={{ width: "12rem" }} />
        </div>
        <SettingsProviderRowsSkeleton rows={4} />
      </section>
    </div>
  );
}
