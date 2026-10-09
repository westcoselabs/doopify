"use client";
import { memo } from "react";


import { useProductNotifications } from '../../context/ProductContext';
import AdminButton from '../admin/ui/AdminButton';
import styles from './ConfirmDialog.module.css';

function ConfirmDialog() {
  const { confirmDialog, actions } = useProductNotifications();

  if (!confirmDialog) {
    return null;
  }

  return (
    <div className={styles.backdrop}>
      <div aria-modal="true" className={styles.dialog} role="dialog">
        <p className={styles.overline}>Attention needed</p>
        <h3 className={`font-headline ${styles.title}`}>{confirmDialog.title}</h3>
        <p className={styles.description}>{confirmDialog.description}</p>

        {confirmDialog.kind === 'unsaved-changes' ? (
          <div className={styles.actions}>
            <AdminButton onClick={() => actions.confirmDialogAction('keep-editing')} variant="ghost">
              Keep editing
            </AdminButton>
            <AdminButton onClick={() => actions.confirmDialogAction('discard')} variant="secondary">
              Discard changes
            </AdminButton>
            <AdminButton onClick={() => actions.confirmDialogAction('save')} variant="primary">
              Save and continue
            </AdminButton>
          </div>
        ) : (
          <div className={styles.actions}>
            <AdminButton onClick={() => actions.dismissConfirmDialog()} variant="ghost">
              Cancel
            </AdminButton>
            <AdminButton onClick={() => actions.confirmDialogAction('confirm')} variant="danger">
              {confirmDialog.kind === 'delete-product' ? 'Delete product' : 'Delete variant'}
            </AdminButton>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ConfirmDialog);
