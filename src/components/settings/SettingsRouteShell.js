"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AppShell from "../AppShell";
import { SettingsProvider } from "@/context/SettingsContext";
import styles from "./SettingsWorkspace.module.css";

const SECTIONS = [
  ["general", "General"],
  ["brand", "Brand"],
  ["shipping", "Shipping & delivery"],
  ["taxes", "Taxes"],
  ["email", "Customer emails"],
];

export default function SettingsRouteShell({ children, store, role, area = "settings" }) {
  const path = usePathname();
  return (
    <SettingsProvider initialStore={store}>
      <AppShell role={role} primaryActionLabel="">
        <div className={area === "settings" ? styles.page : styles.standalonePage}>
          {area === "settings" && <nav className={styles.navPanel} aria-label="Store settings">
            <div className={styles.navHeader}>
              <h2 className={styles.title}>Settings</h2>
              <p className={styles.navDescription}>Store preferences and customer experience.</p>
            </div>
            <div className={styles.sectionList}>
              {SECTIONS.map(([id, label]) => {
                const href = `/admin/settings/${id}`;
                return (
                  <Link
                    key={id}
                    href={href}
                    prefetch={false}
                    aria-current={path === href ? "page" : undefined}
                    className={
                      path === href
                        ? styles.sectionButtonActive
                        : styles.sectionButton
                    }
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>}
          <main
            className={styles.detailCard}
          >
            {children}
          </main>
        </div>
      </AppShell>
    </SettingsProvider>
  );
}
