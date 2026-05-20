"use client";

import AdminCard from "../admin/ui/AdminCard";
import styles from "./SettingsWorkspace.module.css";

export function SettingsHeaderSkeleton() {
  return (
    <div className={styles.settingsSkeletonHeader}>
      <div className={styles.settingsSkeletonLineWide} />
      <div className={styles.settingsSkeletonLineShort} />
    </div>
  );
}

export function SettingsFieldRowSkeleton({ compact = false } = {}) {
  return (
    <div className={styles.settingsSkeletonFieldRow}>
      <div className={styles.settingsSkeletonLabel} />
      <div className={`${styles.settingsSkeletonField} ${compact ? styles.settingsSkeletonFieldCompact : ""}`} />
    </div>
  );
}

export function SettingsListItemSkeleton() {
  return (
    <div className={styles.settingsSkeletonListItem}>
      <div className={styles.settingsSkeletonLineMedium} />
      <div className={styles.settingsSkeletonLineShort} />
      <div className={styles.settingsSkeletonChipRow}>
        <span className={styles.settingsSkeletonChip} />
        <span className={styles.settingsSkeletonChip} />
      </div>
    </div>
  );
}

export function SettingsProviderRowSkeleton() {
  return (
    <div className={styles.settingsSkeletonProviderRow}>
      <span className={styles.settingsSkeletonProviderIcon} />
      <div className={styles.settingsSkeletonProviderMain}>
        <div className={styles.settingsSkeletonProviderTitleRow}>
          <span className={styles.settingsSkeletonProviderName} />
          <span className={styles.settingsSkeletonProviderStatus} />
        </div>
        <span className={styles.settingsSkeletonProviderHelper} />
      </div>
      <span className={styles.settingsSkeletonProviderAction} />
    </div>
  );
}

export function SettingsProviderRowsSkeleton({ rows = 3 } = {}) {
  return (
    <div className={styles.settingsSkeletonProviderRows}>
      {Array.from({ length: rows }).map((_, index) => (
        <SettingsProviderRowSkeleton key={`provider-row-${index}`} />
      ))}
    </div>
  );
}

export function SettingsCardSkeleton({
  fields = 0,
  rows = 0,
  chips = 0,
  actions = 1,
  includeTitle = true,
} = {}) {
  return (
    <AdminCard as="section" className={`${styles.compactSettingsCard} ${styles.settingsSkeletonCard}`} variant="card">
      {includeTitle ? <SettingsHeaderSkeleton /> : null}
      {fields > 0 ? (
        <div className={styles.settingsSkeletonFieldGrid}>
          {Array.from({ length: fields }).map((_, index) => (
            <SettingsFieldRowSkeleton key={`field-${index}`} compact={index % 2 === 1} />
          ))}
        </div>
      ) : null}
      {rows > 0 ? (
        <div className={styles.settingsSkeletonRows}>
          {Array.from({ length: rows }).map((_, index) => (
            <SettingsListItemSkeleton key={`row-${index}`} />
          ))}
        </div>
      ) : null}
      {chips > 0 ? (
        <div className={styles.settingsSkeletonChipRow}>
          {Array.from({ length: chips }).map((_, index) => (
            <span className={styles.settingsSkeletonChip} key={`chip-${index}`} />
          ))}
        </div>
      ) : null}
      {actions > 0 ? (
        <div className={styles.settingsSkeletonActionRow}>
          {Array.from({ length: actions }).map((_, index) => (
            <span className={styles.settingsSkeletonButton} key={`button-${index}`} />
          ))}
        </div>
      ) : null}
    </AdminCard>
  );
}

export function SettingsSectionSkeleton({ cards = [] } = {}) {
  return (
    <section className={styles.configSection}>
      <div className={styles.settingsSkeletonSectionHeading}>
        <div className={styles.settingsSkeletonLineMedium} />
        <div className={styles.settingsSkeletonLineShort} />
      </div>
      {cards.map((card, index) => (
        <SettingsCardSkeleton key={`card-${index}`} {...card} />
      ))}
    </section>
  );
}

export function SettingsDrawerFormSkeleton() {
  return (
    <AdminCard as="section" className={`${styles.compactSettingsCard} ${styles.settingsSkeletonCard}`} variant="card">
      <SettingsHeaderSkeleton />
      <div className={styles.settingsSkeletonFieldGrid}>
        <SettingsFieldRowSkeleton />
        <SettingsFieldRowSkeleton compact />
        <SettingsFieldRowSkeleton />
        <SettingsFieldRowSkeleton compact />
      </div>
      <div className={styles.settingsSkeletonActionRow}>
        <span className={styles.settingsSkeletonButton} />
        <span className={styles.settingsSkeletonButtonGhost} />
      </div>
    </AdminCard>
  );
}

function sectionCardsForTab(section) {
  if (section === "general") {
    return [
      [{ fields: 6, actions: 0 }],
      [{ rows: 1, actions: 1 }, { rows: 1, actions: 3 }],
    ];
  }
  if (section === "payments") {
    return [[{ rows: 3, chips: 3, actions: 2 }, { rows: 2, actions: 0 }]];
  }
  if (section === "shipping") {
    return [[{ rows: 1, chips: 3, actions: 1 }, { rows: 3, actions: 0 }, { rows: 2, actions: 1 }]];
  }
  if (section === "taxes") {
    return [[{ rows: 1, actions: 1 }, { rows: 3, actions: 0 }, { fields: 3, actions: 1 }]];
  }
  if (section === "webhooks") {
    return [[{ rows: 4, actions: 1 }, { rows: 2, actions: 0 }]];
  }
  if (section === "email") {
    return [[{ rows: 2, actions: 2 }, { rows: 3, actions: 0 }, { rows: 2, actions: 1 }]];
  }
  if (section === "brand-kit") {
    return [[{ rows: 3, chips: 3, actions: 0 }, { rows: 2, actions: 1 }, { rows: 2, actions: 1 }]];
  }
  if (section === "account") {
    return [[{ rows: 1, actions: 0 }, { fields: 3, actions: 1 }, { rows: 1, actions: 1 }]];
  }
  if (section === "team") {
    return [[{ rows: 3, actions: 2 }, { rows: 2, actions: 2 }]];
  }
  if (section === "setup") {
    return [[{ rows: 3, chips: 4, actions: 1 }, { rows: 4, actions: 0 }, { rows: 3, actions: 1 }]];
  }
  return [[{ rows: 3, actions: 0 }]];
}

export default function SettingsPageSkeleton({ section = "general" }) {
  const groups = sectionCardsForTab(section);

  return (
    <div className={styles.settingsSkeletonPage} data-testid={`settings-skeleton-${section}`}>
      {groups.map((cards, index) => (
        <SettingsSectionSkeleton cards={cards} key={`section-${index}`} />
      ))}
    </div>
  );
}
