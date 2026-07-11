"use client";

import { useEffect, useState } from 'react';
import { useAdminTheme } from './AdminThemeProvider';

function buildClassName(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  { value: 'system', label: 'System', icon: 'computer' },
] as const;

export default function AdminThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, setThemePreference, themePreference } = useAdminTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setMounted(true);
  }, []);

  return (
    <div
      aria-label="Theme"
      className={buildClassName(['admin-theme-toggle', className])}
      role="radiogroup"
    >
      {THEME_OPTIONS.map((option) => {
        const isActive = themePreference === option.value;
        const optionLabel =
          option.value === 'system' && mounted
            ? `System (${resolvedTheme === 'dark' ? 'Dark' : 'Light'})`
            : option.label;

        return (
          <button
            aria-checked={isActive}
            aria-label={optionLabel}
            className={buildClassName([
              'admin-theme-toggle__option',
              isActive ? 'is-active' : '',
            ])}
            key={option.value}
            onClick={() => setThemePreference(option.value)}
            role="radio"
            title={optionLabel}
            type="button"
          >
            <span className="material-symbols-outlined" aria-hidden="true">{option.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
