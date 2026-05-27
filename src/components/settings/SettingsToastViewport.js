"use client";

import styles from './SettingsWorkspace.module.css';

export default function SettingsToastViewport({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div aria-live="polite" className={styles.toastViewport}>
      {toasts.map((toast) => (
        <button
          className={`${styles.toastCard} ${toast.tone === 'success' ? styles.toastSuccess : ''} ${toast.tone === 'error' ? styles.toastError : ''}`}
          key={toast.id}
          onClick={() => onDismiss(toast.id)}
          type="button"
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

