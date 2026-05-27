"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

function buildClassName(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type AdminDropdownProps = {
  align?: 'start' | 'end' | string;
  children?: ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger?: ReactNode;
};

export default function AdminDropdown({
  align = 'end',
  children,
  className = '',
  open,
  onOpenChange,
  trigger,
}: AdminDropdownProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? Boolean(open) : internalOpen;

  const setOpen = useCallback((nextOpen: boolean) => {
    if (!isControlled) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [isControlled, onOpenChange]);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const menuWidth = Math.max(triggerRect.width, 180);
      const viewportWidth = window.innerWidth;
      const nextTop = triggerRect.bottom + 8;
      let nextLeft = align === 'start' ? triggerRect.left : triggerRect.right - menuWidth;

      if (menuRect?.width && align === 'end') {
        nextLeft = triggerRect.right - menuRect.width;
      }

      const maxLeft = viewportWidth - Math.min(menuRect?.width || menuWidth, viewportWidth - 12) - 8;
      nextLeft = Math.max(8, Math.min(nextLeft, maxLeft));

      setMenuStyle({
        '--admin-menu-top': `${Math.max(8, nextTop)}px`,
        '--admin-menu-left': `${nextLeft}px`,
        '--admin-menu-width': `${menuWidth}px`,
      } as CSSProperties);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const insideRoot = target instanceof Node && rootRef.current?.contains(target);
      const insideMenu = target instanceof Node && menuRef.current?.contains(target);
      if (!insideRoot && !insideMenu) setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setOpen]);

  return (
    <div className={buildClassName(['admin-dropdown', className])} ref={rootRef}>
      <div
        className="admin-dropdown__trigger"
        onClick={() => setOpen(!isOpen)}
        ref={triggerRef}
        role="presentation"
      >
        {trigger}
      </div>
      {mounted && isOpen
        ? createPortal(
            <div
              className={buildClassName(['admin-dropdown__menu', `is-${align}`])}
              onClick={(event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;
                if (target.closest("button, a, [data-admin-dropdown-close='true']")) setOpen(false);
              }}
              ref={menuRef}
              role="menu"
              style={menuStyle}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
