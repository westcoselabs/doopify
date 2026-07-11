"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  buildSettingsPatchPayload,
  requireSettingsApiData,
  SETTINGS_DEFAULTS,
  transformStore,
} from './settings-context.helpers'

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        setSettings(transformStore(requireSettingsApiData(res.ok, json)));
      } catch (e) {
        console.error('[SettingsContext]', e);
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const updateSettings = useCallback(async patch => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSettingsPatchPayload(patch)),
      });
      const payload = await response.json();
      const updatedStore = requireSettingsApiData(response.ok, payload);

      setSettings(transformStore(updatedStore));
      setError(null);
      return transformStore(updatedStore);
    } catch (e) {
      console.error('[SettingsContext] save failed', e);
      setError(e instanceof Error ? e.message : 'Failed to save settings');
      throw e;
    }
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings, setSettings, loading, error }),
    [settings, loading, error, updateSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
}
