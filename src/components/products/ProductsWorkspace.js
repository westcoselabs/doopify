"use client";

import { useEffect, useEffectEvent } from 'react';
import AppShell from '../AppShell';
import { useProductStore, useProductNotifications, useProductCatalog } from '../../context/ProductContext';
import ProductCatalog from './ProductCatalog';
import ProductEditorDrawer from './ProductEditorDrawer';
import ConfirmDialog from './ConfirmDialog';
import ToastViewport from './ToastViewport';
import styles from '../layout/AppShell.module.css';

export default function ProductsWorkspace() {
  const { editor, actions } = useProductStore();
  const { confirmDialog } = useProductNotifications();
  const { searchQuery } = useProductCatalog();

  const handleKeyDown = useEffectEvent(async event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && editor.isOpen) {
      event.preventDefault();
      await actions.saveDraft();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();

      if (confirmDialog) {
        actions.dismissConfirmDialog();
        return;
      }

      if (editor.isOpen) {
        await actions.requestCloseEditor();
      }
    }
  });

  const handleAutosave = useEffectEvent(async () => {
    await actions.saveDraft({ silent: true });
  });

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!editor.isOpen || !editor.autosaveEnabled || !editor.hasUnsavedChanges || !editor.isDraftValid || editor.isSaving) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      handleAutosave();
    }, 850);

    return () => window.clearTimeout(timeoutId);
  }, [editor.autosaveEnabled, editor.hasUnsavedChanges, editor.isDraftValid, editor.isOpen, editor.isSaving]);

  return (
    <>
      <AppShell
        onCreateOrder={() => actions.showToast('Order creation is on the Orders page now.', 'info')}
        onNotificationsClick={() => actions.showToast('No new catalog alerts right now.', 'info')}
        onQuickActionClick={() => actions.showToast('Quick actions are coming soon.', 'info')}
        onSearchChange={event => actions.setSearchQuery(event.target.value)}
        searchValue={searchQuery}
      >
        <div className={styles.splitView}>
          <ProductCatalog />
        </div>
      </AppShell>

      <ProductEditorDrawer />
      <ConfirmDialog />
      <ToastViewport />
    </>
  );
}
