"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

function buildClassName(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type AdminSelectOption = {
  label: string;
  value: string;
};

type AdminSelectProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  options?: AdminSelectOption[];
  placeholder?: string;
  value?: string;
};

export default function AdminSelect({
  ariaLabel = '',
  className = '',
  disabled = false,
  onChange,
  options = [],
  placeholder = 'Select',
  value = '',
}: AdminSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  useEffect(() => {
    const selectedIndex = options.findIndex((option) => option.value === value);
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [options, value]);

  useEffect(() => {
    if (open) menuRef.current?.focus();
  }, [open]);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const viewportWidth = window.innerWidth;
      const width = Math.max(triggerRect.width, 220);
      let left = triggerRect.left;
      if (menuRect?.width && menuRect.width > viewportWidth - 16) {
        left = 8;
      } else {
        left = Math.max(8, Math.min(left, viewportWidth - width - 8));
      }

      setMenuStyle({
        '--admin-select-top': `${triggerRect.bottom + 6}px`,
        '--admin-select-left': `${left}px`,
        '--admin-select-width': `${width}px`,
      } as CSSProperties);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const insideRoot = target instanceof Node && rootRef.current?.contains(target);
      const insideMenu = target instanceof Node && menuRef.current?.contains(target);
      if (!insideRoot && !insideMenu) setOpen(false);
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function commitOption(option?: AdminSelectOption) {
    if (!option) return;
    onChange?.(option.value);
    setOpen(false);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(options.length, 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? Math.max(options.length - 1, 0) : current - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitOption(options[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={buildClassName(['admin-select', className])} ref={rootRef}>
      <button
        aria-label={ariaLabel || undefined}
        aria-expanded={open}
        className="admin-select__trigger"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className="admin-select__value">{selectedOption?.label || placeholder}</span>
        <span className="material-symbols-outlined admin-select__chevron" aria-hidden="true">keyboard_arrow_down</span>
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="admin-select__menu"
              onKeyDown={handleListKeyDown}
              ref={menuRef}
              role="listbox"
              style={menuStyle}
              tabIndex={-1}
            >
              {options.map((option, index) => (
                <button
                  className={buildClassName([
                    'admin-select__option',
                    option.value === value ? 'is-selected' : '',
                    index === activeIndex ? 'is-active' : '',
                  ])}
                  key={option.value}
                  onClick={() => commitOption(option)}
                  type="button"
                >
                  <span>{option.label}</span>
                  {option.value === value ? (
                    <span className="material-symbols-outlined admin-select__check" aria-hidden="true">check</span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
