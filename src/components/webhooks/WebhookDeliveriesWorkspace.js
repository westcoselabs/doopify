"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../AppShell';
import AdminButton from '../admin/ui/AdminButton';
import AdminCard from '../admin/ui/AdminCard';
import AdminEmptyState from '../admin/ui/AdminEmptyState';
import AdminInput from '../admin/ui/AdminInput';
import AdminPage from '../admin/ui/AdminPage';
import AdminPageHeader from '../admin/ui/AdminPageHeader';
import AdminSelect from '../admin/ui/AdminSelect';
import AdminStatCard, { AdminStatsGrid } from '../admin/ui/AdminStatCard';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import AdminTable from '../admin/ui/AdminTable';
import AdminToolbar from '../admin/ui/AdminToolbar';
import {
  buildDeliveryStats,
  DELIVERY_STATUS_OPTIONS,
  DELIVERY_TYPE_OPTIONS,
  filterDeliveriesBySearch,
  getDeliveryDisplayStatus,
  getModeStatusFilter,
  typeToMode,
} from './delivery-logs.helpers';
import styles from './WebhookDeliveriesWorkspace.module.css';

const EMAIL_TEMPLATE_OPTIONS = [
  { value: 'ALL', label: 'All templates' },
  { value: 'order_confirmation', label: 'Order confirmation' },
  { value: 'fulfillment_tracking', label: 'Fulfillment tracking' },
];
const EMAIL_RESEND_ELIGIBLE_STATUSES = ['FAILED', 'BOUNCED', 'COMPLAINED'];
export const DELIVERY_LOGS_TITLE = 'Delivery logs';
export const DELIVERY_LOGS_SUBTITLE = 'See what Doopify sent or received, what failed, and what will retry. This page is for monitoring - setup lives in Payments, Email, Shipping, and Settings -> Webhooks.';
export const DELIVERY_LOGS_SETUP_COPY = 'Use Settings -> Webhooks to create outbound endpoints. Stripe webhooks are in Payments, email delivery webhooks are in Email, and shipping callbacks are in Shipping.';
export const DELIVERY_LOGS_EMPTY_TITLE = 'No delivery logs yet.';
export const DELIVERY_LOGS_EMPTY_DESCRIPTION = 'Logs will appear here after provider webhooks, outbound webhooks, or customer emails are sent or received.';
export const DELIVERY_LOG_METRIC_LABELS = ['Received', 'Processed', 'Retrying', 'Failed'];
export const RUNNER_VISIBILITY_TITLE = 'Background runners';
export const RUNNER_VISIBILITY_SUBTITLE = 'Track whether cron-triggered or external workers are alive. Compatible with Vercel Cron and any external scheduler that calls POST /api/jobs/run.';
export const EMAIL_JOB_HEALTH_TITLE = 'Email job processing health';
export const EMAIL_JOB_HEALTH_WARNING_COPY = 'Transactional email is async. Order success is already finalized, but delayed runners can delay customer emails.';

function formatTimestamp(value, fallback = 'Not scheduled') {
  if (!value) return fallback;
  return new Date(value).toLocaleString();
}

function formatEventType(value) {
  return String(value || '').replaceAll('_', ' ').replaceAll('.', ' / ');
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 'N/A';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

function getRunnerHealthDisplay(health) {
  if (health === 'healthy') return { label: 'Healthy', tone: 'success' };
  if (health === 'failing') return { label: 'Failing', tone: 'danger' };
  return { label: 'Idle', tone: 'neutral' };
}

function getEmailJobHealthDisplay(level) {
  if (level === 'critical') return { label: 'Needs attention', tone: 'danger' };
  if (level === 'warning') return { label: 'Watch closely', tone: 'warning' };
  return { label: 'Healthy', tone: 'success' };
}

function getReplayDisabledReason(delivery) {
  if (!delivery?.hasVerifiedPayload) return 'Replay needs a verified stored payload.';
  if (delivery.providerEventId?.startsWith('unknown:')) return 'Replay needs a provider event id.';
  if (delivery.status === 'SIGNATURE_FAILED') return 'Signature failures are not replayable.';
  return '';
}

function getEmailResendDisabledReason(delivery) {
  if (!delivery) return 'Email delivery is unavailable.';
  if (!EMAIL_RESEND_ELIGIBLE_STATUSES.includes(delivery.status)) return 'Only failed, bounced, or complained deliveries can be resent.';
  if (delivery.template !== 'order_confirmation') return 'Only order confirmation deliveries support safe resend.';
  if (!delivery.orderId) return 'Safe resend requires a linked order.';
  return '';
}

export default function WebhookDeliveriesWorkspace() {
  const [typeFilter, setTypeFilter] = useState('inbound');
  const mode = typeToMode(typeFilter);

  const [deliveries, setDeliveries] = useState([]);
  const [outboundDeliveries, setOutboundDeliveries] = useState([]);
  const [emailDeliveries, setEmailDeliveries] = useState([]);

  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [outboundPagination, setOutboundPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [emailPagination, setEmailPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [outboundLoading, setOutboundLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  const [replayingId, setReplayingId] = useState(null);
  const [retryingOutboundId, setRetryingOutboundId] = useState(null);
  const [resendingEmailId, setResendingEmailId] = useState(null);

  const [inspectingId, setInspectingId] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [emailInspectingId, setEmailInspectingId] = useState(null);
  const [emailDiagnostics, setEmailDiagnostics] = useState(null);

  const [notice, setNotice] = useState('');
  const [runnerNotice, setRunnerNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [emailTemplate, setEmailTemplate] = useState('ALL');
  const [emailJobHealth, setEmailJobHealth] = useState(null);
  const [runnerStatusRows, setRunnerStatusRows] = useState([]);
  const [runnerStatusLoading, setRunnerStatusLoading] = useState(false);

  const loadDeliveries = useCallback(async (nextPage = 1) => {
    setLoading(true);

    try {
      const inboundStatus = getModeStatusFilter('inbound', statusFilter);
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pagination.pageSize || 20),
      });
      if (search.trim()) params.set('search', search.trim());
      if (inboundStatus !== 'ALL') params.set('status', inboundStatus);

      const response = await fetch(`/api/webhook-deliveries?${params.toString()}`);
      const json = await response.json();
      if (!json.success) {
        setNotice(json.error || 'Webhook deliveries could not be loaded.');
        setDeliveries([]);
        return;
      }

      setDeliveries(json.data.deliveries || []);
      setPagination(json.data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
      setNotice('');
    } catch (error) {
      console.error('[WebhookDeliveriesWorkspace] load failed', error);
      setNotice('Webhook deliveries could not be loaded.');
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, search, statusFilter]);

  const loadOutboundDeliveries = useCallback(async (nextPage = 1) => {
    setOutboundLoading(true);

    try {
      const outboundStatus = getModeStatusFilter('outbound', statusFilter);
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(outboundPagination.pageSize || 20),
      });
      if (outboundStatus !== 'ALL') params.set('status', outboundStatus);

      const response = await fetch(`/api/outbound-webhook-deliveries?${params.toString()}`);
      const json = await response.json();
      if (!json.success) {
        setNotice(json.error || 'Outbound webhook deliveries could not be loaded.');
        setOutboundDeliveries([]);
        return;
      }

      setOutboundDeliveries(json.data.deliveries || []);
      setOutboundPagination(json.data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
      setNotice('');
    } catch (error) {
      console.error('[WebhookDeliveriesWorkspace] outbound load failed', error);
      setNotice('Outbound webhook deliveries could not be loaded.');
      setOutboundDeliveries([]);
    } finally {
      setOutboundLoading(false);
    }
  }, [outboundPagination.pageSize, statusFilter]);

  const loadEmailDeliveries = useCallback(async (nextPage = 1) => {
    setEmailLoading(true);

    try {
      const emailStatus = getModeStatusFilter('email', statusFilter);
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(emailPagination.pageSize || 20),
      });
      if (emailStatus !== 'ALL') params.set('status', emailStatus);
      if (emailTemplate !== 'ALL') params.set('template', emailTemplate);

      const response = await fetch(`/api/email-deliveries?${params.toString()}`, { cache: 'no-store' });
      const json = await response.json();
      if (!json.success) {
        setNotice(json.error || 'Email deliveries could not be loaded.');
        setEmailDeliveries([]);
        setEmailJobHealth(null);
        return;
      }

      setEmailDeliveries(json.data.deliveries || []);
      setEmailJobHealth(json.data.jobHealth || null);
      setEmailPagination(json.data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
      setNotice('');
    } catch (error) {
      console.error('[WebhookDeliveriesWorkspace] email load failed', error);
      setNotice('Email deliveries could not be loaded.');
      setEmailDeliveries([]);
      setEmailJobHealth(null);
    } finally {
      setEmailLoading(false);
    }
  }, [emailPagination.pageSize, statusFilter, emailTemplate]);

  const loadRunnerStatus = useCallback(async () => {
    setRunnerStatusLoading(true);

    try {
      const response = await fetch('/api/jobs/runner-status', { cache: 'no-store' });
      const json = await response.json();

      if (!json.success) {
        setRunnerStatusRows([]);
        setRunnerNotice(json.error || 'Runner status could not be loaded.');
        return;
      }

      setRunnerStatusRows(json.data?.runners || []);
      setRunnerNotice('');
    } catch (error) {
      console.error('[WebhookDeliveriesWorkspace] runner status load failed', error);
      setRunnerStatusRows([]);
      setRunnerNotice('Runner status could not be loaded.');
    } finally {
      setRunnerStatusLoading(false);
    }
  }, []);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    if (mode === 'inbound') loadDeliveries(1);
  }, [mode, loadDeliveries]);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    if (mode === 'outbound') loadOutboundDeliveries(1);
  }, [mode, loadOutboundDeliveries]);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    if (mode === 'email') loadEmailDeliveries(1);
  }, [mode, loadEmailDeliveries]);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    loadRunnerStatus();
  }, [loadRunnerStatus]);

  const stats = useMemo(
    () =>
      buildDeliveryStats({
        mode,
        inboundRows: deliveries,
        outboundRows: outboundDeliveries,
        emailRows: emailDeliveries,
        totals: {
          inbound: pagination.total,
          outbound: outboundPagination.total,
          email: emailPagination.total,
        },
      }),
    [
      deliveries,
      emailDeliveries,
      emailPagination.total,
      mode,
      outboundDeliveries,
      outboundPagination.total,
      pagination.total,
    ]
  );

  async function handleReplay(delivery) {
    if (!delivery?.id) return;

    const disabledReason = getReplayDisabledReason(delivery);
    if (disabledReason) {
      setNotice(disabledReason);
      return;
    }

    setReplayingId(delivery.id);
    setNotice('');

    try {
      const response = await fetch(`/api/webhook-deliveries/${delivery.id}/replay`, { method: 'POST' });
      const json = await response.json();

      if (!json.success) {
        setNotice(json.error || 'Webhook replay failed.');
        return;
      }

      setNotice(`Replay completed for ${delivery.providerEventId}.`);
      await loadDeliveries(pagination.page);
      await loadDiagnostics(delivery.id, false);
    } catch (error) {
      console.error('[WebhookDeliveriesWorkspace] replay failed', error);
      setNotice('Webhook replay failed.');
    } finally {
      setReplayingId(null);
    }
  }

  async function handleRetryOutbound(delivery) {
    if (!delivery?.id) return;
    setRetryingOutboundId(delivery.id);
    setNotice('');

    try {
      const response = await fetch(`/api/outbound-webhook-deliveries/${delivery.id}/retry`, { method: 'POST' });
      const json = await response.json();
      if (!json.success) {
        setNotice(json.error || 'Outbound webhook retry failed.');
        return;
      }

      setNotice(`Outbound delivery ${delivery.id.slice(0, 8)} retried.`);
      await loadOutboundDeliveries(outboundPagination.page);
    } catch (error) {
      console.error('[WebhookDeliveriesWorkspace] outbound retry failed', error);
      setNotice('Outbound webhook retry failed.');
    } finally {
      setRetryingOutboundId(null);
    }
  }

  async function handleResendEmail(delivery) {
    if (!delivery?.id) return;
    setResendingEmailId(delivery.id);
    setNotice('');

    try {
      const response = await fetch(`/api/email-deliveries/${delivery.id}/resend`, { method: 'POST' });
      const json = await response.json();
      if (!json.success) {
        setNotice(json.error || 'Email resend failed.');
        return;
      }

      const resentId = json.data?.id ? String(json.data.id).slice(0, 8) : 'new delivery';
      setNotice(`Email resent successfully (${resentId}).`);
      await loadEmailDeliveries(emailPagination.page);
      await loadEmailDiagnostics(delivery.id, false);
    } catch (error) {
      console.error('[WebhookDeliveriesWorkspace] email resend failed', error);
      setNotice('Email resend failed.');
    } finally {
      setResendingEmailId(null);
    }
  }

  async function loadDiagnostics(deliveryId, showLoading = true) {
    if (!deliveryId) return;

    if (showLoading) {
      setInspectingId(deliveryId);
      setDiagnostics(null);
    }

    try {
      const response = await fetch(`/api/webhook-deliveries/${deliveryId}`, { cache: 'no-store' });
      const json = await response.json();
      if (!json.success) {
        setNotice(json.error || 'Webhook diagnostics could not be loaded.');
        return;
      }

      setDiagnostics(json.data);
      setNotice('');
    } catch (error) {
      console.error('[WebhookDeliveriesWorkspace] diagnostics failed', error);
      setNotice('Webhook diagnostics could not be loaded.');
    } finally {
      if (showLoading) setInspectingId(null);
    }
  }

  async function loadEmailDiagnostics(deliveryId, showLoading = true) {
    if (!deliveryId) return;

    if (showLoading) {
      setEmailInspectingId(deliveryId);
      setEmailDiagnostics(null);
    }

    try {
      const response = await fetch(`/api/email-deliveries/${deliveryId}`, { cache: 'no-store' });
      const json = await response.json();
      if (!json.success) {
        setNotice(json.error || 'Email delivery details could not be loaded.');
        return;
      }

      setEmailDiagnostics(json.data);
      setNotice('');
    } catch (error) {
      console.error('[WebhookDeliveriesWorkspace] email diagnostics failed', error);
      setNotice('Email delivery details could not be loaded.');
    } finally {
      if (showLoading) setEmailInspectingId(null);
    }
  }

  const isInbound = mode === 'inbound';
  const isOutbound = mode === 'outbound';
  const isEmail = mode === 'email';

  const sourceRows = isInbound ? deliveries : isOutbound ? outboundDeliveries : emailDeliveries;
  const activeRows = useMemo(
    () => filterDeliveriesBySearch(mode, sourceRows, search),
    [mode, search, sourceRows]
  );
  const activeLoading = isInbound ? loading : isOutbound ? outboundLoading : emailLoading;

  const columns = useMemo(() => {
    if (isOutbound) {
      return [
        {
          key: 'date',
          header: 'Date',
          render: (delivery) => (
            <div className={styles.cellStack}>
              <strong>{formatTimestamp(delivery.createdAt, 'Unknown')}</strong>
              <small>Updated: {formatTimestamp(delivery.updatedAt, 'Unknown')}</small>
            </div>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          render: (delivery) => {
            const display = getDeliveryDisplayStatus('outbound', delivery.status);
            return <AdminStatusChip tone={display.tone}>{display.label}</AdminStatusChip>;
          },
        },
        {
          key: 'summary',
          header: 'Delivery summary',
          render: (delivery) => (
            <div className={styles.cellStack}>
              <strong>{formatEventType(delivery.event)}</strong>
              <small>
                Outbound webhook · {delivery.integration?.name || 'Integration'} ·{' '}
                {delivery.statusCode ? `HTTP ${delivery.statusCode}` : (delivery.lastError || 'Awaiting response')}
              </small>
            </div>
          ),
        },
        {
          key: 'source',
          header: 'Destination',
          render: (delivery) => (
            <div className={styles.cellStack}>
              <strong>{delivery.integration?.name || 'Integration'}</strong>
              <small>{delivery.integration?.webhookUrl || 'No URL'}</small>
            </div>
          ),
        },
        {
          key: 'attempts',
          header: 'Attempts',
          render: (delivery) => (
            <div className={styles.cellStack}>
              <strong>{delivery.attempts}</strong>
              <small>Last retry: {formatTimestamp(delivery.lastRetriedAt, 'Never')}</small>
            </div>
          ),
        },
        { key: 'response', header: 'Response', render: (delivery) => delivery.statusCode || '-' },
        {
          key: 'actions',
          header: 'Action',
          render: (delivery) => (
            <div className={styles.actionGroup}>
              <AdminButton
                onClick={() => setNotice(`Outbound delivery ${delivery.id.slice(0, 8)} · ${delivery.integration?.name || 'Integration'} · ${delivery.lastError || 'No error details recorded.'}`)}
                size="sm"
                variant="secondary"
              >
                View
              </AdminButton>
              <AdminButton disabled={retryingOutboundId === delivery.id} onClick={() => handleRetryOutbound(delivery)} size="sm" variant="secondary">
                {retryingOutboundId === delivery.id ? 'Retrying...' : 'Retry'}
              </AdminButton>
            </div>
          ),
        },
      ];
    }

    if (isEmail) {
      return [
        {
          key: 'date',
          header: 'Date',
          render: (delivery) => (
            <div className={styles.cellStack}>
              <strong>{formatTimestamp(delivery.createdAt, 'Unknown')}</strong>
              <small>Updated: {formatTimestamp(delivery.updatedAt, 'Unknown')}</small>
            </div>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          render: (delivery) => {
            const display = getDeliveryDisplayStatus('email', delivery.status);
            return <AdminStatusChip tone={display.tone}>{display.label}</AdminStatusChip>;
          },
        },
        {
          key: 'summary',
          header: 'Delivery summary',
          render: (delivery) => (
            <div className={styles.cellStack}>
              <strong>{delivery.subject || formatEventType(delivery.template)}</strong>
              <small>
                Email delivery · {formatEventType(delivery.template)} · {delivery.recipientEmail}
              </small>
            </div>
          ),
        },
        {
          key: 'provider',
          header: 'Provider/source',
          render: (delivery) => (
            <div className={styles.cellStack}>
              <strong>{delivery.provider}</strong>
              <small>Order: {delivery.orderId || 'N/A'}</small>
            </div>
          ),
        },
        { key: 'attempts', header: 'Attempts', render: (delivery) => delivery.attempts },
        {
          key: 'actions',
          header: 'Action',
          render: (delivery) => {
            const resendDisabledReason = getEmailResendDisabledReason(delivery);
            return (
              <div className={styles.actionGroup}>
                <AdminButton disabled={emailInspectingId === delivery.id} onClick={() => loadEmailDiagnostics(delivery.id)} size="sm" variant="secondary">
                  {emailInspectingId === delivery.id ? 'Loading...' : 'View'}
                </AdminButton>
                <AdminButton
                  disabled={resendingEmailId === delivery.id || Boolean(resendDisabledReason)}
                  onClick={() => handleResendEmail(delivery)}
                  size="sm"
                  title={resendDisabledReason || 'Safely resend this transactional email'}
                  variant="secondary"
                >
                  {resendingEmailId === delivery.id ? 'Resending...' : 'Retry'}
                </AdminButton>
              </div>
            );
          },
        },
      ];
    }

    return [
      {
        key: 'date',
        header: 'Date',
        render: (delivery) => (
          <div className={styles.cellStack}>
            <strong>{formatTimestamp(delivery.createdAt, 'Unknown')}</strong>
            <small>Updated: {formatTimestamp(delivery.updatedAt, 'Unknown')}</small>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (delivery) => {
          const display = getDeliveryDisplayStatus('inbound', delivery.status);
          return <AdminStatusChip tone={display.tone}>{display.label}</AdminStatusChip>;
        },
      },
      {
        key: 'summary',
        header: 'Delivery summary',
        render: (delivery) => (
          <div className={styles.cellStack}>
            <strong>{formatEventType(delivery.eventType)}</strong>
            <small>
              Provider inbound · {delivery.provider} · {delivery.providerEventId}
            </small>
          </div>
        ),
      },
      {
        key: 'source',
        header: 'Provider/source',
        render: (delivery) => (
          <div className={styles.cellStack}>
            <strong>{delivery.provider}</strong>
            <small>{delivery.hasVerifiedPayload ? 'Verified local payload' : 'Hash only'}</small>
          </div>
        ),
      },
      {
        key: 'attempts',
        header: 'Attempts',
        render: (delivery) => (
          <div className={styles.cellStack}>
            <strong>{delivery.attempts}</strong>
            <small>Last retry: {formatTimestamp(delivery.lastRetriedAt, 'Never')}</small>
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'Action',
        render: (delivery) => {
          const disabledReason = getReplayDisabledReason(delivery);
          return (
            <div className={styles.actionGroup}>
              <AdminButton
                disabled={replayingId === delivery.id || Boolean(disabledReason)}
                onClick={() => handleReplay(delivery)}
                size="sm"
                title={disabledReason || 'Replay stored payload'}
                variant="secondary"
              >
                {replayingId === delivery.id ? 'Replaying...' : 'Retry'}
              </AdminButton>
              <AdminButton disabled={inspectingId === delivery.id} onClick={() => loadDiagnostics(delivery.id)} size="sm" variant="secondary">
                {inspectingId === delivery.id ? 'Inspecting...' : 'View'}
              </AdminButton>
            </div>
          );
        },
      },
    ];
  }, [
    emailInspectingId,
    inspectingId,
    isEmail,
    isOutbound,
    replayingId,
    resendingEmailId,
    retryingOutboundId,
  ]);

  const currentPage = isInbound ? pagination.page : isOutbound ? outboundPagination.page : emailPagination.page;
  const totalPages = isInbound ? (pagination.totalPages || 1) : isOutbound ? (outboundPagination.totalPages || 1) : (emailPagination.totalPages || 1);

  const changePage = (nextPage) => {
    if (isInbound) return loadDeliveries(nextPage);
    if (isOutbound) return loadOutboundDeliveries(nextPage);
    return loadEmailDeliveries(nextPage);
  };

  return (
    <AppShell>
      <AdminPage>
        <AdminPageHeader
          description={DELIVERY_LOGS_SUBTITLE}
          eyebrow="System"
          title={DELIVERY_LOGS_TITLE}
          actions={<AdminButton onClick={() => changePage(currentPage)} size="sm" variant="secondary">Refresh</AdminButton>}
        />

        <AdminCard className={styles.setupCallout} variant="card">
          <div className={styles.setupCalloutHeader}>
            <h3>Looking to set something up?</h3>
            <p>
              {DELIVERY_LOGS_SETUP_COPY}
            </p>
          </div>
          <div className={styles.linkRow}>
            <Link className="admin-btn admin-btn--secondary admin-btn--sm" href="/settings?section=webhooks">Manage outbound webhooks</Link>
            <Link className="admin-btn admin-btn--secondary admin-btn--sm" href="/settings?section=email">Email settings</Link>
            <Link className="admin-btn admin-btn--secondary admin-btn--sm" href="/settings?section=payments">Payment settings</Link>
          </div>
        </AdminCard>

        <AdminCard className={styles.runnerPanel} variant="card">
          <div className={styles.runnerHeader}>
            <div>
              <h3>{RUNNER_VISIBILITY_TITLE}</h3>
              <p>{RUNNER_VISIBILITY_SUBTITLE}</p>
            </div>
            <AdminButton disabled={runnerStatusLoading} onClick={loadRunnerStatus} size="sm" variant="secondary">
              {runnerStatusLoading ? 'Refreshing...' : 'Refresh status'}
            </AdminButton>
          </div>

          {runnerNotice ? <p className={styles.notice}>{runnerNotice}</p> : null}

          {runnerStatusRows.length ? (
            <div className={styles.runnerGrid}>
              {runnerStatusRows.map((runner) => {
                const health = getRunnerHealthDisplay(runner.health);

                return (
                  <div className={styles.runnerRow} key={runner.runnerName}>
                    <div className={styles.runnerRowTop}>
                      <strong>{runner.runnerName}</strong>
                      <AdminStatusChip tone={health.tone}>{health.label}</AdminStatusChip>
                    </div>
                    <div className={styles.runnerRowMeta}>
                      <span>Started: {formatTimestamp(runner.lastStartedAt, 'Never')}</span>
                      <span>Succeeded: {formatTimestamp(runner.lastSucceededAt, 'Never')}</span>
                      <span>Failed: {formatTimestamp(runner.lastFailedAt, 'Never')}</span>
                      <span>Duration: {formatDuration(runner.lastDurationMs)}</span>
                      {runner.lastErrorSummary ? <span>Error: {runner.lastErrorSummary}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.runnerEmpty}>No runner heartbeats yet. Trigger POST /api/jobs/run from Vercel Cron or an external worker to start tracking.</p>
          )}
        </AdminCard>

        {isEmail && emailJobHealth ? (
          <AdminCard className={styles.emailHealthPanel} variant="card">
            <div className={styles.emailHealthHeader}>
              <div>
                <h3>{EMAIL_JOB_HEALTH_TITLE}</h3>
                <p>{EMAIL_JOB_HEALTH_WARNING_COPY}</p>
              </div>
              <AdminStatusChip tone={getEmailJobHealthDisplay(emailJobHealth.level).tone}>
                {getEmailJobHealthDisplay(emailJobHealth.level).label}
              </AdminStatusChip>
            </div>
            <p className={styles.notice}>{emailJobHealth.message}</p>
            <div className={styles.emailHealthGrid}>
              <div><span>Queued</span><strong>{emailJobHealth.queuedCount}</strong></div>
              <div><span>Due now</span><strong>{emailJobHealth.dueCount}</strong></div>
              <div><span>Running</span><strong>{emailJobHealth.runningCount}</strong></div>
              <div><span>Failed/exhausted</span><strong>{emailJobHealth.failedCount}</strong></div>
              <div>
                <span>Oldest due age</span>
                <strong>{emailJobHealth.oldestDueAgeMinutes == null ? 'N/A' : `${emailJobHealth.oldestDueAgeMinutes}m`}</strong>
              </div>
              <div><span>Runner health</span><strong>{emailJobHealth.runner?.health || 'unknown'}</strong></div>
            </div>
          </AdminCard>
        ) : null}

        <AdminStatsGrid>
          <AdminStatCard label={DELIVERY_LOG_METRIC_LABELS[0]} value={String(stats.received || 0)} />
          <AdminStatCard label={DELIVERY_LOG_METRIC_LABELS[1]} value={String(stats.processed || 0)} />
          <AdminStatCard label={DELIVERY_LOG_METRIC_LABELS[2]} value={String(stats.retrying || 0)} />
          <AdminStatCard label={DELIVERY_LOG_METRIC_LABELS[3]} value={String(stats.failed || 0)} />
        </AdminStatsGrid>

        <div className={styles.categoryGrid}>
          <AdminCard className={styles.categoryCard} variant="card">
            <h3>Provider webhooks</h3>
            <p>Stripe, email, and shipping providers sending events into Doopify.</p>
          </AdminCard>
          <AdminCard className={styles.categoryCard} variant="card">
            <h3>Outbound webhooks</h3>
            <p>Doopify sending store updates to external apps and endpoints.</p>
          </AdminCard>
          <AdminCard className={styles.categoryCard} variant="card">
            <h3>Email deliveries</h3>
            <p>Doopify sending customer and admin emails.</p>
          </AdminCard>
        </div>

        <AdminCard className={styles.panel} variant="panel">
          <div className={styles.sectionHeader}>
            <h2>Recent deliveries</h2>
            <p>Filter by type, status, event id, order, customer, provider, or error.</p>
          </div>

          <AdminToolbar
            actions={isEmail ? <AdminSelect onChange={setEmailTemplate} options={EMAIL_TEMPLATE_OPTIONS} value={emailTemplate} /> : null}
          >
            <AdminSelect
              onChange={(value) => {
                if (value === 'all') {
                  setTypeFilter('inbound');
                  setNotice('Combined all-types view is not available yet. Showing Provider inbound logs.');
                  return;
                }
                setTypeFilter(value);
                setNotice('');
              }}
              options={DELIVERY_TYPE_OPTIONS}
              value={typeFilter}
            />
            <AdminSelect onChange={setStatusFilter} options={DELIVERY_STATUS_OPTIONS} value={statusFilter} />
            <AdminInput
              className={styles.searchInput}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search event id, order, customer, provider, or error..."
              type="search"
              value={search}
            />
          </AdminToolbar>

          {notice ? <p className={styles.notice}>{notice}</p> : null}

          {activeRows.length || activeLoading ? (
            <AdminTable columns={columns} isLoading={activeLoading} rows={activeRows} />
          ) : (
            <AdminEmptyState
              action={
                <div className={styles.emptyLinks}>
                  <Link className="admin-btn admin-btn--secondary admin-btn--sm" href="/settings?section=webhooks">Manage outbound webhooks</Link>
                  <Link className="admin-btn admin-btn--secondary admin-btn--sm" href="/settings?section=email">Set up email</Link>
                  <Link className="admin-btn admin-btn--secondary admin-btn--sm" href="/settings?section=payments">Set up payments</Link>
                </div>
              }
              description={DELIVERY_LOGS_EMPTY_DESCRIPTION}
              icon="sync_problem"
              title={DELIVERY_LOGS_EMPTY_TITLE}
            />
          )}

          {isInbound && diagnostics ? (
            <AdminCard className={styles.diagnostics} variant="card">
              <h3>Support diagnostics</h3>
              <p>{diagnostics.delivery.providerEventId}</p>
              <div className={styles.diagnosticGrid}>
                <div><span>Status</span><strong>{diagnostics.delivery.status}</strong></div>
                <div><span>Verified payload</span><strong>{diagnostics.delivery.hasVerifiedPayload ? `${diagnostics.delivery.rawPayloadBytes} bytes` : 'No'}</strong></div>
                <div><span>Can retry</span><strong>{diagnostics.retryPolicy.canRetry ? 'Yes' : 'No'}</strong></div>
                <div><span>Payment intent</span><strong>{diagnostics.related.paymentIntentId || 'Unknown'}</strong></div>
              </div>
            </AdminCard>
          ) : null}

          {isEmail && emailDiagnostics ? (
            <AdminCard className={styles.diagnostics} variant="card">
              <h3>Email details</h3>
              <p>{emailDiagnostics.delivery.recipientEmail}</p>
              <div className={styles.diagnosticGrid}>
                <div><span>Status</span><strong>{emailDiagnostics.delivery.status}</strong></div>
                <div><span>Template</span><strong>{formatEventType(emailDiagnostics.delivery.template)}</strong></div>
                <div><span>Can resend</span><strong>{emailDiagnostics.resendPolicy.canResend ? 'Yes' : 'No'}</strong></div>
                <div><span>Provider</span><strong>{emailDiagnostics.delivery.provider}</strong></div>
              </div>
            </AdminCard>
          ) : null}

          <div className={styles.pagination}>
            <AdminButton disabled={activeLoading || currentPage <= 1} onClick={() => changePage(currentPage - 1)} size="sm" variant="secondary">Previous</AdminButton>
            <span>Page {currentPage} of {totalPages}</span>
            <AdminButton disabled={activeLoading || currentPage >= totalPages} onClick={() => changePage(currentPage + 1)} size="sm" variant="secondary">Next</AdminButton>
          </div>
        </AdminCard>
      </AdminPage>
    </AppShell>
  );
}


