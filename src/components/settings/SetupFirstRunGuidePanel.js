"use client";

import AdminButton from "../admin/ui/AdminButton";
import AdminCard from "../admin/ui/AdminCard";
import AdminStatusChip from "../admin/ui/AdminStatusChip";
import styles from "./SettingsWorkspace.module.css";

/**
 * @param {{
 *   isOpen: boolean
 *   onToggleOpen: (isOpen: boolean) => void
 *   showWizardError: boolean
 *   showWizardLoading: boolean
 *   showWizardSteps: boolean
 *   wizardError: string
 *   wizardLoading: boolean
 *   wizardSteps: {
 *     wizardComplete?: boolean
 *     completedCount?: number
 *     steps?: Array<{
 *       id: string
 *       status: string
 *       step?: string | number
 *       title: string
 *       reason: string
 *       isRequired?: boolean
 *       ctaRoute?: string
 *       ctaLabel?: string
 *     }>
 *   } | null
 *   onRefreshWizard: () => void
 * }} props
 */
export default function SetupFirstRunGuidePanel({
  isOpen,
  onToggleOpen,
  showWizardError,
  showWizardLoading,
  showWizardSteps,
  wizardError,
  wizardLoading,
  wizardSteps,
  onRefreshWizard,
}) {
  return (
    <details
      className={styles.setupCollapsibleSection}
      open={isOpen}
      onToggle={(event) => {
        onToggleOpen(event.currentTarget.open);
      }}
    >
      <summary
        aria-controls="setup-first-run-guide-body"
        aria-expanded={isOpen}
        className={styles.setupCollapsibleSummary}
      >
        <div className={styles.setupCollapsibleHeading}>
          <h4>Setup Guide</h4>
          <p className={styles.statusText}>
            Optional first-run setup progress and step-by-step guidance.
          </p>
        </div>
        <span className={styles.setupCollapsibleAffordance}>
          <span className={styles.setupCollapsibleState}>
            {showWizardError
              ? "Needs attention"
              : showWizardLoading
                ? "Loading setup checklist..."
                : showWizardSteps
                  ? `${wizardSteps?.completedCount || 0}/${wizardSteps?.steps?.length || 0} complete`
                  : "Available"}
          </span>
          <span aria-hidden="true" className={styles.setupChevronIcon}>
            <svg className={styles.setupChevronSvg} viewBox="0 0 16 16">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        </span>
      </summary>
      <div className={styles.setupCollapsibleBody} id="setup-first-run-guide-body">
        {showWizardLoading ? (
          <div className={styles.statusBlock}>
            <div className={styles.loadingLine} />
            <div className={styles.loadingLine} />
            <div className={`${styles.loadingLine} ${styles.loadingLineShort}`} />
            <p className={styles.statusText}>Loading setup checklist...</p>
          </div>
        ) : null}

        {showWizardError ? (
          <div className={styles.statusBlock}>
            <p className={styles.statusTitle}>Setup checklist error</p>
            <p className={styles.statusText}>{wizardError}</p>
          </div>
        ) : null}

        {showWizardSteps ? (
          <>
            <AdminCard className={styles.setupSummaryCard} variant="card">
              <div className={styles.setupCardHeader}>
                <div>
                  <p className={styles.eyebrow}>First-run checklist</p>
                  <h3 className={styles.setupHeadline}>
                    {wizardSteps?.wizardComplete ? "Store ready for pilot" : "Setup in progress"}
                  </h3>
                  <p className={styles.statusText}>
                    {wizardSteps?.completedCount} of {wizardSteps?.steps?.length} steps complete
                    {wizardSteps?.wizardComplete ? " · all required steps done" : ""}
                  </p>
                </div>
                <AdminButton
                  disabled={wizardLoading}
                  onClick={() => onRefreshWizard()}
                  size="sm"
                  variant="secondary"
                >
                  {wizardLoading ? "Refreshing..." : "Refresh"}
                </AdminButton>
              </div>
            </AdminCard>

            <section className={styles.setupList} style={{ listStyle: "none", padding: 0 }}>
              {(wizardSteps?.steps || []).map((step) => (
                <AdminCard
                  as="article"
                  className={styles.setupCard}
                  key={step.id}
                  variant="card"
                  style={{ marginBottom: "0.5rem" }}
                >
                  <div className={styles.setupCardHeader}>
                    <div>
                      <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "1.4rem",
                            height: "1.4rem",
                            borderRadius: "50%",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            flexShrink: 0,
                            background:
                              step.status === "ready"
                                ? "var(--success-100, #dcfce7)"
                                : step.status === "optional"
                                  ? "var(--surface-container-low)"
                                  : "var(--warning-100, #fef9c3)",
                            color:
                              step.status === "ready"
                                ? "var(--success-700, #15803d)"
                                : step.status === "optional"
                                  ? "var(--on-surface-variant)"
                                  : "var(--warning-700, #a16207)",
                          }}
                        >
                          {step.status === "ready" ? "✓" : step.step}
                        </span>
                        {step.title}
                        {!step.isRequired ? (
                          <span style={{ fontSize: "0.72rem", color: "var(--on-surface-variant)", fontWeight: 400 }}>
                            optional
                          </span>
                        ) : null}
                      </h4>
                      <p className={styles.statusText} style={{ marginTop: "0.25rem" }}>
                        {step.reason}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
                      <AdminStatusChip
                        tone={
                          step.status === "ready"
                            ? "success"
                            : step.status === "optional" || step.status === "skipped"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {step.status === "needs_setup" ? "Needs setup" : step.status}
                      </AdminStatusChip>
                      {step.ctaRoute && step.ctaLabel ? (
                        <a
                          href={step.ctaRoute}
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--primary)",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {step.ctaLabel} →
                        </a>
                      ) : null}
                    </div>
                  </div>
                </AdminCard>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </details>
  );
}
