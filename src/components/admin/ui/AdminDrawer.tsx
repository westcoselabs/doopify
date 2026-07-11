"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import AdminButton from "./AdminButton";

function buildClassName(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type AdminDrawerContextItem = string | {
  label: ReactNode;
  current?: boolean;
};

type AdminDrawerTab = {
  id: string;
  label: ReactNode;
  content?: ReactNode;
  render?: () => ReactNode;
};

type AdminDrawerProps = {
  activeTabId?: string | null;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  contextItems?: AdminDrawerContextItem[];
  contextPlacement?: "body" | "header";
  footer?: ReactNode;
  headerActions?: ReactNode;
  hideTabNav?: boolean;
  onActiveTabChange?: ((tabId: string | null) => void) | null;
  onClose?: () => void;
  isDirty?: boolean;
  open?: boolean;
  showTitle?: boolean;
  subtitle?: ReactNode;
  tabs?: AdminDrawerTab[];
  title?: string;
  titleAdornment?: ReactNode;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function subscribeToHydration() {
  return () => {};
}

export default function AdminDrawer({
  activeTabId = null,
  actions = null,
  children = null,
  className = "",
  contextItems = [],
  contextPlacement = "body",
  footer = null,
  headerActions = null,
  hideTabNav = false,
  isDirty = false,
  onActiveTabChange = null,
  onClose,
  open = false,
  showTitle = true,
  subtitle = "",
  tabs = [],
  title = "Details",
  titleAdornment = null,
}: AdminDrawerProps) {
  const isTabControlled = activeTabId != null;
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const hasTabs = tabs.length > 0;
  const lastOpenRef = useRef(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const resolvedActiveTab = isTabControlled ? activeTabId : activeTab;

  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    onClose?.();
  }, [isDirty, onClose]);

  useEffect(() => {
    const openingNow = open && !lastOpenRef.current;
    const tabIds = tabs.map((tab) => tab.id);
    const firstTabId = tabs[0]?.id ?? null;

    if (open && hasTabs) {
      const nextTab = (() => {
        if (openingNow) return firstTabId;
        if (resolvedActiveTab && tabIds.includes(resolvedActiveTab)) return resolvedActiveTab;
        return firstTabId;
      })();

      if (isTabControlled) {
        if (nextTab && nextTab !== resolvedActiveTab) {
          onActiveTabChange?.(nextTab);
        }
      } else {
        setActiveTab(nextTab);
      }
    }

    if (open && !hasTabs && isTabControlled && resolvedActiveTab != null) {
      onActiveTabChange?.(null);
    }

    lastOpenRef.current = open;
  }, [hasTabs, isTabControlled, onActiveTabChange, open, resolvedActiveTab, tabs]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const timer = window.setTimeout(() => {
      const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable ?? drawerRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      const previous = previouslyFocusedElementRef.current;
      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const hiddenSiblings = Array.from(document.body.children).filter(
      (element) => element !== portalRootRef.current
    );
    const previousStates = hiddenSiblings.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.hasAttribute("inert"),
    }));
    hiddenSiblings.forEach((element) => {
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("inert", "");
    });

    return () => {
      previousStates.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden == null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
        if (!inert) {
          element.removeAttribute("inert");
        }
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) {
        return;
      }

      const focusableElements = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      );
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        drawerRef.current.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, requestClose]);

  const activateTab = useCallback((tabId: string) => {
    if (isTabControlled) {
      onActiveTabChange?.(tabId);
      return;
    }
    setActiveTab(tabId);
  }, [isTabControlled, onActiveTabChange]);

  const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const tabIds = tabs.map((tab) => tab.id);
    if (!tabIds.length) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % tabIds.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + tabIds.length) % tabIds.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabIds.length - 1;
    }
    if (nextIndex == null) return;

    event.preventDefault();
    const nextTabId = tabIds[nextIndex];
    activateTab(nextTabId);
    window.setTimeout(() => {
      document.getElementById(`${titleId}-tab-${nextTabId}`)?.focus();
    }, 0);
  }, [activateTab, tabs, titleId]);

  const content = useMemo(() => {
    if (!hasTabs) {
      return children;
    }

    const currentTab = tabs.find((tab) => tab.id === resolvedActiveTab) ?? tabs[0];
    if (!currentTab) {
      return children;
    }

    if (typeof currentTab.render === "function") {
      return currentTab.render();
    }

    if ("content" in currentTab) {
      return currentTab.content;
    }

    return children;
  }, [children, hasTabs, resolvedActiveTab, tabs]);

  if (!open || !mounted) {
    return null;
  }

  const contextItemNodes = contextItems.length
    ? contextItems.map((item, index) => {
        const label = typeof item === "string" ? item : item.label;
        const isCurrent = typeof item === "string" ? index === contextItems.length - 1 : item.current;

        return (
          <span
            className={buildClassName(["admin-drawer__context-item", isCurrent ? "is-current" : ""])}
            key={`${String(label)}-${index}`}
          >
            {index > 0 ? <span className="admin-drawer__context-divider">/</span> : null}
            <span>{label}</span>
          </span>
        );
      })
    : null;

  const drawerUi = (
    <div className="admin-drawer-root" ref={portalRootRef} role="presentation">
      <div aria-hidden="true" className="admin-drawer-overlay" onClick={requestClose} />
      <aside
        aria-labelledby={showTitle ? titleId : undefined}
        aria-label={showTitle ? undefined : title}
        aria-modal="true"
        className={buildClassName(["admin-drawer", className])}
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="admin-drawer__header">
          <div>
            {contextPlacement === "header" && contextItemNodes ? (
              <div className="admin-drawer__context admin-drawer__context--header" aria-label="Context">
                {contextItemNodes}
              </div>
            ) : null}
            {showTitle ? (
              <div className="admin-drawer__title-row">
                <h2 className="admin-drawer__title" id={titleId}>{title}</h2>
                {titleAdornment}
              </div>
            ) : null}
            {showTitle && subtitle ? <p className="admin-drawer__subtitle">{subtitle}</p> : null}
          </div>
          <div className="admin-drawer__header-actions">
            {headerActions}
            <AdminButton aria-label="Close drawer" onClick={requestClose} size="sm" variant="icon">
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </AdminButton>
          </div>
        </header>

        {contextPlacement === "body" && contextItemNodes ? (
          <div className="admin-drawer__context" aria-label="Context">
            {contextItemNodes}
          </div>
        ) : null}

        {hasTabs && !hideTabNav ? (
          <nav className="admin-drawer__tabs" aria-label="Drawer tabs" role="tablist">
            {tabs.map((tab, index) => (
              <button
                aria-controls={`${titleId}-panel-${tab.id}`}
                aria-selected={resolvedActiveTab === tab.id}
                className={buildClassName([
                  "admin-drawer__tab",
                  resolvedActiveTab === tab.id ? "is-active" : "",
                ])}
                id={`${titleId}-tab-${tab.id}`}
                key={tab.id}
                onClick={() => activateTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                role="tab"
                tabIndex={resolvedActiveTab === tab.id ? 0 : -1}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
        ) : null}

        <div
          aria-labelledby={hasTabs ? `${titleId}-tab-${resolvedActiveTab}` : undefined}
          className="admin-drawer__content custom-scrollbar"
          id={hasTabs ? `${titleId}-panel-${resolvedActiveTab}` : undefined}
          role={hasTabs ? "tabpanel" : undefined}
        >
          {content}
        </div>

        {(footer || actions) && (
          <footer className="admin-drawer__footer">
            {footer ? <div className="admin-drawer__footer-copy">{footer}</div> : null}
            {actions ? <div className="admin-drawer__actions">{actions}</div> : null}
          </footer>
        )}
      </aside>
    </div>
  );

  return createPortal(drawerUi, document.body);
}
