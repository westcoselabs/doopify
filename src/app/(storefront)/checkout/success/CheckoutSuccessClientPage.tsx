"use client";

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useCart } from '@/context/CartContext';

type CheckoutStatus = 'processing' | 'paid' | 'failed'

type CheckoutStatusResponseData = {
  status: CheckoutStatus
  orderNumber?: number | string | null
  total?: number
  currency?: string
  estimatedDeliveryText?: string | null
  digitalDownloads?: Array<{
    fileName: string
    title: string
    downloadUrl: string
    expiresAt: string
    downloadLimit: number
    downloadCount: number
  }>
  digitalDownloadsPending?: boolean
  reason?: string
}

type PublicStoreSettings = {
  name?: string
  supportEmail?: string | null
  email?: string | null
  phone?: string | null
}

type ApiSuccess<TData> = {
  success: true
  data: TData
}

type ApiFailure = {
  success: false
  error?: string
}

type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure

type CartContextValue = {
  clearCart: () => void
}

const STATUS_POLL_INTERVAL_MS = 2000
const STATUS_WAIT_TIMEOUT_MS = 90000

function getApiErrorMessage<TData>(payload: ApiResponse<TData> | null, fallback: string): string {
  if (payload && !payload.success && payload.error) {
    return payload.error
  }

  return fallback
}

function formatMoney(amount: number | null | undefined, currency = 'USD'): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'USD').toUpperCase(),
  }).format(amount)
}

function formatDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function formatDownloadAvailability(entry: {
  expiresAt: string
  downloadLimit: number
  downloadCount: number
}) {
  const limit = Number(entry.downloadLimit)
  const used = Number(entry.downloadCount)
  const hasLimit = Number.isFinite(limit) && limit > 0
  const hasUsed = Number.isFinite(used) && used >= 0
  const expiryText = `Expires ${formatDate(entry.expiresAt) || 'soon'}`

  if (!hasLimit || !hasUsed) {
    return expiryText
  }

  const remaining = Math.max(limit - used, 0)
  return `${remaining} download${remaining === 1 ? '' : 's'} remaining · ${expiryText}`
}

const CHECKOUT_RESULT_PRIMARY_ACTION_STYLE = {
  background: 'var(--checkout-button-bg)',
  color: 'var(--checkout-button-text)',
  border: '1px solid var(--checkout-button-border)',
  borderRadius: 'var(--checkout-button-radius)',
  textTransform: 'var(--checkout-button-transform)',
} as const

function buildPhoneHref(rawPhone: string) {
  const normalized = rawPhone.replace(/[^\d+]/g, '')
  if (!normalized) return ''
  return `tel:${normalized}`
}

function resolveSupportSummary(store: PublicStoreSettings | null) {
  const supportEmail = String(store?.supportEmail || store?.email || '').trim()
  const supportPhone = String(store?.phone || '').trim()

  if (!supportEmail && !supportPhone) {
    return {
      helpText: 'Contact the store for help with your order.',
      detailText: '',
      supportEmail: '',
      supportPhone: '',
      supportPhoneHref: '',
    }
  }

  const parts = [supportEmail, supportPhone].filter(Boolean)
  return {
    helpText: 'Contact the store for help with your order.',
    detailText: `Questions? Contact ${parts.join(' | ')}`,
    supportEmail,
    supportPhone,
    supportPhoneHref: buildPhoneHref(supportPhone),
  }
}
type ViewState = 'processing' | 'confirmed' | 'pending' | 'failed'
type PendingState = 'none' | 'delayed' | 'poll_error'

const DELAYED_STATUS_THRESHOLD_MS = 8000
const LONG_WAIT_SUPPORT_HINT_MS = 60000

function formatPaymentReference(paymentIntentId: string | null) {
  if (!paymentIntentId) return ''

  const normalized = paymentIntentId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (!normalized) return ''

  if (normalized.length <= 10) return normalized
  return `${normalized.slice(0, 4)}-${normalized.slice(-6)}`
}

export default function CheckoutSuccessClientPage() {
  const searchParams = useSearchParams();
  const paymentIntentId = searchParams.get('payment_intent');
  const { clearCart } = useCart() as CartContextValue;

  const [status, setStatus] = useState<CheckoutStatus>('processing');
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [orderCurrency, setOrderCurrency] = useState('USD');
  const [estimatedDeliveryText, setEstimatedDeliveryText] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [digitalDownloads, setDigitalDownloads] = useState<CheckoutStatusResponseData['digitalDownloads']>([]);
  const [digitalDownloadsPending, setDigitalDownloadsPending] = useState(false);
  const [pendingState, setPendingState] = useState<PendingState>('none');
  const [showLongWaitSupportHint, setShowLongWaitSupportHint] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [pollCycle, setPollCycle] = useState(0);
  const [store, setStore] = useState<PublicStoreSettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStoreSettings() {
      try {
        const response = await fetch('/api/storefront/settings', { cache: 'no-store' });
        const payload = (await response.json().catch(() => null)) as ApiResponse<PublicStoreSettings> | null;
        if (!response.ok || !payload?.success) return;
        if (!cancelled) setStore(payload.data || null);
      } catch {
        if (!cancelled) setStore(null);
      }
    }

    loadStoreSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const startedAt = Date.now();

    async function pollStatus() {
      if (!paymentIntentId) {
        setStatus('processing');
        return;
      }

      try {
        const response = await fetch(`/api/checkout/status?payment_intent=${encodeURIComponent(paymentIntentId)}`, {
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as ApiResponse<CheckoutStatusResponseData> | null;

        if (!response.ok || !payload?.success) {
          throw new Error(getApiErrorMessage(payload, 'We could not check your order status right now.'));
        }

        if (cancelled) return;

        const nextStatus = payload.data.status;
        setStatus(nextStatus);

        if (nextStatus === 'paid') {
          setOrderNumber(payload.data.orderNumber ? String(payload.data.orderNumber) : null);
          setOrderTotal(typeof payload.data.total === 'number' ? payload.data.total : null);
          setOrderCurrency(String(payload.data.currency || 'USD'));
          setEstimatedDeliveryText(String(payload.data.estimatedDeliveryText || '').trim());
          setFailureReason('');
          setDigitalDownloads(Array.isArray(payload.data.digitalDownloads) ? payload.data.digitalDownloads : []);
          setDigitalDownloadsPending(Boolean(payload.data.digitalDownloadsPending));
          setPendingState('none');
          setPendingMessage('');
          setShowLongWaitSupportHint(false);
          clearCart();
          return;
        }

        if (nextStatus === 'failed') {
          setFailureReason('Please return to checkout and try another payment method.');
          setDigitalDownloads([]);
          setDigitalDownloadsPending(false);
          setPendingState('none');
          setPendingMessage('');
          setShowLongWaitSupportHint(false);
          return;
        }

        const elapsedMs = Date.now() - startedAt
        const isDelayed = elapsedMs >= DELAYED_STATUS_THRESHOLD_MS
        const hitLongWaitHint = elapsedMs >= LONG_WAIT_SUPPORT_HINT_MS
        const hitPollingTimeout = elapsedMs >= STATUS_WAIT_TIMEOUT_MS

        if (isDelayed) {
          setPendingState('delayed')
          setPendingMessage("Payment received. We're still finalizing your order.")
        } else {
          setPendingState('none')
          setPendingMessage('')
        }

        if (hitLongWaitHint) {
          setShowLongWaitSupportHint(true)
        }

        if (hitPollingTimeout) {
          return;
        }

        timer = window.setTimeout(pollStatus, STATUS_POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) {
          const elapsedMs = Date.now() - startedAt
          setPendingState('poll_error')
          setPendingMessage("We couldn't confirm your order status due to a network issue.")
          if (elapsedMs >= LONG_WAIT_SUPPORT_HINT_MS) {
            setShowLongWaitSupportHint(true)
          }
        }
      }
    }

    pollStatus();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [clearCart, paymentIntentId, pollCycle]);

  const support = useMemo(() => resolveSupportSummary(store), [store]);
  const paymentReference = useMemo(() => formatPaymentReference(paymentIntentId), [paymentIntentId])
  const primaryActionStyle = CHECKOUT_RESULT_PRIMARY_ACTION_STYLE;
  const viewState: ViewState =
    status === 'paid'
      ? 'confirmed'
      : status === 'failed'
        ? 'failed'
        : pendingState !== 'none'
          ? 'pending'
          : 'processing';

  function handleCheckAgain() {
    setPendingState('none');
    setPendingMessage('');
    setShowLongWaitSupportHint(false);
    setPollCycle((current) => current + 1);
  }

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box}
        .checkout-result-root{min-height:100vh;background:var(--checkout-bg);color:var(--checkout-text);font-family:var(--font-body),sans-serif;display:flex;align-items:center;justify-content:center;padding:28px}
        .checkout-result-shell{width:min(640px,100%);display:flex;flex-direction:column;gap:18px;align-items:center;text-align:center}
        .badge{font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--checkout-muted)}
        .title{margin:0;font-family:var(--font-headline),sans-serif;font-size:clamp(34px,7vw,54px);line-height:0.96;letter-spacing:-0.04em}
        .body{margin:0;color:var(--checkout-muted);font-size:15px;line-height:1.75;max-width:58ch}
        .spinner{width:56px;height:56px;border-radius:999px;border:3px solid color-mix(in srgb, var(--checkout-text) 22%, transparent);border-top-color:var(--checkout-accent);animation:spin .9s linear infinite}
        .order-pill{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:color-mix(in srgb, var(--checkout-text) 6%, transparent);border:1px solid color-mix(in srgb, var(--checkout-text) 14%, transparent);font-size:12px;letter-spacing:.1em;text-transform:uppercase}
        .meta{display:flex;flex-direction:column;gap:8px;align-items:center}
        .actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:6px}
        .btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;border:none;cursor:pointer;font-family:inherit}
        .btn-primary{background:var(--checkout-button-bg);color:var(--checkout-button-text);border:1px solid var(--checkout-button-border)}
        .btn-secondary{background:transparent;color:var(--checkout-text);border:1px solid color-mix(in srgb, var(--checkout-text) 20%, transparent)}
        .btn-tertiary{background:color-mix(in srgb, var(--checkout-text) 8%, transparent);color:var(--checkout-text);border:1px solid color-mix(in srgb, var(--checkout-text) 12%, transparent)}
        .support{font-size:15px;color:color-mix(in srgb, var(--checkout-text) 78%, transparent)}
        .support-subtle{font-size:13px;color:var(--checkout-muted)}
        .support-links{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:4px}
        .support-link{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:999px;border:1px solid color-mix(in srgb, var(--checkout-text) 22%, transparent);background:color-mix(in srgb, var(--checkout-text) 8%, transparent);color:var(--checkout-text);font-size:14px;line-height:1;text-decoration:none}
        .downloads-card{width:min(560px,100%);margin-top:10px;padding:18px;border-radius:16px;text-align:left;border:1px solid color-mix(in srgb, var(--checkout-text) 14%, transparent);background:color-mix(in srgb, var(--checkout-text) 6%, transparent)}
        .downloads-title{margin:0 0 10px;font-size:17px;line-height:1.35}
        .downloads-note{margin:10px 0 0;font-size:13px;color:var(--checkout-muted)}
        .downloads-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
        .downloads-item{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px;border:1px solid color-mix(in srgb, var(--checkout-text) 12%, transparent);border-radius:12px;background:rgba(255,255,255,0.02)}
        .download-meta{display:flex;flex-direction:column;gap:4px}
        .download-name{font-size:14px;color:var(--checkout-text)}
        .download-helper{font-size:12px;color:var(--checkout-muted)}
        .download-btn{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--checkout-button-border);background:var(--checkout-button-bg);color:var(--checkout-button-text);font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <div className="checkout-result-root">
        <div className="checkout-result-shell">
          {viewState === 'processing' ? (
            <>
              <div className="spinner" aria-hidden />
              <p className="badge">Order update</p>
              <h1 className="title">Confirming your order...</h1>
              <p className="body">
                We&apos;re confirming your payment and preparing your order. This usually only takes a few seconds.
              </p>
              <p className="support">Please don&apos;t close or refresh this page.</p>
            </>
          ) : null}

          {viewState === 'confirmed' ? (
            <>
              <p className="badge">Order received</p>
              <h1 className="title">Thank you for your order</h1>
              <p className="body">Your payment was successful and your order has been received.</p>
              <div className="meta">
                {orderNumber ? <div className="order-pill">Order #{orderNumber}</div> : null}
                {orderTotal != null ? (
                  <p className="support">Total: {formatMoney(orderTotal, orderCurrency)}</p>
                ) : null}
                <p className="support-subtle">
                  {estimatedDeliveryText || "We'll send a confirmation email with your next order updates shortly."}
                </p>
                {digitalDownloads && digitalDownloads.length > 0 ? (
                  <div className="downloads-card">
                    <h2 className="downloads-title">Your downloads are ready</h2>
                    <ul className="downloads-list">
                      {digitalDownloads.map((entry) => (
                        <li key={`${entry.downloadUrl}:${entry.fileName}`} className="downloads-item">
                          <div className="download-meta">
                            <span className="download-name">{entry.title || entry.fileName}</span>
                            <span className="download-helper">
                              {formatDownloadAvailability(entry)}
                            </span>
                          </div>
                          <a className="download-btn" href={entry.downloadUrl}>
                            Download now
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="downloads-note">We also sent these links to your email.</p>
                  </div>
                ) : null}
                {digitalDownloadsPending && (!digitalDownloads || digitalDownloads.length === 0) ? (
                  <div className="downloads-card">
                    <h2 className="downloads-title">Your files are being prepared</h2>
                    <p className="downloads-note">We&apos;ll email your secure download links as soon as they&apos;re ready.</p>
                  </div>
                ) : null}
                <p className="support">{support.helpText}</p>
                {support.detailText ? <p className="support-subtle">{support.detailText}</p> : null}
                {support.supportEmail || support.supportPhone ? (
                  <div className="support-links">
                    {support.supportEmail ? (
                      <a className="support-link" href={`mailto:${support.supportEmail}`}>{support.supportEmail}</a>
                    ) : null}
                    {support.supportPhone && support.supportPhoneHref ? (
                      <a className="support-link" href={support.supportPhoneHref}>{support.supportPhone}</a>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="actions">
                <Link className="btn btn-primary" href="/shop" style={primaryActionStyle}>Continue shopping</Link>
              </div>
            </>
          ) : null}

          {viewState === 'pending' ? (
            <>
              <p className="badge">Still working</p>
              <h1 className="title">We&apos;re still processing your order</h1>
              <p className="body">
                {pendingMessage || "Payment received. We're still finalizing your order."}
              </p>
              {showLongWaitSupportHint ? (
                <p className="support-subtle">
                  If this takes more than a minute, contact support with your payment reference
                  {paymentReference ? ` (${paymentReference})` : ''}.
                </p>
              ) : null}
              <p className="support">{support.helpText}</p>
              <div className="actions">
                <button className="btn btn-primary" onClick={handleCheckAgain} style={primaryActionStyle} type="button">Check again</button>
                <Link className="btn btn-secondary" href="/shop">Continue shopping</Link>
                {support.supportEmail ? (
                  <a className="btn btn-tertiary" href={`mailto:${support.supportEmail}`}>Contact support</a>
                ) : null}
              </div>
            </>
          ) : null}

          {viewState === 'failed' ? (
            <>
              <p className="badge">Payment issue</p>
              <h1 className="title">Payment could not be completed</h1>
              <p className="body">{failureReason || 'Please return to checkout and try another payment method.'}</p>
              <div className="actions">
                <Link className="btn btn-primary" href="/checkout" style={primaryActionStyle}>Return to checkout</Link>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

