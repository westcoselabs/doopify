"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  getAdminCommandGroups,
  type AdminCommandGroup,
  type AdminCommandItem,
} from "@/components/dashboard/command-menu/adminCommandGroups";

function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

function matchCommand(command: AdminCommandItem, query: string) {
  if (!query) return true;

  const haystack = [command.label, ...(command.keywords ?? [])].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function AdminCommandPalette() {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMac, setIsMac] = useState(false);

  const commandGroups = useMemo<AdminCommandGroup[]>(() => getAdminCommandGroups(), []);

  const filteredGroups = useMemo(
    () =>
      commandGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((command) => matchCommand(command, query)),
        }))
        .filter((group) => group.items.length > 0),
    [commandGroups, query]
  );

  const flatCommands = useMemo(
    () => filteredGroups.flatMap((group) => group.items.map((item) => ({ group: group.heading, item }))),
    [filteredGroups]
  );

  const selectedIndex = Math.min(activeIndex, Math.max(flatCommands.length - 1, 0));

  const openPalette = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setIsMac(isMacPlatform());
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const togglePalette = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    openPalette();
  }, [open, openPalette]);

  useEffect(() => {
    const handlePaletteEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      const action = customEvent?.detail?.action || "open";
      if (action === "close") {
        setOpen(false);
        return;
      }
      if (action === "toggle") {
        togglePalette();
        return;
      }

      openPalette();
    };

    window.addEventListener("admin-command-palette", handlePaletteEvent);

    return () => {
      window.removeEventListener("admin-command-palette", handlePaletteEvent);
    };
  }, [openPalette, togglePalette]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const isModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (isModifier && key === "k") {
        event.preventDefault();
        togglePalette();
        return;
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePalette]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const runCommand = (command?: AdminCommandItem) => {
    if (!command) return;

    setOpen(false);

    if (command.action === "open-promotion-create") {
      if (pathname?.startsWith("/discounts")) {
        window.dispatchEvent(new CustomEvent("doopify-open-promotion-create"));
        return;
      }

      router.push("/discounts?create=1");
      return;
    }

    if (command.href) {
      router.push(command.href);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(flatCommands.length, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? Math.max(flatCommands.length - 1, 0) : current - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runCommand(flatCommands[selectedIndex]?.item);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="admin-command-palette-overlay" role="presentation">
      <div
        aria-label="Dashboard command menu"
        aria-modal="true"
        className="admin-command-palette"
        ref={rootRef}
        role="dialog"
      >
        <div className="admin-command-palette__input-wrap">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            className="admin-command-palette__input"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages, products, orders, promotions..."
            ref={inputRef}
            value={query}
          />
          <kbd className="admin-command-palette__kbd">{isMac ? "⌘K" : "Ctrl K"}</kbd>
        </div>

        <div className="admin-command-palette__results custom-scrollbar" role="listbox">
          {filteredGroups.length ? (
            filteredGroups.map((group) => (
              <section className="admin-command-palette__group" key={group.heading}>
                <p className="admin-command-palette__group-heading">{group.heading}</p>
                <div className="admin-command-palette__group-items">
                  {group.items.map((command) => {
                    const flatIndex = flatCommands.findIndex(
                      (entry) => entry.group === group.heading && entry.item.label === command.label
                    );

                    return (
                      <button
                        className={`admin-command-palette__item ${flatIndex === selectedIndex ? "is-active" : ""}`}
                        key={`${group.heading}-${command.label}`}
                        onClick={() => runCommand(command)}
                        type="button"
                      >
                        <span className="admin-command-palette__item-copy">
                          <span>{command.label}</span>
                          {command.keywords?.length ? (
                            <small>{command.keywords.slice(0, 3).join(" · ")}</small>
                          ) : null}
                        </span>
                        {command.shortcut ? (
                          <kbd className="admin-command-palette__item-shortcut">{command.shortcut}</kbd>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <p className="admin-command-palette__empty">No results found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
