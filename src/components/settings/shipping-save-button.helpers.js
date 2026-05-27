export function getShippingHeaderSaveButtonState({
  loading = false,
  hasError = false,
  hasSaveAction = false,
  shippingModeSavedState = "saved",
  shippingModeDirty = false,
} = {}) {
  const isSaving = shippingModeSavedState === "saving";
  const disabled = loading || hasError || !hasSaveAction || isSaving || !shippingModeDirty;

  return {
    disabled,
    label: isSaving ? "Saving..." : shippingModeDirty ? "Save changes" : "Saved",
  };
}

export function resolveShippingSaveActionRegistration(action) {
  const saveAction = typeof action === "function" ? action : null;
  return {
    saveAction,
    saveActionReady: Boolean(saveAction),
  };
}

export function invokeShippingSaveAction(action) {
  if (typeof action !== "function") return undefined;
  return action();
}
