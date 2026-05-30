"use client";

import { useEffect, useMemo, useState } from 'react';
import AdminDropdown from './AdminDropdown';
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

  const currentLabel = useMemo(() => {
    if (themePreference === 'system') {
      if (!mounted) return 'System';
      return `System (${resolvedTheme === 'dark' ? 'Dark' : 'Light'})`;
    }
    return themePreference === 'dark' ? 'Dark' : 'Light';
  }, [mounted, resolvedTheme, themePreference]);

  return (
    <AdminDropdown
      align="end"
      className={buildClassName(['admin-theme-dropdown', className])}
      trigger={(
        <button className="admin-theme-toggle-dropdown" type="button">
          <span className="material-symbols-outlined" aria-hidden="true">
            {themePreference === 'system'
              ? 'computer'
              : themePreference === 'dark'
                ? 'dark_mode'
                : 'light_mode'}
          </span>
          <span className="admin-theme-toggle-dropdown__label">{currentLabel}</span>
          <span className="material-symbols-outlined admin-theme-toggle-dropdown__chevron" aria-hidden="true">
            keyboard_arrow_down
          </span>
        </button>
      )}
    >
      {THEME_OPTIONS.map((option) => (
        <button
          aria-checked={themePreference === option.value}
          className={buildClassName([
            'admin-theme-dropdown__option',
            themePreference === option.value ? 'is-active' : '',
          ])}
          key={option.value}
          onClick={() => setThemePreference(option.value)}
          role="menuitemradio"
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">{option.icon}</span>
          <span>{option.label}</span>
          {themePreference === option.value ? (
            <span className="material-symbols-outlined admin-theme-dropdown__check" aria-hidden="true">
              check
            </span>
          ) : null}
        </button>
      ))}
    </AdminDropdown>
  );
}
