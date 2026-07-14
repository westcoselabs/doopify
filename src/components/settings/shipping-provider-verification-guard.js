/** Tracks the active provider drawer/request pair so stale verification work is ignored. */
export function createProviderVerificationGuard() {
  let drawerGeneration = 0;
  let requestId = 0;

  return {
    openDrawer() {
      drawerGeneration += 1;
      return drawerGeneration;
    },
    closeDrawer() {
      drawerGeneration += 1;
    },
    begin() {
      requestId += 1;
      return { drawerGeneration, requestId };
    },
    isCurrent(token) {
      return token.drawerGeneration === drawerGeneration && token.requestId === requestId;
    },
  };
}
