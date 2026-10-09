"use client";
import { memo } from "react";


import { createPortal } from 'react-dom';
import { useProductNotifications } from '../../context/ProductContext';
import styles from './ToastViewport.module.css';

function ToastViewport() {
  const { toasts, actions } = useProductNotifications();

  if (!toasts.length || typeof document === 'undefined') {
    return null;
  }

  const toastUi = (
    <div className={styles.viewport}>
      {toasts.map(toast => (
        <div key={toast.id} className={`${styles.toast} ${styles[`toast_${toast.tone}`] || ''}`}>
          <div>
            <p className={styles.toastLabel}>{toast.tone === 'error' ? 'Needs attention' : 'Product update'}</p>
            <p className={styles.toastMessage}>{toast.message}</p>
          </div>
          <button className={styles.toastDismiss} onClick={() => actions.dismissToast(toast.id)} type="button">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      ))}
    </div>
  );

  return createPortal(toastUi, document.body);
}

export default memo(ToastViewport);
