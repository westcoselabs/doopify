export function isSettingsTabLoadingState({
  activeSection = "general",
  loading = false,
  hasError = false,
  brandKitLoading = false,
  brandKitLoaded = false,
  shippingConfigLoading = false,
  shippingConfigLoaded = false,
  providerStatusLoading = false,
  providerStatusLoaded = false,
  paymentActivityLoading = false,
  paymentActivityLoaded = false,
  emailActivityLoading = false,
  emailActivityLoaded = false,
  setupLoading = false,
  setupLoaded = false,
  deploymentLoading = false,
  deploymentLoaded = false,
  wizardLoading = false,
  wizardLoaded = false,
  sessionUser = null,
} = {}) {
  if (hasError) return false;
  if (loading) return true;

  if (activeSection === "setup") {
    // Setup diagnostics sections load independently inside the setup tab.
    return false;
  }

  if (activeSection === "account") {
    return !sessionUser;
  }

  return false;
}
