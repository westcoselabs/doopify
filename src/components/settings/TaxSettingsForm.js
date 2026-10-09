"use client";
import { useState } from "react";
import AdminButton from "../admin/ui/AdminButton";
import AdminField from "../admin/ui/AdminField";
import AdminInput from "../admin/ui/AdminInput";
import { calculateTaxPreview } from "./tax-preview.helpers";
import useSettingsDraft from "./useSettingsDraft";
import { jsonRequest, settingsRequest } from "./settings-api";
import styles from "./SettingsWorkspace.module.css";

export default function TaxSettingsForm({ initialSettings, initialRules }) {
  const { draft: settings, setDraft: setSettings, dirty, reset, accept, changes } = useSettingsDraft(initialSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState({ subtotal: '100', shippingAmount: '0', country: 'US', province: '' });
  const [result, setResult] = useState(null);
  const collecting = settings.enabled && settings.strategy === 'MANUAL';
  function patch(values) { setSettings(current => ({ ...current, ...values })); setResult(null); setNotice(''); }
  async function save(event) {
    event.preventDefault();
    if (busy || !dirty) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = changes(['enabled', 'strategy', 'defaultTaxRatePercent', 'taxShipping', 'pricesIncludeTax']);
      if ('defaultTaxRatePercent' in payload) payload.defaultTaxRatePercent = Number(payload.defaultTaxRatePercent);
      accept(await settingsRequest('/api/settings/tax', jsonRequest('PATCH', payload)));
      setNotice('Tax settings saved.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className={styles.configStack}>
    <h1>Taxes</h1>
    <p>Use a flat manual rate at checkout.</p>
    <form onSubmit={save}>
      <fieldset disabled={busy} className={styles.formFields}>
        <label><input type="checkbox" checked={collecting} onChange={event => patch({ enabled: event.target.checked, strategy: event.target.checked ? 'MANUAL' : 'NONE' })} /> Collect taxes</label>
        {collecting && <>
          <AdminField label="Tax rate (%)"><AdminInput type="number" min="0" max="100" step="0.01" required value={settings.defaultTaxRatePercent} onChange={event => patch({ defaultTaxRatePercent: event.target.value })} /></AdminField>
          <label><input type="checkbox" checked={settings.taxShipping} onChange={event => patch({ taxShipping: event.target.checked })} /> Tax shipping</label>
          <label><input type="checkbox" checked={settings.pricesIncludeTax} onChange={event => patch({ pricesIncludeTax: event.target.checked })} /> Prices include tax</label>
        </>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <div className={styles.formActions}><AdminButton type="submit" disabled={!dirty}>{busy ? 'Saving…' : 'Save tax configuration'}</AdminButton><AdminButton variant="ghost" disabled={!dirty} onClick={() => { reset(); setResult(null); setError(''); }}>Reset</AdminButton></div>
      </fieldset>
    </form>
    <details className={styles.disclosure}><summary>Tax preview</summary><div className={styles.configStack}>
      <p>Preview uses the current form values and the same tax calculation as checkout.</p>
      <div className={styles.drawerFormGrid}>{[['subtotal', 'Subtotal'], ['shippingAmount', 'Shipping']].map(([key, label]) => <AdminField key={key} label={label}><AdminInput type="number" min="0" step="0.01" value={preview[key]} onChange={event => { setPreview({ ...preview, [key]: event.target.value }); setResult(null); }} /></AdminField>)}</div>
      <AdminButton onClick={() => { try { setResult(calculateTaxPreview(preview, settings)); setError(''); } catch (failure) { setError(failure.message); } }}>Calculate estimate</AdminButton>
      {result && <p role="status">Estimated tax: {result.estimatedTax.toFixed(2)}. Total: {result.totalWithTax.toFixed(2)}. {result.note}</p>}
    </div></details>
    {(initialRules.length > 0 || settings.originCountry || settings.originState || settings.originPostalCode) && <details className={styles.disclosure}><summary>Stored regional configuration</summary><div className={styles.configStack}>
      <p>These legacy values are retained. Flat manual tax does not use regional rules or origin settings.</p>
      <p>{[settings.originCountry, settings.originState, settings.originPostalCode].filter(Boolean).join(', ')}</p>
      {initialRules.map(rule => <p key={rule.id}>{rule.name}: {rule.countryCode} {rule.provinceCode} — {(Number(rule.rate) * 100).toFixed(2)}%</p>)}
    </div></details>}
  </div>;
}
