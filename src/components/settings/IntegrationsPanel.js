import React, { useEffect, useMemo, useState } from 'react';
import AdminButton from '../admin/ui/AdminButton';
import AdminCard from '../admin/ui/AdminCard';
import AdminDrawer from '../admin/ui/AdminDrawer';
import AdminField from '../admin/ui/AdminField';
import AdminInput from '../admin/ui/AdminInput';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import SettingsPageSkeleton from './SettingsSkeletons';
import { useSettings } from '../../context/SettingsContext';
import { formatDateTimeForDisplay } from '../../lib/date-time-format';
import {
  WEBHOOK_EVENT_GROUPS,
  uniqueStrings,
  webhookEventsFromGroups,
  webhookGroupLabelsFromEvents,
  webhookGroupsFromEvents,
} from './webhooks-settings.helpers';
import styles from './SettingsWorkspace.module.css';

const EMPTY_DRAFT = {
  name: '',
  type: 'CUSTOM',
  webhookUrl: '',
  webhookSecret: '',
  clearWebhookSecret: false,
  status: 'ACTIVE',
  eventGroupIds: ['paid_orders'],
  events: [],
  secrets: [],
};

function parseApiJson(response) {
  return response.json().then((payload) => {
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || 'Request failed');
    }
    return payload.data;
  });
}

function formatStatusTone(status) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'INACTIVE') return 'warning';
  return 'neutral';
}

function maskDestination(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    const shortPath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    return `${host}${shortPath}`;
  } catch {
    return url || 'No destination URL';
  }
}

function generateSigningSecret() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `whsec_${Array.from(bytes).map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  return `whsec_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function getEventNames(integration) {
  return (integration?.events || []).map((event) => event?.event).filter(Boolean);
}

function toDraft(integration) {
  const eventNames = getEventNames(integration);
  const eventGroupIds = webhookGroupsFromEvents(eventNames);
  const groupedEvents = new Set(webhookEventsFromGroups(eventGroupIds));
  return {
    name: integration?.name || '',
    type: integration?.type || 'CUSTOM',
    webhookUrl: integration?.webhookUrl || '',
    webhookSecret: '',
    clearWebhookSecret: false,
    status: integration?.status || 'ACTIVE',
    eventGroupIds,
    events: eventNames.filter((eventName) => !groupedEvents.has(eventName)),
    secrets: (integration?.secrets || []).map((secret) => ({ key: secret.key, value: '' })),
  };
}

function buildCreatePayload(draft) {
  const groupedEvents = webhookEventsFromGroups(draft.eventGroupIds);
  const mergedEvents = uniqueStrings([...groupedEvents, ...(draft.events || [])]);
  const generatedSecret = draft.webhookSecret.trim() || generateSigningSecret();

  return {
    name: draft.name.trim(),
    type: draft.type,
    webhookUrl: draft.webhookUrl.trim(),
    webhookSecret: generatedSecret,
    status: draft.status,
    events: mergedEvents,
    secrets: (draft.secrets || []).filter((secret) => secret.key?.trim() && secret.value?.trim()),
  };
}

function buildUpdatePayload(draft) {
  const groupedEvents = webhookEventsFromGroups(draft.eventGroupIds);
  const mergedEvents = uniqueStrings([...groupedEvents, ...(draft.events || [])]);

  return {
    name: draft.name.trim(),
    type: draft.type,
    webhookUrl: draft.webhookUrl.trim(),
    webhookSecret: draft.webhookSecret.trim() || undefined,
    clearWebhookSecret: Boolean(draft.clearWebhookSecret),
    status: draft.status,
    events: mergedEvents,
    secrets: (draft.secrets || []).filter((secret) => secret.key?.trim()),
  };
}

function sortByCreatedAtDesc(items) {
  return [...(items || [])].sort((left, right) => {
    const leftTime = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

function parseIntegrationListData(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.integrations)) {
    return payload.integrations;
  }
  return [];
}

export default function IntegrationsPanel() {
  const { settings } = useSettings();
  const [integrations, setIntegrations] = useState([]);
  const [attentionDeliveries, setAttentionDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attentionLoading, setAttentionLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawerMode, setDrawerMode] = useState(null);
  const [editingIntegrationId, setEditingIntegrationId] = useState(null);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);

  const editingIntegration = useMemo(
    () => integrations.find((integration) => integration.id === editingIntegrationId) || null,
    [editingIntegrationId, integrations]
  );

  const activeCount = useMemo(
    () => integrations.filter((integration) => integration.status === 'ACTIVE').length,
    [integrations]
  );

  const needsAttentionCount = useMemo(
    () => attentionDeliveries.filter((delivery) => delivery.status === 'FAILED' || delivery.status === 'RETRYING' || delivery.status === 'EXHAUSTED').length,
    [attentionDeliveries]
  );

  useEffect(() => {
    void refreshAll();
  }, []);

  async function refreshAll() {
    setLoading(true);
    setAttentionLoading(true);
    setError('');

    try {
      const [integrationData, failedData, retryingData] = await Promise.all([
        fetch('/api/settings/integrations?page=1&pageSize=100', { cache: 'no-store' }).then(parseApiJson),
        fetch('/api/outbound-webhook-deliveries?status=FAILED&page=1&pageSize=8', { cache: 'no-store' }).then(parseApiJson),
        fetch('/api/outbound-webhook-deliveries?status=RETRYING&page=1&pageSize=8', { cache: 'no-store' }).then(parseApiJson),
      ]);

      setIntegrations(parseIntegrationListData(integrationData));
      const mergedAttention = sortByCreatedAtDesc([...(failedData?.deliveries || []), ...(retryingData?.deliveries || [])]);
      setAttentionDeliveries(mergedAttention.slice(0, 8));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load outbound webhooks');
    } finally {
      setLoading(false);
      setAttentionLoading(false);
    }
  }

  function openCreateDrawer() {
    setError('');
    setNotice('');
    setEditingIntegrationId(null);
    setDraft({ ...EMPTY_DRAFT });
    setDrawerMode('create');
  }

  async function openManageDrawer(integration) {
    setError('');
    setNotice('');
    setEditingIntegrationId(integration.id);
    setDraft(toDraft(integration));
    setDrawerMode('manage');

    try {
      const detail = await fetch(`/api/settings/integrations/${integration.id}`, { cache: 'no-store' }).then(parseApiJson);
      setDraft(toDraft(detail));
      setIntegrations((current) => current.map((entry) => (entry.id === detail.id ? { ...entry, ...detail } : entry)));
    } catch (loadError) {
      setNotice(loadError instanceof Error ? loadError.message : 'Could not load integration details');
    }
  }

  function closeDrawer() {
    setDrawerMode(null);
    setEditingIntegrationId(null);
    setDraft({ ...EMPTY_DRAFT });
    setSaving(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      if (!draft.name.trim()) {
        throw new Error('Endpoint name is required');
      }
      if (!draft.webhookUrl.trim()) {
        throw new Error('Destination URL is required');
      }

      if (drawerMode === 'create') {
        await fetch('/api/settings/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCreatePayload(draft)),
        }).then(parseApiJson);

        setNotice('Endpoint created. Signing secret is stored encrypted and hidden.');
      }

      if (drawerMode === 'manage' && editingIntegrationId) {
        await fetch(`/api/settings/integrations/${editingIntegrationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildUpdatePayload(draft)),
        }).then(parseApiJson);

        setNotice('Endpoint updated. Secret values remain hidden.');
      }

      setDraft((current) => ({ ...current, webhookSecret: '', clearWebhookSecret: false }));
      await refreshAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save endpoint');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingIntegrationId) return;
    if (!confirm('Delete this endpoint and its queued deliveries?')) return;

    try {
      await fetch(`/api/settings/integrations/${editingIntegrationId}`, { method: 'DELETE' }).then(parseApiJson);
      setIntegrations((current) => current.filter((integration) => integration.id !== editingIntegrationId));
      closeDrawer();
      setNotice('Endpoint deleted.');
      await refreshAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete endpoint');
    }
  }

  async function handleStatusPatch(nextStatus) {
    if (!editingIntegrationId) return;

    try {
      await fetch(`/api/settings/integrations/${editingIntegrationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      }).then(parseApiJson);

      setNotice(nextStatus === 'ACTIVE' ? 'Endpoint enabled.' : 'Endpoint disabled.');
      await refreshAll();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Failed to update endpoint status');
    }
  }

  function toggleGroup(groupId) {
    const group = WEBHOOK_EVENT_GROUPS.find((entry) => entry.id === groupId);
    if (!group || group.comingSoon) return;

    setDraft((current) => {
      const selected = new Set(current.eventGroupIds || []);
      if (selected.has(groupId)) {
        selected.delete(groupId);
      } else {
        selected.add(groupId);
      }

      return {
        ...current,
        eventGroupIds: Array.from(selected),
      };
    });
  }

  return (
    <div className={styles.configStack}>
      {error ? (
        <div className={styles.statusBlock}>
          <p className={styles.statusTitle}>Webhook settings error</p>
          <p className={styles.statusText}>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className={styles.statusBlock}>
          <p className={styles.statusText}>{notice}</p>
        </div>
      ) : null}

      <section className={styles.compactInfoStrip}>
        <p className={styles.compactInfoStripTitle}>Doopify sends store updates to external apps.</p>
        <p>
          Webhooks do not require SMTP setup. Configure Stripe, email provider, and shipping callbacks in their own settings tabs.
        </p>
        <div className={`${styles.methodChipRow} ${styles.compactChipRow}`}>
          <span className={styles.methodChip}>Doopify -&gt; external app</span>
          <span className={styles.methodChip}>Requires destination URL</span>
          <span className={styles.methodChip}>Signed requests</span>
        </div>
      </section>

      <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
          <h4>Connected endpoints</h4>
          <AdminButton onClick={openCreateDrawer} size="sm" variant="secondary">
            Create endpoint
          </AdminButton>
        </div>
        <p className={styles.cardSubtext}>{integrations.length} configured, {activeCount} active.</p>
        {loading ? <SettingsPageSkeleton section="webhooks" /> : null}
        {!loading && integrations.length === 0 ? (
          <p className={styles.statusText}>No outbound endpoints yet. Create one to start sending updates.</p>
        ) : null}
        {!loading && integrations.length ? (
          <div className={styles.compactList}>
            {integrations.map((integration) => {
              const events = getEventNames(integration);
              const chips = webhookGroupLabelsFromEvents(events);
              const eventCount = Number(integration.eventCount || 0);
              return (
                <article className={styles.endpointRow} key={integration.id}>
                  <div className={styles.endpointMain}>
                    <p className={styles.endpointTitle}>{integration.name || 'Unnamed endpoint'}</p>
                    <p className={styles.endpointMeta}>{maskDestination(integration.webhookUrl || '')}</p>
                    <div className={`${styles.methodChipRow} ${styles.compactChipRow}`}>
                      {chips.length ? chips.map((chip) => (
                        <span className={styles.methodChip} key={`${integration.id}-${chip}`}>
                          {chip}
                        </span>
                      )) : null}
                      {!chips.length && eventCount > 0 ? (
                        <span className={styles.methodChip}>{eventCount} events configured</span>
                      ) : null}
                      {!chips.length && eventCount === 0 ? <span className={styles.methodChip}>No event groups selected</span> : null}
                    </div>
                  </div>
                  <div className={styles.endpointMain}>
                    <AdminStatusChip tone={formatStatusTone(integration.status)}>{integration.status === 'ACTIVE' ? 'Active' : 'Inactive'}</AdminStatusChip>
                    <p className={styles.endpointMeta}>
                      {integration.updatedAt
                        ? `Updated ${formatDateTimeForDisplay(integration.updatedAt, {
                            timeZone: settings?.timezone,
                            fallbackText: 'Unknown',
                          })}`
                        : 'No recent updates'}
                    </p>
                  </div>
                  <AdminButton onClick={() => openManageDrawer(integration)} size="sm" variant="secondary">
                    Manage
                  </AdminButton>
                </article>
              );
            })}
          </div>
        ) : null}
      </AdminCard>

      <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
          <h4>Needs attention</h4>
          <AdminStatusChip tone={needsAttentionCount ? 'warning' : 'neutral'}>{needsAttentionCount} issues</AdminStatusChip>
        </div>
        {attentionLoading ? <SettingsPageSkeleton section="webhooks" /> : null}
        {!attentionLoading && attentionDeliveries.length === 0 ? (
          <p className={styles.statusText}>No failed or retrying deliveries right now.</p>
        ) : null}
        {!attentionLoading && attentionDeliveries.length ? (
          <div className={styles.compactList}>
            {attentionDeliveries.map((delivery) => (
              <div className={styles.attentionRow} key={delivery.id}>
                <div>
                  <p className={styles.compactInfoStripTitle}>{delivery.integration?.name || 'Outbound endpoint'} {delivery.status.toLowerCase()}</p>
                  <p className={styles.attentionText}>
                    {delivery.lastError || (delivery.statusCode ? `HTTP ${delivery.statusCode}` : 'Delivery needs review')}
                  </p>
                </div>
                <AdminButton onClick={() => window.location.assign('/admin/webhooks')} size="sm" variant="ghost">
                  View logs
                </AdminButton>
              </div>
            ))}
          </div>
        ) : null}
      </AdminCard>

      <AdminDrawer
        onClose={closeDrawer}
        open={Boolean(drawerMode)}
        subtitle={
          drawerMode === 'create'
            ? 'Destination, updates, and signing secret.'
            : 'Update destination, event groups, and endpoint security.'
        }
        title={drawerMode === 'create' ? 'Connect another app' : (editingIntegration?.name || 'Manage endpoint')}
      >
        {drawerMode ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>1. Destination</h4>
              </div>
              <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                <AdminField label="Endpoint name">
                  <AdminInput
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Warehouse sync"
                    value={draft.name}
                  />
                </AdminField>
                <AdminField label="Destination URL">
                  <AdminInput
                    onChange={(event) => setDraft((current) => ({ ...current, webhookUrl: event.target.value }))}
                    placeholder="https://example.com/doopify/webhooks"
                    value={draft.webhookUrl}
                  />
                </AdminField>
              </div>
            </AdminCard>

            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>2. Updates to send</h4>
              </div>
              <div className={styles.groupGrid}>
                {WEBHOOK_EVENT_GROUPS.map((group) => (
                  <label className={styles.groupOption} key={group.id}>
                    <div className={styles.providerTitleLine}>
                      <AdminInput
                        checked={(draft.eventGroupIds || []).includes(group.id)}
                        disabled={Boolean(group.comingSoon)}
                        onChange={() => toggleGroup(group.id)}
                        className={styles.settingsCheckbox} type="checkbox"
                      />
                      <span className={styles.groupOptionTitle}>{group.label}</span>
                      {group.comingSoon ? <AdminStatusChip tone="warning">Coming soon</AdminStatusChip> : null}
                    </div>
                    <p className={styles.groupOptionMeta}>{group.description}</p>
                  </label>
                ))}
              </div>
            </AdminCard>

            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>3. Security</h4>
              </div>
              <p className={styles.compactMeta}>
                Doopify signs outbound requests. Secret values are encrypted and never shown after save.
              </p>
              <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                <AdminField hint={drawerMode === 'create' ? 'Leave blank to auto-generate.' : 'Set a new value to rotate the secret.'} label="Signing secret">
                  <AdminInput
                    onChange={(event) => setDraft((current) => ({ ...current, webhookSecret: event.target.value }))}
                    placeholder="whsec_..."
                    type="password"
                    value={draft.webhookSecret}
                  />
                </AdminField>
                {drawerMode === 'manage' ? (
                  <label className={styles.checkboxField}>
                    <AdminInput
                      checked={Boolean(draft.clearWebhookSecret)}
                      onChange={(event) => setDraft((current) => ({ ...current, clearWebhookSecret: event.target.checked }))}
                      className={styles.settingsCheckbox} type="checkbox"
                    />
                    <span>Clear existing signing secret</span>
                  </label>
                ) : null}
              </div>
            </AdminCard>

            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>4. Test and save</h4>
              </div>
              <p className={styles.compactMeta}>Test send from this drawer is not wired yet. Save first, then validate from Delivery logs.</p>
              <div className={styles.compactActionRow}>
                <AdminButton disabled size="sm" variant="ghost">
                  Send test (coming soon)
                </AdminButton>
                <AdminButton disabled={saving} onClick={handleSave} size="sm" variant="secondary">
                  {saving ? 'Saving...' : (drawerMode === 'create' ? 'Save endpoint' : 'Save changes')}
                </AdminButton>
              </div>
            </AdminCard>

            {drawerMode === 'manage' && editingIntegration ? (
              <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
                <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                  <h4>Advanced</h4>
                </div>
                <p className={styles.compactMeta}>
                  <strong>Exact events:</strong> {uniqueStrings([...webhookEventsFromGroups(draft.eventGroupIds), ...draft.events]).join(', ') || 'None'}
                </p>
                <p className={styles.compactMeta}><strong>Destination:</strong> {editingIntegration.webhookUrl || 'Not set'}</p>
                <p className={styles.compactMeta}><strong>Secret:</strong> masked and encrypted</p>
                <div className={styles.compactActionRow}>
                  <AdminButton onClick={() => window.location.assign('/admin/webhooks')} size="sm" variant="ghost">
                    Open delivery logs
                  </AdminButton>
                  {editingIntegration.status === 'ACTIVE' ? (
                    <AdminButton onClick={() => handleStatusPatch('INACTIVE')} size="sm" variant="ghost">
                      Disable endpoint
                    </AdminButton>
                  ) : (
                    <AdminButton onClick={() => handleStatusPatch('ACTIVE')} size="sm" variant="secondary">
                      Enable endpoint
                    </AdminButton>
                  )}
                  <AdminButton onClick={handleDelete} size="sm" variant="ghost">
                    Delete endpoint
                  </AdminButton>
                </div>
              </AdminCard>
            ) : null}
          </div>
        ) : null}
      </AdminDrawer>
    </div>
  );
}

