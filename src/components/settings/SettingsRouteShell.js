"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AppShell from "../AppShell";
import { SettingsProvider } from "@/context/SettingsContext";
import styles from "./SettingsWorkspace.module.css";

const SECTIONS = [
  ["general", "General"],
  ["brand", "Brand & appearance"],
  ["shipping", "Shipping & delivery"],
  ["taxes", "Taxes & duties"],
  ["email", "Email"],
  ["account", "My account"],
  ["team", "Team"],
];

export default function SettingsRouteShell({ children, store, role }) {
  const path = usePathname();
  return (
    <SettingsProvider initialStore={store}>
      <AppShell>
        <div className={styles.page}>
          <nav className={styles.navPanel} aria-label="Store settings">
            <div className={styles.navHeader}>
              <h2 className={styles.title}>Settings</h2>
              <p className={styles.navDescription}>Configure your store.</p>
            </div>
            <div className={styles.sectionList}>
              {SECTIONS.filter(([id]) =>
                role === "VIEWER"
                  ? id === "account"
                  : id !== "team" || role === "OWNER",
              ).map(([id, label]) => {
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
              {role === "OWNER" && (
                <Link
                  className={
                    path === "/admin/system/developer"
                      ? styles.sectionButtonActive
                      : styles.sectionButton
                  }
                  aria-current={
                    path === "/admin/system/developer" ? "page" : undefined
                  }
                  href="/admin/system/developer"
                  prefetch={false}
                >
                  Environment & integrations
                </Link>
              )}
            </div>
          </nav>
          <main
            className={styles.detailCard}
            style={{ padding: "1.25rem", minWidth: 0 }}
          >
            {children}
          </main>
        </div>
      </AppShell>
    </SettingsProvider>
  );
}
