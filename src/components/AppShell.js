"use client";

import { useRouter } from "next/navigation";
import Header from './Header/Header';
import Sidebar from './Sidebar/Sidebar';
import styles from './layout/AppShell.module.css';

export default function AppShell({
  children,
  role,
  searchValue = '',
  onSearchChange,
  onCreateOrder,
  onNotificationsClick,
  onQuickActionClick,
  primaryActionLabel,
  searchPlaceholder,
}) {
  const router = useRouter();
  const defaultCreateOrder = () => router.push("/draft-orders?new=1");
  const usesDefaultOrderLabel = !primaryActionLabel || primaryActionLabel === "New order";
  const handleCreateOrder = usesDefaultOrderLabel ? defaultCreateOrder : onCreateOrder || defaultCreateOrder;

  return (
    <div className={styles.appContainer}>
      <Sidebar role={role} />
      <div className={styles.mainCanvas}>
        <Header
          onCreateOrder={handleCreateOrder}
          onNotificationsClick={onNotificationsClick}
          onQuickActionClick={onQuickActionClick}
          onSearchChange={onSearchChange}
          primaryActionLabel={primaryActionLabel}
          searchPlaceholder={searchPlaceholder}
          searchValue={searchValue}
        />
        <div className={styles.viewContainer}>{children}</div>
      </div>
    </div>
  );
}
