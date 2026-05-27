"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '../AppShell';
import { useSettings } from '../../context/SettingsContext';
import styles from './SettingsWorkspace.module.css';
import IntegrationsPanel from './IntegrationsPanel';
import GeneralSettingsPanel from './GeneralSettingsPanel';
import SetupFirstRunGuidePanel from './SetupFirstRunGuidePanel';
import AdminButton from '../admin/ui/AdminButton';
import AdminCard from '../admin/ui/AdminCard';
import AdminDrawer from '../admin/ui/AdminDrawer';
import AdminEmptyState from '../admin/ui/AdminEmptyState';
import AdminField from '../admin/ui/AdminField';
import AdminInput from '../admin/ui/AdminInput';
import AdminLiveStatus from '../admin/ui/AdminLiveStatus';
import AdminSelect from '../admin/ui/AdminSelect';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import AdminTable from '../admin/ui/AdminTable';
import AdminTextarea from '../admin/ui/AdminTextarea';
import AdminTooltip from '../admin/ui/AdminTooltip';
import { SettingsProviderRowsSkeleton } from './SettingsSkeletons';
import ShippingSettingsWorkspace from './ShippingSettingsWorkspace';
import TeamSettingsPanel from './TeamSettingsPanel';
import AccountSettingsPanel from './AccountSettingsPanel';
import SettingsToastViewport from './SettingsToastViewport';
import SettingsWorkspaceLoadState from './SettingsWorkspaceLoadState';
import SettingsWorkspacePageHeader from './SettingsWorkspacePageHeader';
import SettingsWorkspaceNav from './SettingsWorkspaceNav';
import SettingsSetupDiagnosticsState from './SettingsSetupDiagnosticsState';
import { formatDateTimeForDisplay } from '@/lib/date-time-format';
import {
  STORE_CURRENCY_OPTIONS,
  STORE_TIMEZONE_OPTIONS,
} from '@/lib/store-settings-options';
import {
  buildStripeCredentialSavePayload,
  buildStripeMaskedCredentialMap,
  resolveStripeConnectionState,
  shouldShowStripeCredentialInput,
} from './stripe-credential-masking.helpers';
import { normalizeSettingsSessionUser } from './settings-session-user.helpers';
import {
  getShippingHeaderSaveButtonState,
  invokeShippingSaveAction,
  resolveShippingSaveActionRegistration,
} from './shipping-save-button.helpers';
import { isSettingsTabLoadingState } from './settings-skeleton.helpers';
import { calculateTaxPreview } from './tax-preview.helpers';

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'payments', label: 'Payments' },
  { id: 'shipping', label: 'Shipping & delivery' },
  { id: 'taxes', label: 'Taxes & duties' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'email', label: 'Email' },
  { id: 'brand-kit', label: 'Brand & appearance' },
  { id: 'account', label: 'My account' },
  { id: 'team', label: 'Team' },
  { id: 'setup', label: 'Setup' },
];

const SETUP_STATUS_PRIORITY = {
  PASS: 0,
  WARN: 1,
  FAIL: 2,
};

const SETUP_CARD_DEFINITIONS = [
  { id: 'database', label: 'Database reachable', tooltip: 'Confirms DATABASE_URL exists and the app can run a database query.', checkIds: ['database-url', 'database-reachable', 'prisma-client-generated'] },
  { id: 'store', label: 'Store seeded', tooltip: 'Store bootstrap creates the initial store record required for selling.', checkIds: ['store-exists', 'store-settings'] },
  { id: 'owner', label: 'Owner account exists', tooltip: 'Owner account is required for privileged setup and recovery actions.', checkIds: ['owner-user-exists'] },
  { id: 'core-auth', label: 'JWT secret health', tooltip: 'JWT_SECRET secures admin session signing and validation.', checkIds: ['jwt-secret'] },
  { id: 'webhook-retry', label: 'Webhook retry secret found', tooltip: 'WEBHOOK_RETRY_SECRET protects cron/manual retry routes for webhook processing.', checkIds: ['webhook-retry-secret'] },
  { id: 'public-url', label: 'Public store URL set', tooltip: 'NEXT_PUBLIC_STORE_URL is used in storefront links, email links, and recovery flows.', checkIds: ['next-public-store-url'] },
  { id: 'deployment', label: 'Deployment env detected', tooltip: 'Checks deployment markers like VERCEL_URL and VERCEL_ENV.', checkIds: ['vercel-deployment'] },
];

const SETUP_COMMANDS = [
  {
    id: 'doctor',
    label: 'Run doctor',
    command: 'npm run doopify:doctor',
  },
  {
    id: 'db-check',
    label: 'Check Neon/DB',
    command: 'npm run doopify:db:check',
  },
  {
    id: 'setup',
    label: 'Run guided setup',
    command: 'npm run doopify:setup',
  },
  {
    id: 'stripe-webhook',
    label: 'Configure webhooks',
    command: 'npm run doopify:stripe:webhook',
  },
  {
    id: 'env-push',
    label: 'Push Vercel env',
    command: 'npm run doopify:env:push',
  },
  {
    id: 'deploy',
    label: 'Deploy production',
    command: 'npm run doopify:deploy',
  },
];

const SETUP_FOUNDATION_HINTS = [
  'Provider setup now lives in Payments, Shipping, and Email.',
  'Setup checks app foundation only: database, bootstrap, env hygiene, and deployment readiness.',
  'For private beta, configure Stripe and email from Settings instead of relying on env fallback values.',
  'Use CLI commands for local writes and provider webhook automation.',
];

const SETUP_ENV_TEMPLATE = [
  '# Doopify setup template',
  '# 1) cp .env.example .env.local',
  '# 2) fill real values before running the app',
  'DATABASE_URL=',
  'DIRECT_URL=',
  'JWT_SECRET="generate-a-random-32-character-secret"',
  'ENCRYPTION_KEY="generate-a-random-32-character-secret"',
  'NEXT_PUBLIC_STORE_URL="http://localhost:3000"',
  'STRIPE_SECRET_KEY=',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=',
  'STRIPE_WEBHOOK_SECRET=',
  'WEBHOOK_RETRY_SECRET="generate-a-random-32-character-secret"',
  'RESEND_API_KEY=',
  'RESEND_WEBHOOK_SECRET=',
  '# SETUP_TOKEN is optional in local dev; required in production first-owner bootstrap',
  'SETUP_TOKEN=',
].join('\n');

const PROVIDER_STATE_TONE = {
  VERIFIED: 'success',
  CREDENTIALS_SAVED: 'warning',
  ERROR: 'danger',
  NOT_CONFIGURED: 'warning',
};

const PROVIDER_SOURCE_LABEL = {
  db: 'DB credentials',
  env: 'Env fallback',
  none: 'Not active',
};

const STRIPE_CHECKOUT_SOURCE_LABEL = {
  db: 'DB verified connection',
  env: '.env fallback',
  none: 'Not configured',
};

const STRIPE_WEBHOOK_SOURCE_LABEL = {
  db: 'DB verified webhook secret',
  env: '.env webhook secret',
  none: 'missing',
};

const STRIPE_OWNER_REQUIRED_LABEL = 'Owner required';
const STRIPE_VIEW_ONLY_LABEL = 'View only';
const STRIPE_OWNER_REQUIRED_HELPER_COPY =
  'Only owners can save, replace, or verify Stripe credentials. You can view the current connection status, but credential actions are restricted.';
const STRIPE_OWNER_REQUIRED_NEXT_STEP_COPY =
  'Need to run credential actions? Ask an owner to open this drawer and complete save + verify from the same screen.';
const STRIPE_OWNER_PERMISSION_ERROR_COPY = 'Owner permission required';

const PAYMENT_PROVIDER_DRAWER = {
  STRIPE: 'STRIPE',
  PAYPAL: 'PAYPAL',
  MANUAL: 'MANUAL',
};

const EMAIL_PROVIDER_DRAWER = {
  RESEND: 'RESEND',
  SMTP: 'SMTP',
  SENDLAYER: 'SENDLAYER',
};

const BRAND_DRAWER = {
  GLOBAL_ASSETS: 'GLOBAL_ASSETS',
  CHECKOUT_BRANDING: 'CHECKOUT_BRANDING',
  EMAIL_BRANDING: 'EMAIL_BRANDING',
  SOCIAL_LINKS: 'SOCIAL_LINKS',
};

const TAX_DRAWER = {
  COLLECTION: 'COLLECTION',
  REGIONS: 'REGIONS',
};

const EMAIL_TEMPLATE_SUMMARY = [
  {
    id: 'order_confirmation',
    label: 'Order confirmation',
    statusLabel: 'Enabled',
    statusTone: 'success',
    triggerLabel: 'Sent after an order is paid or finalized.',
    editorStateLabel: null,
    editable: true,
  },
  {
    id: 'fulfillment_tracking',
    label: 'Shipping confirmation',
    statusLabel: 'Enabled',
    statusTone: 'success',
    triggerLabel: 'Sent when fulfillment tracking is created.',
    editorStateLabel: null,
    editable: true,
  },
  {
    id: 'refund_confirmation',
    label: 'Refund confirmation',
    statusLabel: 'Coming soon',
    statusTone: 'warning',
    triggerLabel: 'Will send after a refund is issued.',
    editorStateLabel: 'Refund confirmation template editor is not available yet.',
    editable: false,
  },
  {
    id: 'draft_invoice',
    label: 'Draft order invoice',
    statusLabel: 'Coming soon',
    statusTone: 'warning',
    triggerLabel: 'Will send when a draft order invoice is created.',
    editorStateLabel: 'Draft invoice template editor is not available yet.',
    editable: false,
  },
  {
    id: 'customer_note',
    label: 'Customer note / order update',
    statusLabel: 'Coming soon',
    statusTone: 'warning',
    triggerLabel: 'Will send when staff adds a customer-visible order note.',
    editorStateLabel: 'Customer note template editor is not available yet.',
    editable: false,
  },
];

const EMPTY_TEMPLATE_DRAFT = {
  enabled: true,
  subject: '',
  preheader: '',
  headerTitle: '',
  bodyText: '',
  buttonLabel: '',
  footerText: '',
  replyToEmail: '',
};

const TEMPLATE_VARIABLES = [
  { key: '{{orderNumber}}', description: 'Order number' },
  { key: '{{storeName}}', description: 'Store name' },
  { key: '{{customerName}}', description: 'Customer name' },
  { key: '{{trackingNumber}}', description: 'Tracking number' },
  { key: '{{trackingUrl}}', description: 'Tracking URL' },
];

const EMPTY_PROVIDER_FORMS = {
  STRIPE: { publishableKey: '', secretKey: '', webhookSecret: '', mode: 'test' },
  RESEND: { apiKey: '', webhookSecret: '', fromEmail: '' },
  SMTP: { host: '', port: '587', secure: false, username: '', password: '', fromEmail: '' },
  SHIPPO: { apiKey: '' },
  EASYPOST: { apiKey: '' },
};

const EMPTY_ZONE_FORM = {
  name: '',
  countryCode: '',
  provinceCode: '',
  priority: '100',
  isActive: true,
};

const EMPTY_RATE_FORM = {
  name: '',
  method: 'FLAT',
  amount: '',
  minSubtotal: '',
  maxSubtotal: '',
  priority: '100',
  isActive: true,
};

const EMPTY_TAX_FORM = {
  name: '',
  countryCode: '',
  provinceCode: '',
  ratePercent: '',
  priority: '100',
  isActive: true,
};

const EMPTY_TAX_SETTINGS = {
  enabled: false,
  strategy: 'MANUAL',
  defaultTaxRatePercent: '0',
  taxShipping: false,
  pricesIncludeTax: false,
  originCountry: '',
  originState: '',
  originPostalCode: '',
};

const EMPTY_SHIPPING_TAX_PREVIEW = {
  subtotal: '75',
  shippingAmount: '0',
  country: 'US',
  province: '',
};

const EMPTY_STRIPE_REPLACE_STATE = Object.freeze({
  publishableKey: false,
  secretKey: false,
  webhookSecret: false,
});

const EMPTY_TAX_PREVIEW_RESULT = {
  subtotal: 0,
  shippingAmount: 0,
  taxableBase: 0,
  estimatedTax: 0,
  totalWithTax: 0,
  sourceUsed: '',
  note: '',
};

const EMPTY_BRAND_KIT = Object.freeze({
  name: '',
  supportEmail: '',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '',
  secondaryColor: '',
  accentColor: '',
  textColor: '',
  headingFont: '',
  bodyFont: '',
  buttonRadius: '',
  buttonStyle: '',
  buttonTextTransform: '',
  checkoutLogoUrl: '',
  emailLogoUrl: '',
  emailHeaderColor: '',
  emailFooterText: '',
  instagramUrl: '',
  facebookUrl: '',
  tiktokUrl: '',
  youtubeUrl: '',
});

const LEGACY_SHIPPING_MODE_OPTIONS = [
  { value: 'MANUAL', label: 'Manual only' },
  { value: 'LIVE_RATES', label: 'Live rates only' },
  { value: 'HYBRID', label: 'Hybrid: live + manual fallback' },
];

const LEGACY_RATE_METHOD_OPTIONS = [
  { value: 'FLAT', label: 'Flat' },
  { value: 'SUBTOTAL_TIER', label: 'Subtotal tier' },
];

const TAX_STRATEGY_OPTIONS = [
  { value: 'MANUAL', label: 'Manual' },
];

const STRIPE_MODE_OPTIONS = [
  { value: 'test', label: 'test' },
  { value: 'live', label: 'live' },
];

export const GENERAL_SETTINGS_CURRENCY_OPTIONS = STORE_CURRENCY_OPTIONS;
export const GENERAL_SETTINGS_TIMEZONE_OPTIONS = STORE_TIMEZONE_OPTIONS;

function parseNumberOrUndefined(value) {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNumberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBrandKit(input) {
  if (!input || typeof input !== 'object') {
    return { ...EMPTY_BRAND_KIT };
  }

  return {
    ...EMPTY_BRAND_KIT,
    ...input,
  };
}

function toZoneForm(zone) {
  return {
    id: zone.id,
    name: zone.name || '',
    countryCode: zone.countryCode || '',
    provinceCode: zone.provinceCode || '',
    priority: String(zone.priority ?? 100),
    isActive: zone.isActive !== false,
    rates: (zone.rates || []).map((rate) => ({
      id: rate.id,
      name: rate.name || '',
      method: rate.method || 'FLAT',
      amount: String(rate.amount ?? ''),
      minSubtotal: rate.minSubtotal == null ? '' : String(rate.minSubtotal),
      maxSubtotal: rate.maxSubtotal == null ? '' : String(rate.maxSubtotal),
      priority: String(rate.priority ?? 100),
      isActive: rate.isActive !== false,
    })),
  };
}

function toTaxForm(rule) {
  return {
    id: rule.id,
    name: rule.name || '',
    countryCode: rule.countryCode || '',
    provinceCode: rule.provinceCode || '',
    ratePercent: String(Number(rule.rate ?? 0) * 100),
    priority: String(rule.priority ?? 100),
    isActive: rule.isActive !== false,
  };
}

function createApiError(message, status) {
  const error = new Error(message || 'Request failed');
  if (typeof status === 'number') {
    error.status = status;
  }
  return error;
}

function getApiErrorStatus(error) {
  return typeof error?.status === 'number' ? error.status : null;
}

function isPermissionRestrictedStatus(status) {
  return status === 401 || status === 403;
}

function isPermissionRestrictedError(error) {
  const status = getApiErrorStatus(error);
  if (isPermissionRestrictedStatus(status)) return true;

  const message = String(error?.message || '').trim().toLowerCase();
  return (
    message === 'forbidden' ||
    message === 'unauthorized' ||
    message.includes('forbidden') ||
    message.includes('unauthorized')
  );
}

function toFriendlyProviderStatusError(errorMessage) {
  const normalized = String(errorMessage || '').trim().toLowerCase();
  if (!normalized) return '';
  if (
    normalized === 'forbidden' ||
    normalized === 'unauthorized' ||
    normalized.includes('forbidden') ||
    normalized.includes('unauthorized')
  ) {
    return STRIPE_OWNER_PERMISSION_ERROR_COPY;
  }
  return errorMessage;
}

async function parseApiJson(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw createApiError(payload?.error || 'Request failed', response.status);
  }
  return payload.data;
}

function buildStripeRuntimeStatusFromProviderSnapshot(stripeProviderSnapshot) {
  if (!stripeProviderSnapshot) return null;
  return {
    source: stripeProviderSnapshot.runtimeSource || stripeProviderSnapshot.source || 'none',
    mode: stripeProviderSnapshot.mode || null,
    hasPublishableKey: stripeProviderSnapshot.hasPublishableKey,
    hasSecretKey: stripeProviderSnapshot.hasSecretKey,
    hasWebhookSecret: stripeProviderSnapshot.hasWebhookSecret,
    webhookSource: stripeProviderSnapshot.hasWebhookSecret ? stripeProviderSnapshot.source : 'none',
    verified: stripeProviderSnapshot.verified,
    accountId: stripeProviderSnapshot.accountId,
    chargesEnabled: stripeProviderSnapshot.chargesEnabled,
    payoutsEnabled: stripeProviderSnapshot.payoutsEnabled,
    providerStatus: stripeProviderSnapshot,
  };
}

function buildStripeRuntimeStatusFromPublicConfig(publicConfig) {
  if (!publicConfig) return null;

  return {
    source: publicConfig.source || 'none',
    mode: publicConfig.mode || 'unknown',
    hasPublishableKey: Boolean(publicConfig.publishableKey),
    hasSecretKey: null,
    hasWebhookSecret: null,
    webhookSource: 'none',
    verified: null,
    accountId: null,
    chargesEnabled: null,
    payoutsEnabled: null,
    providerStatus: null,
  };
}

function toProviderGatewayStatusFromStripeSnapshot(stripeProviderSnapshot) {
  if (!stripeProviderSnapshot) return null;
  const state = stripeProviderSnapshot.verified
    ? 'VERIFIED'
    : stripeProviderSnapshot.lastError
      ? 'ERROR'
      : stripeProviderSnapshot.configured
        ? 'CREDENTIALS_SAVED'
        : 'NOT_CONFIGURED';

  return {
    provider: 'STRIPE',
    state,
    source: stripeProviderSnapshot.source || stripeProviderSnapshot.runtimeSource || 'none',
    lastError: stripeProviderSnapshot.lastError || null,
    lastVerifiedAt: stripeProviderSnapshot.lastVerifiedAt || null,
  };
}

function toProviderGatewayStatusFromStripeSavedStatus(stripeStatus) {
  if (!stripeStatus) return null;
  const verificationStatus = String(stripeStatus.verificationStatus || '').trim().toLowerCase();
  const state =
    verificationStatus === 'verified'
      ? 'VERIFIED'
      : verificationStatus === 'needs_attention'
        ? 'ERROR'
        : verificationStatus === 'needs_setup'
          ? 'NOT_CONFIGURED'
          : stripeStatus.configured
            ? 'CREDENTIALS_SAVED'
            : 'NOT_CONFIGURED';

  return {
    provider: 'STRIPE',
    state,
    source: stripeStatus.source || 'none',
    lastError: stripeStatus.lastError || null,
    lastVerifiedAt: stripeStatus.lastVerifiedAt || null,
  };
}

function getHigherStatus(left, right) {
  if (!left) return right || 'PASS';
  if (!right) return left;
  return SETUP_STATUS_PRIORITY[right] > SETUP_STATUS_PRIORITY[left] ? right : left;
}

function normalizeCheckStatus(check) {
  if (!check) return 'WARN';
  if (check.status === 'FAIL' && !check.required) return 'WARN';
  return check.status || 'WARN';
}

function describeStripeSetup(checkById) {
  const keysCheck = checkById['stripe-keys'];
  const webhookCheck = checkById['stripe-webhook-secret'];
  const keysStatus = normalizeCheckStatus(keysCheck);
  const webhookStatus = normalizeCheckStatus(webhookCheck);

  if (!keysCheck || keysStatus === 'FAIL') {
    return {
      label: 'Not configured',
      tone: 'danger',
      detail: 'Stripe keys are missing. Add STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.',
    };
  }

  if (keysStatus === 'PASS' && webhookStatus === 'FAIL') {
    return {
      label: 'Webhook missing',
      tone: 'warning',
      detail: 'Credentials found, API verification not yet run. Add STRIPE_WEBHOOK_SECRET for webhook signature checks.',
    };
  }

  return {
    label: 'Env keys found',
    tone: 'warning',
    detail: 'Credentials found, API verification not yet run.',
  };
}

function describeResendSetup(checkById) {
  const apiCheck = checkById['resend-api-or-preview'];
  const webhookCheck = checkById['resend-webhook-secret-enabled'];
  const apiStatus = normalizeCheckStatus(apiCheck);
  const webhookStatus = normalizeCheckStatus(webhookCheck);

  if (!apiCheck || apiStatus === 'WARN') {
    return {
      label: 'Preview mode',
      tone: 'warning',
      detail: 'RESEND_API_KEY is not active. Email sends run in preview mode.',
    };
  }

  if (apiStatus === 'PASS' && webhookStatus === 'FAIL') {
    return {
      label: 'Webhook missing',
      tone: 'warning',
      detail: 'API key found. Live sends may work, but bounce/complaint webhook verification is not configured.',
    };
  }

  return {
    label: 'API key found',
    tone: 'warning',
    detail: 'Credentials found, API verification not yet run.',
  };
}

function describeProviderGatewayStatus(providerStatus, fallbackStatus) {
  if (!providerStatus) return fallbackStatus;

  const verificationTimeoutLike =
    providerStatus.state === 'ERROR' && isLikelyVerificationTimeout(providerStatus.lastError);

  const stateLabelMap = {
    VERIFIED: 'Verified',
    CREDENTIALS_SAVED: 'Credentials saved',
    ERROR: verificationTimeoutLike ? 'Verification unavailable' : 'Error',
    NOT_CONFIGURED: 'Not configured',
  };

  const label = stateLabelMap[providerStatus.state] || 'Not configured';
  const tone = verificationTimeoutLike ? 'warning' : PROVIDER_STATE_TONE[providerStatus.state] || 'warning';
  const sourceLabel = PROVIDER_SOURCE_LABEL[providerStatus.source] || 'Not active';

  let detail = `Source: ${sourceLabel}.`;
  if (providerStatus.state === 'VERIFIED') {
    detail = `Verified connection. Source: ${sourceLabel}.`;
  } else if (providerStatus.state === 'CREDENTIALS_SAVED') {
    detail = `Credentials saved. API verification has not been completed from this screen.`;
  } else if (providerStatus.state === 'ERROR') {
    detail = verificationTimeoutLike
      ? 'Saved configuration is present, but verification is temporarily unavailable.'
      : providerStatus.lastError || 'Provider verification failed. Review credentials and retry.';
  }

  return {
    label,
    tone,
    detail,
    sourceLabel,
    lastVerifiedAt: providerStatus.lastVerifiedAt || null,
  };
}

function describeStripeSavedStatus(stripeStatus, fallbackProviderStatus, fallbackStatus) {
  if (!stripeStatus || typeof stripeStatus !== 'object') {
    return describeProviderGatewayStatus(fallbackProviderStatus, fallbackStatus);
  }

  const sourceLabel = PROVIDER_SOURCE_LABEL[stripeStatus.source] || 'Not active';
  const verificationStatus = String(stripeStatus.verificationStatus || '').trim().toLowerCase();
  const statusMap = {
    verified: {
      label: 'Verified',
      tone: 'success',
      detail: `Verified connection. Source: ${sourceLabel}.`,
    },
    configured: {
      label: 'Configured',
      tone: 'warning',
      detail: 'Credentials are saved. Use "Verify now" to confirm live API connectivity.',
    },
    verification_unavailable: {
      label: 'Verification unavailable',
      tone: 'warning',
      detail: `Configuration is present. Verification metadata is unavailable right now. Source: ${sourceLabel}.`,
    },
    needs_attention: {
      label: 'Needs attention',
      tone: 'danger',
      detail: stripeStatus.lastError || 'Stripe verification failed. Review credentials and retry.',
    },
    needs_setup: {
      label: 'Needs setup',
      tone: 'warning',
      detail: 'Required Stripe configuration is missing. Save publishable key, secret key, and webhook secret.',
    },
  };

  if (!statusMap[verificationStatus]) {
    return describeProviderGatewayStatus(fallbackProviderStatus, fallbackStatus);
  }

  const resolved = statusMap[verificationStatus];
  return {
    ...resolved,
    sourceLabel,
    lastVerifiedAt: stripeStatus.lastVerifiedAt || null,
  };
}

function normalizeStatusLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();
}

function isLikelyVerificationTimeout(value) {
  const normalized = normalizeStatusLabel(value);
  if (!normalized) return false;
  return (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('network') ||
    normalized.includes('temporarily unavailable')
  );
}

function formatEventType(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replaceAll('.', ' / ')
    .trim();
}

function formatDateTime(value, timeZone) {
  return formatDateTimeForDisplay(value, {
    timeZone,
    fallbackText: 'Not verified yet',
  });
}

function statusToneFromLabel(value) {
  const normalized = normalizeStatusLabel(value);
  if (['active', 'verified', 'paid', 'succeeded', 'issued'].includes(normalized)) return 'success';
  if (['error', 'failed', 'refunded', 'declined', 'missing'].includes(normalized)) return 'danger';
  if (['coming soon', 'setup needed', 'needs stripe', 'requires live mode', 'requires domain'].includes(normalized)) {
    return 'warning';
  }
  return 'neutral';
}

function formatDisplayCurrency(cents, currency = 'USD') {
  const normalizedCurrency = String(currency || 'USD').toUpperCase();
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}

function formatTaxPreviewCurrency(amount, currency = 'USD') {
  const normalizedCurrency = String(currency || 'USD').toUpperCase();
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatProviderLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  if (normalized === 'stripe') return 'Stripe';
  if (normalized === 'paypal') return 'PayPal';
  if (normalized === 'manual') return 'Manual';
  return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`;
}

function getStripeMethodChips(stripeRuntimeStatus) {
  const runtimeReady = stripeRuntimeStatus?.source && stripeRuntimeStatus.source !== 'none';
  if (!runtimeReady) {
    return ['Cards', 'Apple Pay', 'Google Pay', 'Link', 'Cash App'];
  }

  const chips = ['Cards', 'Google Pay', 'Link'];
  chips.push(stripeRuntimeStatus?.mode === 'live' ? 'Apple Pay' : 'Apple Pay (needs live + domain)');
  chips.push(stripeRuntimeStatus?.mode === 'live' ? 'Cash App' : 'Cash App (live mode)');
  return chips;
}

export function buildCheckoutMethodStatuses(stripeRuntimeStatus) {
  const runtimeReady = stripeRuntimeStatus?.source && stripeRuntimeStatus.source !== 'none';
  const liveMode = stripeRuntimeStatus?.mode === 'live';

  return [
    {
      id: 'cards',
      title: 'Credit & debit cards',
      statusLabel: runtimeReady ? 'Active' : 'Needs Stripe',
      statusTone: runtimeReady ? 'success' : 'warning',
      detail: runtimeReady
        ? 'Enabled through Stripe checkout runtime.'
        : 'Available once Stripe checkout has an active runtime source.',
    },
    {
      id: 'apple-pay',
      title: 'Apple Pay',
      statusLabel: !runtimeReady ? 'Needs Stripe' : !liveMode ? 'Requires live mode' : 'Requires domain',
      statusTone: !runtimeReady ? 'warning' : !liveMode ? 'warning' : 'neutral',
      detail: 'Requires Stripe, HTTPS, and payment domain verification.',
    },
    {
      id: 'google-pay',
      title: 'Google Pay',
      statusLabel: runtimeReady ? 'Through Stripe' : 'Needs Stripe',
      statusTone: runtimeReady ? 'neutral' : 'warning',
      detail: 'Appears through Stripe when account and browser eligibility checks pass.',
    },
    {
      id: 'link',
      title: 'Link',
      statusLabel: runtimeReady ? 'Through Stripe' : 'Needs Stripe',
      statusTone: runtimeReady ? 'neutral' : 'warning',
      detail: 'Stripe Link support depends on account eligibility.',
    },
    {
      id: 'cash-app',
      title: 'Cash App Pay',
      statusLabel: !runtimeReady ? 'Needs Stripe' : !liveMode ? 'Requires live mode' : 'Through Stripe',
      statusTone: !runtimeReady || !liveMode ? 'warning' : 'neutral',
      detail: 'Requires eligible Stripe account and live-mode configuration.',
    },
    {
      id: 'paypal',
      title: 'PayPal',
      statusLabel: 'Coming soon',
      statusTone: 'warning',
      detail: 'PayPal checkout remains hidden until runtime payment, webhook, refund, and order finalization support is shipped.',
    },
    {
      id: 'manual-invoice',
      title: 'Manual invoice',
      statusLabel: 'Draft orders',
      statusTone: 'neutral',
      detail: 'Manual payment workflows are currently intended for draft order and invoice collection paths.',
    },
  ];
}

export function buildPaymentProviderRows(input) {
  const {
    stripeSetupStatus,
    stripeCheckoutSourceLabel,
    stripeRuntimeModeLabel,
    stripeWebhookSourceLabel,
    stripeSavedStatusLoading,
    stripeLastCheckedText,
    stripeMethodChips,
  } = input;

  return [
    {
      id: PAYMENT_PROVIDER_DRAWER.STRIPE,
      iconText: 'S',
      iconClassName: 'providerIconStripe',
      name: 'Stripe',
      description:
        'Accept cards and eligible Stripe wallet methods like Apple Pay, Google Pay, Link, and Cash App Pay.',
      status: stripeSavedStatusLoading
        ? null
        : {
            label: stripeSetupStatus.label,
            tone: stripeSetupStatus.tone,
          },
      statusLoading: stripeSavedStatusLoading,
      sourceMeta: `Checkout source: ${stripeCheckoutSourceLabel}`,
      statusMeta: `Mode: ${stripeRuntimeModeLabel} • Webhook: ${stripeWebhookSourceLabel}`,
      lastCheckedMeta: stripeLastCheckedText ? `Last checked: ${stripeLastCheckedText}` : null,
      chips: stripeMethodChips,
    },
    {
      id: PAYMENT_PROVIDER_DRAWER.PAYPAL,
      iconText: 'P',
      iconClassName: 'providerIconPayPal',
      name: 'PayPal',
      description: 'Let customers pay with PayPal, Pay Later, and Venmo where eligible.',
      status: {
        label: 'Coming soon',
        tone: 'warning',
      },
      statusLoading: false,
      sourceMeta: 'Runtime support: not implemented',
      statusMeta:
        'Do not enable checkout visibility until payment creation, webhook verification, refund support, and order finalization are shipped.',
      chips: ['PayPal', 'Pay Later', 'Venmo'],
    },
    {
      id: PAYMENT_PROVIDER_DRAWER.MANUAL,
      iconText: 'M',
      iconClassName: 'providerIconManual',
      name: 'Manual payments',
      description: 'Support offline payment collection for draft orders, invoices, and phone-order workflows.',
      status: {
        label: 'Built-in',
        tone: 'neutral',
      },
      statusLoading: false,
      sourceMeta: 'Checkout runtime: draft orders and invoices',
      statusMeta: 'Storefront manual checkout should remain disabled unless a server-owned manual flow is implemented.',
      chips: ['Cash', 'Bank transfer', 'Invoice'],
    },
  ];
}

export function buildPaymentActivityRowsFromOrders(orders, timeZone) {
  const rows = [];
  for (const order of orders || []) {
    const orderPayments = Array.isArray(order?.payments) ? order.payments : [];
    for (const payment of orderPayments) {
      const eventLabel = (() => {
        const normalized = normalizeStatusLabel(payment.status);
        if (normalized === 'paid') return 'Payment captured';
        if (normalized === 'pending') return 'Payment pending';
        if (normalized === 'refunded') return 'Payment refunded';
        if (normalized === 'partially refunded') return 'Payment partially refunded';
        if (normalized === 'failed') return 'Payment failed';
        return 'Payment updated';
      })();

      rows.push({
        id: payment.id || `${order.id || order.orderNumber}-${payment.stripePaymentIntentId || 'payment'}`,
        dateValue: payment.createdAt || order.createdAt || null,
        dateText: payment.createdAt
          ? formatDateTimeForDisplay(payment.createdAt, { timeZone, fallbackText: 'Unknown' })
          : order.createdAt
            ? formatDateTimeForDisplay(order.createdAt, { timeZone, fallbackText: 'Unknown' })
            : 'Unknown',
        orderText: order.orderNumber ? `#${String(order.orderNumber).replace(/^#/, '')}` : 'Unknown',
        providerText: formatProviderLabel(payment.provider),
        eventText: eventLabel,
        statusText: normalizeStatusLabel(payment.status) || 'unknown',
        amountText: formatDisplayCurrency(payment.amountCents, payment.currency || order.currency || 'USD'),
        referenceText: payment.stripePaymentIntentId || payment.stripeChargeId || payment.id || 'N/A',
      });
    }
  }

  return rows.sort((left, right) => {
    const leftTime = left.dateValue ? new Date(left.dateValue).getTime() : 0;
    const rightTime = right.dateValue ? new Date(right.dateValue).getTime() : 0;
    return rightTime - leftTime;
  });
}

function extractEnvVariableHints(checks) {
  const envNames = new Set();
  const envPattern = /\b[A-Z][A-Z0-9_]{2,}\b/g;

  for (const check of checks || []) {
    const scanTarget = `${check.summary || ''} ${check.fix || ''}`;
    const matches = scanTarget.match(envPattern) || [];
    for (const match of matches) {
      if (match.startsWith('API') || match === 'HTTP' || match === 'HTTPS') continue;
      envNames.add(match);
    }
  }

  return Array.from(envNames).slice(0, 12);
}

export default function SettingsWorkspace() {
  const [activeSection, setActiveSection] = useState('general');
  const { settings, updateSettings, loading, error } = useSettings();
  const [sessionUser, setSessionUser] = useState(null);
  const [shippingConfigLoading, setShippingConfigLoading] = useState(false);
  const [shippingConfigError, setShippingConfigError] = useState('');
  const [shippingConfigLoadedBySection, setShippingConfigLoadedBySection] = useState({
    shipping: false,
    taxes: false,
  });
  const [shippingZones, setShippingZones] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [taxSettings, setTaxSettings] = useState(EMPTY_TAX_SETTINGS);
  const [shippingSettingsProfile, setShippingSettingsProfile] = useState(null);
  const [shippingSetupStatus, setShippingSetupStatus] = useState(null);
  const [shippingModeSaving, setShippingModeSaving] = useState(false);
  const [taxSettingsSaving, setTaxSettingsSaving] = useState(false);
  const [taxSettingsSaveState, setTaxSettingsSaveState] = useState('idle');
  const [taxSettingsFormError, setTaxSettingsFormError] = useState('');
  const [shippingTaxPreview, setShippingTaxPreview] = useState(EMPTY_SHIPPING_TAX_PREVIEW);
  const [taxPreviewResult, setTaxPreviewResult] = useState(EMPTY_TAX_PREVIEW_RESULT);
  const [taxPreviewError, setTaxPreviewError] = useState('');
  const [taxPreviewCalculating, setTaxPreviewCalculating] = useState(false);
  const [newZone, setNewZone] = useState(EMPTY_ZONE_FORM);
  const [newTaxRule, setNewTaxRule] = useState(EMPTY_TAX_FORM);
  const [newRateByZoneId, setNewRateByZoneId] = useState({});
  const [setupStatus, setSetupStatus] = useState(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupLoaded, setSetupLoaded] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [deploymentStatus, setDeploymentStatus] = useState(null);
  const [deploymentLoading, setDeploymentLoading] = useState(false);
  const [deploymentLoaded, setDeploymentLoaded] = useState(false);
  const [deploymentError, setDeploymentError] = useState('');
  const [wizardSteps, setWizardSteps] = useState(null);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardLoaded, setWizardLoaded] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [setupSectionExpanded, setSetupSectionExpanded] = useState({
    firstRunGuide: true,
    deploymentValidation: false,
    advancedDiagnostics: false,
  });
  const [providerStatusMap, setProviderStatusMap] = useState({});
  const [providerStatusLoading, setProviderStatusLoading] = useState(false);
  const [providerStatusLoaded, setProviderStatusLoaded] = useState(false);
  const [providerStatusError, setProviderStatusError] = useState('');
  const [providerNotice, setProviderNotice] = useState('');
  const [stripeRuntimeStatus, setStripeRuntimeStatus] = useState(null);
  const [stripeRuntimeLoading, setStripeRuntimeLoading] = useState(false);
  const [stripeRuntimeLoaded, setStripeRuntimeLoaded] = useState(false);
  const [stripePermissionRestrictedByApi, setStripePermissionRestrictedByApi] = useState(false);
  const [stripePublicRuntimeStatus, setStripePublicRuntimeStatus] = useState(null);
  const [activePaymentDrawer, setActivePaymentDrawer] = useState(null);
  const [activeEmailDrawer, setActiveEmailDrawer] = useState(null);
  const [activeBrandDrawer, setActiveBrandDrawer] = useState(null);
  const [activeTaxDrawer, setActiveTaxDrawer] = useState(null);
  const [activeEmailTemplateId, setActiveEmailTemplateId] = useState('');
  const [templateEditorDraft, setTemplateEditorDraft] = useState(EMPTY_TEMPLATE_DRAFT);
  const [templateEditorSaving, setTemplateEditorSaving] = useState(false);
  const [templateEditorLoading, setTemplateEditorLoading] = useState(false);
  const [templateEditorError, setTemplateEditorError] = useState('');
  const [templateEditorSendTo, setTemplateEditorSendTo] = useState('');
  const [templateEditorSendState, setTemplateEditorSendState] = useState('idle');
  const [templateEditorSendResult, setTemplateEditorSendResult] = useState(null);
  const [providerActionById, setProviderActionById] = useState({});
  const [providerForms, setProviderForms] = useState(EMPTY_PROVIDER_FORMS);
  const [stripeCredentialReplaceByField, setStripeCredentialReplaceByField] = useState({
    ...EMPTY_STRIPE_REPLACE_STATE,
  });
  const [providerTestEmailById, setProviderTestEmailById] = useState({
    RESEND: '',
    SMTP: '',
  });
  const [paymentActivityRows, setPaymentActivityRows] = useState([]);
  const [paymentActivityLoading, setPaymentActivityLoading] = useState(false);
  const [paymentActivityLoaded, setPaymentActivityLoaded] = useState(false);
  const [paymentActivityError, setPaymentActivityError] = useState('');
  const [emailActivityRows, setEmailActivityRows] = useState([]);
  const [emailActivityLoading, setEmailActivityLoading] = useState(false);
  const [emailActivityLoaded, setEmailActivityLoaded] = useState(false);
  const [emailActivityError, setEmailActivityError] = useState('');
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailStatusLoading, setEmailStatusLoading] = useState(false);
  const [emailStatusLoaded, setEmailStatusLoaded] = useState(false);
  const [emailStatusError, setEmailStatusError] = useState('');
  const [setupCopiedCommandId, setSetupCopiedCommandId] = useState('');
  const [savedState, setSavedState] = useState('saved');
  const [shippingModeSavedState, setShippingModeSavedState] = useState('saved');
  const [shippingModeDirty, setShippingModeDirty] = useState(false);
  const [shippingModeSaveActionReady, setShippingModeSaveActionReady] = useState(false);
  const [shippingModeSaveError, setShippingModeSaveError] = useState('');
  const [brandKit, setBrandKit] = useState(() => normalizeBrandKit(null));
  const [brandKitLoading, setBrandKitLoading] = useState(false);
  const [brandKitLoaded, setBrandKitLoaded] = useState(false);
  const [brandKitLoadWarning, setBrandKitLoadWarning] = useState(false);
  const [brandKitError, setBrandKitError] = useState('');
  const [brandKitNotice, setBrandKitNotice] = useState('');
  const [showAdvancedUrls, setShowAdvancedUrls] = useState(false);
  const [showStripeAdvanced, setShowStripeAdvanced] = useState(false);
  const [uploadingField, setUploadingField] = useState('');
  const [settingsToasts, setSettingsToasts] = useState([]);
  const logoUploadRef = useRef(null);
  const faviconUploadRef = useRef(null);
  const emailLogoUploadRef = useRef(null);
  const checkoutLogoUploadRef = useRef(null);
  const shippingModeSaveActionRef = useRef(null);

  function dismissSettingsToast(toastId) {
    setSettingsToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  function pushSettingsToast(message, tone = 'info') {
    const toastId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setSettingsToasts((current) => [...current, { id: toastId, message, tone }]);
    window.setTimeout(() => {
      setSettingsToasts((current) => current.filter((toast) => toast.id !== toastId));
    }, 3600);
  }

  const activeTitle = useMemo(
    () => SETTINGS_SECTIONS.find((section) => section.id === activeSection)?.label || 'Settings',
    [activeSection]
  );
  const stripeRoleRestricted = Boolean(sessionUser?.role && sessionUser.role !== 'OWNER');
  const stripePermissionRestricted = stripeRoleRestricted || stripePermissionRestrictedByApi;
  const stripeActionsRestricted = stripePermissionRestricted;
  const providerStatusErrorDisplay = useMemo(
    () => toFriendlyProviderStatusError(providerStatusError),
    [providerStatusError]
  );

  const loadStripePublicRuntimeStatus = useCallback(async () => {
    try {
      const publicConfig = await fetch('/api/checkout/stripe-config', { cache: 'no-store' }).then(parseApiJson);
      const mappedStatus = buildStripeRuntimeStatusFromPublicConfig(publicConfig);
      setStripePublicRuntimeStatus(mappedStatus);
      return mappedStatus;
    } catch {
      setStripePublicRuntimeStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const section = params.get('section');
    if (section && SETTINGS_SECTIONS.some((entry) => entry.id === section)) {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
      setActiveSection(section);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSessionUser() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        const normalizedSessionUser = normalizeSettingsSessionUser(payload?.data);
        if (!cancelled && response.ok && payload?.success && normalizedSessionUser) {
          setSessionUser(normalizedSessionUser);
        }
      } catch {
        if (!cancelled) {
          setSessionUser(null);
        }
      }
    }

    loadSessionUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeSection !== 'brand-kit' || brandKitLoaded) {
      return;
    }

    let cancelled = false;

    async function loadBrandKit() {
      setBrandKitLoading(true);
      setBrandKitError('');
      setBrandKitLoadWarning(false);
      try {
        const data = await fetch('/api/settings/brand-kit', { cache: 'no-store' }).then(parseApiJson);
        if (!cancelled) {
          setBrandKit(normalizeBrandKit(data));
        }
      } catch {
        if (!cancelled) {
          setBrandKit(normalizeBrandKit(null));
          setBrandKitLoadWarning(true);
        }
      } finally {
        setBrandKitLoading(false);
        if (!cancelled) {
          setBrandKitLoaded(true);
        }
      }
    }

    loadBrandKit();

    return () => {
      cancelled = true;
    };
  }, [activeSection, brandKitLoaded]);

  async function refreshBrandKit() {
    try {
      setBrandKitLoading(true);
      setBrandKitError('');
      setBrandKitLoadWarning(false);
      const data = await fetch('/api/settings/brand-kit', { cache: 'no-store' }).then(parseApiJson);
      setBrandKit(normalizeBrandKit(data));
    } catch {
      setBrandKit(normalizeBrandKit(null));
      setBrandKitLoadWarning(true);
    } finally {
      setBrandKitLoading(false);
      setBrandKitLoaded(true);
    }
  }

  useEffect(() => {
    if (!['shipping', 'taxes'].includes(activeSection)) {
      return;
    }
    if (shippingConfigLoadedBySection[activeSection]) {
      return;
    }

    let cancelled = false;

    async function loadShippingConfig() {
      setShippingConfigLoading(true);
      setShippingConfigError('');
      try {
        if (activeSection === 'shipping') {
          const [shippingSettingsData, shippingSetupData] = await Promise.all([
            fetch('/api/settings/shipping', { cache: 'no-store' }).then(parseApiJson),
            fetch('/api/settings/shipping/setup-status', { cache: 'no-store' }).then(parseApiJson),
          ]);

          if (cancelled) return;
          setShippingSettingsProfile(shippingSettingsData || null);
          setShippingSetupStatus(shippingSetupData || null);
          setShippingConfigLoadedBySection((current) => ({ ...current, shipping: true }));
          return;
        }

        const [zonesData, taxRulesData, taxSettingsData] = await Promise.all([
          fetch('/api/settings/shipping-zones').then(parseApiJson),
          fetch('/api/settings/tax-rules').then(parseApiJson),
          fetch('/api/settings/tax', { cache: 'no-store' }).then(parseApiJson),
        ]);

        if (cancelled) return;
        setShippingZones((zonesData || []).map(toZoneForm));
        setTaxRules((taxRulesData || []).map(toTaxForm));
        setTaxSettings({
          enabled: Boolean(taxSettingsData?.enabled),
          strategy: taxSettingsData?.strategy || 'MANUAL',
          defaultTaxRatePercent: String(Number(taxSettingsData?.defaultTaxRatePercent ?? 0)),
          taxShipping: Boolean(taxSettingsData?.taxShipping),
          pricesIncludeTax: Boolean(taxSettingsData?.pricesIncludeTax),
          originCountry: taxSettingsData?.originCountry || '',
          originState: taxSettingsData?.originState || '',
          originPostalCode: taxSettingsData?.originPostalCode || '',
        });
        setShippingConfigLoadedBySection((current) => ({ ...current, taxes: true }));
      } catch (loadError) {
        if (cancelled) return;
        setShippingConfigError(loadError instanceof Error ? loadError.message : 'Failed to load shipping configuration');
      } finally {
        setShippingConfigLoading(false);
      }
    }

    loadShippingConfig();

    return () => {
      cancelled = true;
    };
  }, [activeSection, shippingConfigLoadedBySection]);

  useEffect(() => {
    if (activeSection !== 'setup' || setupLoaded) {
      return;
    }

    let cancelled = false;

    async function loadSetupStatus() {
      setSetupLoading(true);
      setSetupError('');

      try {
        const diagnostics = await fetch('/api/setup/status', { cache: 'no-store' }).then(parseApiJson);
        if (!cancelled) {
          setSetupStatus(diagnostics);
        }
      } catch (loadError) {
        if (!cancelled) {
          setSetupStatus(null);
          setSetupError(loadError instanceof Error ? loadError.message : 'Failed to load setup diagnostics');
        }
      } finally {
        setSetupLoading(false);
        if (!cancelled) {
          setSetupLoaded(true);
        }
      }
    }

    loadSetupStatus();

    return () => {
      cancelled = true;
    };
  }, [activeSection, setupLoaded]);

  useEffect(() => {
    if (activeSection !== 'setup' || deploymentLoaded) return;

    let cancelled = false;

    async function loadDeploymentValidation() {
      setDeploymentLoading(true);
      setDeploymentError('');
      try {
        const data = await fetch('/api/deployment-validation', { cache: 'no-store' }).then(parseApiJson);
        if (!cancelled) setDeploymentStatus(data);
      } catch (loadError) {
        if (!cancelled) {
          setDeploymentStatus(null);
          setDeploymentError(loadError instanceof Error ? loadError.message : 'Failed to load deployment validation');
        }
      } finally {
        setDeploymentLoading(false);
        if (!cancelled) {
          setDeploymentLoaded(true);
        }
      }
    }

    loadDeploymentValidation();

    return () => { cancelled = true; };
  }, [activeSection, deploymentLoaded]);

  useEffect(() => {
    if (activeSection !== 'setup' || wizardLoaded) return;

    let cancelled = false;

    async function loadWizardStatus() {
      setWizardLoading(true);
      setWizardError('');
      try {
        const data = await fetch('/api/setup/wizard', { cache: 'no-store' }).then(parseApiJson);
        if (!cancelled) setWizardSteps(data);
      } catch (loadError) {
        if (!cancelled) {
          setWizardSteps(null);
          setWizardError(loadError instanceof Error ? loadError.message : 'Failed to load setup wizard');
        }
      } finally {
        setWizardLoading(false);
        if (!cancelled) {
          setWizardLoaded(true);
        }
      }
    }

    loadWizardStatus();

    return () => { cancelled = true; };
  }, [activeSection, wizardLoaded]);

  async function refreshWizard() {
    setWizardLoading(true);
    setWizardError('');
    try {
      const data = await fetch('/api/setup/wizard', { cache: 'no-store' }).then(parseApiJson);
      setWizardSteps(data);
    } catch (loadError) {
      setWizardError(loadError instanceof Error ? loadError.message : 'Failed to load setup wizard');
    } finally {
      setWizardLoading(false);
      setWizardLoaded(true);
    }
  }

  useEffect(() => {
    if (activeSection !== 'payments' || stripeRuntimeLoaded) {
      return;
    }

    let cancelled = false;

    async function loadStripeRuntimeStatus() {
      setStripeRuntimeLoading(true);
      setProviderStatusError('');
      if (stripeRoleRestricted) {
        await loadStripePublicRuntimeStatus();
        if (cancelled) return;
        setStripeRuntimeStatus(null);
        setStripePermissionRestrictedByApi(false);
        setStripeRuntimeLoading(false);
        setStripeRuntimeLoaded(true);
        return;
      }
      try {
        const runtimePayload = await fetch('/api/settings/payments/stripe/status', { cache: 'no-store' }).then(parseApiJson);
        if (cancelled) return;
        setStripeRuntimeStatus(runtimePayload || null);
        setStripePublicRuntimeStatus(null);
        setStripePermissionRestrictedByApi(false);
      } catch (loadError) {
        if (cancelled) return;
        if (isPermissionRestrictedError(loadError)) {
          setStripePermissionRestrictedByApi(true);
          setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
          setStripeRuntimeStatus(null);
          await loadStripePublicRuntimeStatus();
        } else {
          setProviderStatusError('Failed to load Stripe status.');
        }
      } finally {
        if (!cancelled) {
          setStripeRuntimeLoading(false);
          setStripeRuntimeLoaded(true);
        }
      }
    }

    loadStripeRuntimeStatus();

    return () => {
      cancelled = true;
    };
  }, [activeSection, loadStripePublicRuntimeStatus, stripeRoleRestricted, stripeRuntimeLoaded]);

  useEffect(() => {
    const shouldLoadProviderMatrix = ['shipping', 'email'].includes(activeSection);
    if (!shouldLoadProviderMatrix || providerStatusLoaded) {
      return;
    }

    let cancelled = false;

    async function loadProviderStatuses() {
      setProviderStatusLoading(true);
      setProviderStatusError('');
      try {
        const providerPayload = await fetch('/api/settings/providers', { cache: 'no-store' }).then(parseApiJson);
        if (cancelled) return;

        const nextMap = {};
        for (const entry of providerPayload?.providers || []) {
          nextMap[entry.provider] = entry;
        }
        const stripeProviderSnapshot = providerPayload?.stripeProviderStatus || null;
        setProviderStatusMap(nextMap);
        setProviderStatusLoaded(true);
        setStripeRuntimeStatus((current) => current || buildStripeRuntimeStatusFromProviderSnapshot(stripeProviderSnapshot));
      } catch (loadError) {
        if (cancelled) return;
        setProviderStatusError(loadError instanceof Error ? loadError.message : 'Failed to load provider statuses');
      } finally {
        if (!cancelled) {
          setProviderStatusLoading(false);
        }
      }
    }

    loadProviderStatuses();

    return () => {
      cancelled = true;
    };
  }, [activeSection, providerStatusLoaded]);

  useEffect(() => {
    if (activeSection !== 'email' || emailStatusLoaded) {
      return;
    }

    let cancelled = false;

    async function loadEmailStatus() {
      setEmailStatusLoading(true);
      setEmailStatusError('');
      try {
        const payload = await fetch('/api/settings/email/status', { cache: 'no-store' }).then(parseApiJson);
        if (cancelled) return;
        setEmailStatus(payload || null);
        setEmailStatusLoaded(true);
      } catch (loadError) {
        if (cancelled) return;
        setEmailStatus(null);
        setEmailStatusError(loadError instanceof Error ? loadError.message : 'Failed to load email setup status');
      } finally {
        if (!cancelled) {
          setEmailStatusLoading(false);
        }
      }
    }

    loadEmailStatus();

    return () => {
      cancelled = true;
    };
  }, [activeSection, emailStatusLoaded]);

  useEffect(() => {
    if (activeSection !== 'payments' || paymentActivityLoaded) {
      return;
    }

    let cancelled = false;

    async function loadPaymentActivity() {
      setPaymentActivityLoading(true);
      setPaymentActivityError('');
      try {
        // TODO(phase4): Replace this with a dedicated payment/refund activity endpoint when available.
        const payload = await fetch('/api/orders?view=payments_activity&page=1&pageSize=12', { cache: 'no-store' }).then(parseApiJson);
        if (cancelled) return;
        const rows = buildPaymentActivityRowsFromOrders(payload?.orders || [], settings.timezone);
        setPaymentActivityRows(rows);
        setPaymentActivityLoaded(true);
      } catch (loadError) {
        if (cancelled) return;
        setPaymentActivityRows([]);
        setPaymentActivityError(loadError instanceof Error ? loadError.message : 'Failed to load payment activity');
      } finally {
        setPaymentActivityLoading(false);
      }
    }

    loadPaymentActivity();

    return () => {
      cancelled = true;
    };
  }, [activeSection, paymentActivityLoaded, settings.timezone]);

  useEffect(() => {
    if (activeSection !== 'email' || emailActivityLoaded) {
      return;
    }

    let cancelled = false;

    async function loadEmailActivity() {
      setEmailActivityLoading(true);
      setEmailActivityError('');
      try {
        const payload = await fetch('/api/email-deliveries?page=1&pageSize=12', { cache: 'no-store' }).then(parseApiJson);
        if (cancelled) return;
        const rows = (payload?.deliveries || []).map((delivery) => ({
          id: delivery.id,
          dateText: formatDateTimeForDisplay(delivery.createdAt, {
            timeZone: settings.timezone,
            fallbackText: 'Unknown',
          }),
          recipientText: delivery.recipientEmail || 'Unknown',
          templateText: formatEventType(delivery.template || delivery.event || 'email'),
          statusText: normalizeStatusLabel(delivery.status) || 'unknown',
          providerText: formatProviderLabel(delivery.provider),
          referenceText: delivery.providerMessageId || delivery.id,
        }));
        setEmailActivityRows(rows);
        setEmailActivityLoaded(true);
      } catch (loadError) {
        if (cancelled) return;
        setEmailActivityRows([]);
        setEmailActivityError(loadError instanceof Error ? loadError.message : 'Failed to load email activity');
      } finally {
        setEmailActivityLoading(false);
      }
    }

    loadEmailActivity();

    return () => {
      cancelled = true;
    };
  }, [activeSection, emailActivityLoaded, settings.timezone]);

  useEffect(() => {
    const fallbackEmail = String(settings.supportEmail || settings.senderEmail || '').trim();
    if (!fallbackEmail) return;

// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setProviderTestEmailById((current) => ({
      RESEND: current.RESEND || fallbackEmail,
      SMTP: current.SMTP || fallbackEmail,
    }));
  }, [settings.senderEmail, settings.supportEmail]);

  const setupChecks = useMemo(() => {
    if (!setupStatus) return [];
    return [...(setupStatus.requiredChecks || []), ...(setupStatus.recommendedChecks || [])];
  }, [setupStatus]);

  const setupCheckById = useMemo(() => {
    const byId = {};
    for (const check of setupChecks) {
      byId[check.id] = check;
    }
    return byId;
  }, [setupChecks]);

  const setupCards = useMemo(() => {
    return SETUP_CARD_DEFINITIONS.map((card) => {
      const checks = card.checkIds.map((id) => setupCheckById[id]).filter(Boolean);
      let status = 'WARN';
      let fix = '';
      let summary = 'Pending check data.';

      if (checks.length > 0) {
        status = checks.reduce((current, check) => getHigherStatus(current, normalizeCheckStatus(check)), 'PASS');
        const primaryIssue = checks.find((check) => normalizeCheckStatus(check) !== 'PASS');
        summary = primaryIssue?.summary || checks[0].summary || 'Configured.';
        fix = primaryIssue?.fix || '';
      }

      return {
        ...card,
        status,
        summary,
        fix,
      };
    });
  }, [setupCheckById]);

  const setupMissingEnvVars = useMemo(() => extractEnvVariableHints(setupChecks), [setupChecks]);
  const hasSetupDiagnostics = Boolean(setupStatus && Array.isArray(setupStatus.requiredChecks));
  const setupCompletionPercent = setupStatus?.completionPercent ?? 0;
  const showSetupLoadingState = activeSection === 'setup' && setupLoading && !setupStatus && !setupError;
  const showSetupErrorState = activeSection === 'setup' && Boolean(setupError);
  const showSetupDiagnostics = activeSection === 'setup' && hasSetupDiagnostics;
  const showDeploymentLoading = activeSection === 'setup' && deploymentLoading && !deploymentStatus && !deploymentError;
  const showDeploymentError = activeSection === 'setup' && Boolean(deploymentError);
  const showDeploymentChecklist = activeSection === 'setup' && Boolean(deploymentStatus?.checks?.length);
  const showWizardLoading = activeSection === 'setup' && wizardLoading && !wizardSteps && !wizardError;
  const showWizardError = activeSection === 'setup' && Boolean(wizardError);
  const showWizardSteps = activeSection === 'setup' && Boolean(wizardSteps?.steps?.length);
  const setupRequiredNextSteps = setupStatus?.requiredNextSteps || [];
  const setupOptionalProductionSteps = setupStatus?.optionalProductionSteps || [];
  const setupOptionalFoundationSteps = useMemo(
    () => setupOptionalProductionSteps.filter((step) => !/STRIPE|RESEND|SMTP|SENDLAYER|EASYPOST|SHIPPO/i.test(step)),
    [setupOptionalProductionSteps]
  );
  const stripeProviderStatus =
    providerStatusMap.STRIPE ||
    toProviderGatewayStatusFromStripeSavedStatus(stripeRuntimeStatus) ||
    toProviderGatewayStatusFromStripeSnapshot(stripeRuntimeStatus?.providerStatus) ||
    null;
  const stripeDisplayedRuntimeStatus = stripeRuntimeStatus || stripePublicRuntimeStatus;
  const resendProviderStatus = providerStatusMap.RESEND || null;
  const smtpProviderStatus = providerStatusMap.SMTP || null;
  const shippoProviderStatus = providerStatusMap.SHIPPO || null;
  const easypostProviderStatus = providerStatusMap.EASYPOST || null;
  const isPaymentsSectionActive = activeSection === 'payments';
  const stripeSavedStatusPending =
    !stripeDisplayedRuntimeStatus && !stripeProviderStatus && (stripeRuntimeLoading || !stripeRuntimeLoaded);
  const showPaymentsProviderRowsSkeleton = false;
  const stripeSetupStatus = useMemo(
    () => {
      if (stripePermissionRestricted) {
        return {
          label: STRIPE_OWNER_REQUIRED_LABEL,
          tone: 'neutral',
          detail: stripePublicRuntimeStatus
            ? STRIPE_OWNER_REQUIRED_HELPER_COPY
            : `${STRIPE_OWNER_REQUIRED_HELPER_COPY} Detailed verification status is restricted.`,
          sourceLabel: STRIPE_VIEW_ONLY_LABEL,
          lastVerifiedAt: null,
        };
      }

      if (stripeSavedStatusPending) {
        return {
          label: 'Loading saved status...',
          tone: 'neutral',
          detail: 'Loading saved Stripe status.',
          sourceLabel: 'Not active',
          lastVerifiedAt: null,
        };
      }

      if (stripeProviderStatus && !stripeDisplayedRuntimeStatus) {
        return describeProviderGatewayStatus(stripeProviderStatus, describeStripeSetup(setupCheckById));
      }

      if (!stripeDisplayedRuntimeStatus) {
        return {
          label: 'Verification unavailable',
          tone: 'warning',
          detail: 'Saved Stripe status is temporarily unavailable. Refresh and try again.',
          sourceLabel: 'Not active',
          lastVerifiedAt: null,
        };
      }

      const resolved = describeStripeSavedStatus(
        stripeDisplayedRuntimeStatus,
        stripeProviderStatus,
        describeStripeSetup(setupCheckById)
      );

      if (
        resolved.label === 'Needs attention' &&
        isLikelyVerificationTimeout(stripeDisplayedRuntimeStatus?.lastError || resolved.detail)
      ) {
        return {
          ...resolved,
          label: 'Verification unavailable',
          tone: 'warning',
          detail: 'Saved Stripe configuration is present, but verification is temporarily unavailable.',
        };
      }

      return resolved;
    },
    [
      stripeDisplayedRuntimeStatus,
      stripePermissionRestricted,
      stripeProviderStatus,
      stripePublicRuntimeStatus,
      setupCheckById,
      stripeSavedStatusPending,
    ]
  );
  const stripeCheckoutSourceLabel =
    STRIPE_CHECKOUT_SOURCE_LABEL[stripeDisplayedRuntimeStatus?.source] || STRIPE_CHECKOUT_SOURCE_LABEL.none;
  const stripeResolvedWebhookSource =
    stripeDisplayedRuntimeStatus?.hasWebhookSecret
      ? stripeDisplayedRuntimeStatus?.source || 'db'
      : 'none';
  const stripeWebhookSourceLabel =
    STRIPE_WEBHOOK_SOURCE_LABEL[stripeResolvedWebhookSource] || STRIPE_WEBHOOK_SOURCE_LABEL.none;
  const stripeRuntimeModeLabel =
    stripeDisplayedRuntimeStatus?.mode || stripeDisplayedRuntimeStatus?.providerStatus?.mode || 'unknown';
  const stripeWebhookEndpoint = stripeDisplayedRuntimeStatus?.webhookEndpoint || '';
  const stripeWebhookEndpointReady = Boolean(stripeDisplayedRuntimeStatus?.webhookEndpointReady);
  const stripeWebhookEndpointIssue = stripeDisplayedRuntimeStatus?.webhookEndpointIssue || null;
  const stripeWebhookEndpointMessage = stripeDisplayedRuntimeStatus?.webhookEndpointMessage || '';
  const stripeWebhookEndpointStatusLabel =
    stripeActionsRestricted && !stripeWebhookEndpoint
      ? STRIPE_VIEW_ONLY_LABEL
      : stripeWebhookEndpointReady
        ? 'Ready'
        : 'Store URL needs setup';
  const stripeLastCheckedText = stripeSetupStatus?.lastVerifiedAt
    ? formatDateTimeForDisplay(stripeSetupStatus.lastVerifiedAt, { timeZone: settings.timezone, fallbackText: '' })
    : null;
  const stripeMethodChips = useMemo(() => getStripeMethodChips(stripeDisplayedRuntimeStatus), [stripeDisplayedRuntimeStatus]);
  const showStripeRuntimeMismatchWarning =
    stripeProviderStatus?.state === 'VERIFIED' &&
    stripeDisplayedRuntimeStatus?.source &&
    stripeDisplayedRuntimeStatus.source !== 'db';
  const checkoutMethodStatuses = useMemo(
    () => buildCheckoutMethodStatuses(stripeDisplayedRuntimeStatus),
    [stripeDisplayedRuntimeStatus]
  );
  const paymentProviderRows = useMemo(
    () =>
      buildPaymentProviderRows({
        stripeSetupStatus,
        stripeCheckoutSourceLabel,
        stripeRuntimeModeLabel,
        stripeWebhookSourceLabel,
        stripeSavedStatusLoading: stripeSavedStatusPending,
        stripeLastCheckedText,
        stripeMethodChips,
      }),
    [
      stripeCheckoutSourceLabel,
      stripeLastCheckedText,
      stripeMethodChips,
      stripeRuntimeModeLabel,
      stripeSavedStatusPending,
      stripeSetupStatus,
      stripeWebhookSourceLabel,
    ]
  );
  const paymentActivityColumns = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date',
        render: (row) => row.dateText,
      },
      {
        key: 'order',
        header: 'Order',
        render: (row) => row.orderText,
      },
      {
        key: 'provider',
        header: 'Provider',
        render: (row) => row.providerText,
      },
      {
        key: 'event',
        header: 'Event',
        render: (row) => row.eventText,
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <AdminStatusChip tone={statusToneFromLabel(row.statusText)}>{row.statusText}</AdminStatusChip>,
      },
      {
        key: 'amount',
        header: 'Amount',
        render: (row) => row.amountText,
      },
      {
        key: 'reference',
        header: 'Reference',
        render: (row) => <span className={styles.referenceCell}>{row.referenceText}</span>,
      },
    ],
    []
  );
  const emailActivityColumns = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date',
        render: (row) => row.dateText,
      },
      {
        key: 'recipient',
        header: 'Recipient',
        render: (row) => row.recipientText,
      },
      {
        key: 'template',
        header: 'Template',
        render: (row) => row.templateText,
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <AdminStatusChip tone={statusToneFromLabel(row.statusText)}>{row.statusText}</AdminStatusChip>,
      },
      {
        key: 'provider',
        header: 'Provider',
        render: (row) => row.providerText,
      },
      {
        key: 'reference',
        header: 'Reference',
        render: (row) => <span className={styles.referenceCell}>{row.referenceText}</span>,
      },
    ],
    []
  );
  const stripeCredentialMeta = providerStatusMap.STRIPE?.credentialMeta || [];
  const stripeSavedCredentialMeta = stripeCredentialMeta.filter((entry) => entry.present);
  const stripeCredentialMaskMap = useMemo(
    () =>
      buildStripeMaskedCredentialMap({
        credentialMeta: stripeSavedCredentialMeta,
        runtimeStatus: stripeDisplayedRuntimeStatus || null,
        runtimeMode: stripeDisplayedRuntimeStatus?.mode || null,
      }),
    [providerStatusMap.STRIPE?.credentialMeta, stripeDisplayedRuntimeStatus]
  );
  const stripeSavedCredentialEntries = useMemo(() => {
    const entries = [];
    if (stripeCredentialMaskMap.PUBLISHABLE_KEY) {
      entries.push({ key: 'PUBLISHABLE_KEY', maskedValue: stripeCredentialMaskMap.PUBLISHABLE_KEY });
    }
    if (stripeCredentialMaskMap.SECRET_KEY) {
      entries.push({ key: 'SECRET_KEY', maskedValue: stripeCredentialMaskMap.SECRET_KEY });
    }
    if (stripeCredentialMaskMap.WEBHOOK_SECRET) {
      entries.push({ key: 'WEBHOOK_SECRET', maskedValue: stripeCredentialMaskMap.WEBHOOK_SECRET });
    }
    if (stripeCredentialMaskMap.MODE) {
      entries.push({ key: 'MODE', maskedValue: stripeCredentialMaskMap.MODE });
    }
    return entries;
  }, [stripeCredentialMaskMap.MODE, stripeCredentialMaskMap.PUBLISHABLE_KEY, stripeCredentialMaskMap.SECRET_KEY, stripeCredentialMaskMap.WEBHOOK_SECRET]);
  const stripeShowPublishableInput = shouldShowStripeCredentialInput({
    savedMaskedValue: stripeCredentialMaskMap.PUBLISHABLE_KEY,
    draftValue: providerForms.STRIPE.publishableKey,
    isReplacing: stripeCredentialReplaceByField.publishableKey,
  });
  const stripeShowSecretInput = shouldShowStripeCredentialInput({
    savedMaskedValue: stripeCredentialMaskMap.SECRET_KEY,
    draftValue: providerForms.STRIPE.secretKey,
    isReplacing: stripeCredentialReplaceByField.secretKey,
  });
  const stripeShowWebhookInput = shouldShowStripeCredentialInput({
    savedMaskedValue: stripeCredentialMaskMap.WEBHOOK_SECRET,
    draftValue: providerForms.STRIPE.webhookSecret,
    isReplacing: stripeCredentialReplaceByField.webhookSecret,
  });
  const stripeSavedMode = useMemo(() => {
    const raw = String(
      stripeCredentialMaskMap.MODE ||
        stripeDisplayedRuntimeStatus?.providerStatus?.mode ||
        stripeDisplayedRuntimeStatus?.mode ||
        ''
    )
      .trim()
      .toLowerCase();
    return raw === 'live' ? 'live' : 'test';
  }, [stripeCredentialMaskMap.MODE, stripeDisplayedRuntimeStatus?.mode, stripeDisplayedRuntimeStatus?.providerStatus?.mode]);
  const stripeHasSavedRequiredKeys = Boolean(
    stripeCredentialMaskMap.PUBLISHABLE_KEY && stripeCredentialMaskMap.SECRET_KEY
  );
  const stripeSavePayload = useMemo(() => {
    return buildStripeCredentialSavePayload({
      ...providerForms.STRIPE,
      savedMaskMap: stripeCredentialMaskMap,
    });
  }, [
    stripeCredentialMaskMap,
    providerForms.STRIPE.mode,
    providerForms.STRIPE.publishableKey,
    providerForms.STRIPE.secretKey,
    providerForms.STRIPE.webhookSecret,
  ]);
  const stripeConnectionPresentation = useMemo(() => {
    const statusLabel = String(stripeSetupStatus.label || '').trim();
    const normalizedStatusLabel = normalizeStatusLabel(statusLabel);

    if (normalizedStatusLabel === normalizeStatusLabel(STRIPE_OWNER_REQUIRED_LABEL)) {
      return {
        heading: 'Stripe connection (view only)',
        badgeLabel: STRIPE_OWNER_REQUIRED_LABEL,
        badgeTone: 'neutral',
        copy: stripeSetupStatus.detail,
      };
    }

    if (normalizedStatusLabel === 'loading saved status...') {
      return {
        heading: 'Stripe saved status',
        badgeLabel: 'Loading saved status...',
        badgeTone: 'neutral',
        copy: stripeSetupStatus.detail,
      };
    }

    if (normalizedStatusLabel === 'verification unavailable') {
      return {
        heading: 'Stripe is configured',
        badgeLabel: 'Verification unavailable',
        badgeTone: 'warning',
        copy: stripeSetupStatus.detail,
      };
    }

    if (normalizedStatusLabel === 'verified') {
      return {
        heading: 'Stripe is connected',
        badgeLabel: 'Verified',
        badgeTone: 'success',
        copy: stripeSetupStatus.detail,
      };
    }

    if (normalizedStatusLabel === 'configured') {
      return {
        heading: 'Stripe credentials saved',
        badgeLabel: 'Configured',
        badgeTone: 'warning',
        copy: stripeSetupStatus.detail,
      };
    }

    if (normalizedStatusLabel === 'needs attention') {
      return {
        heading: 'Stripe needs attention',
        badgeLabel: 'Needs attention',
        badgeTone: 'danger',
        copy: stripeSetupStatus.detail,
      };
    }

    return {
      heading: 'Stripe is not configured',
      badgeLabel: 'Needs setup',
      badgeTone: 'warning',
      copy: stripeSetupStatus.detail,
    };
  }, [stripeSetupStatus.detail, stripeSetupStatus.label]);
  const stripeApiKeysSummary = stripePermissionRestricted
    ? STRIPE_VIEW_ONLY_LABEL
    : stripeHasSavedRequiredKeys
      ? 'Saved'
      : 'Missing required keys';
  const stripeWebhookSummaryLabel = stripePermissionRestricted ? STRIPE_VIEW_ONLY_LABEL : stripeWebhookSourceLabel;
  const stripeConnectionSummaryRows = useMemo(
    () => [
      { label: 'Status', value: stripeConnectionPresentation.badgeLabel },
      { label: 'Mode', value: stripeRuntimeModeLabel },
      { label: 'Credentials source', value: stripeCheckoutSourceLabel },
      { label: 'API keys', value: stripeApiKeysSummary },
      { label: 'Webhook', value: stripeWebhookSummaryLabel },
      { label: 'Last verified', value: formatDateTime(stripeSetupStatus.lastVerifiedAt, settings.timezone) },
    ],
    [
      stripeApiKeysSummary,
      stripeConnectionPresentation.badgeLabel,
      stripeRuntimeModeLabel,
      stripeCheckoutSourceLabel,
      stripeWebhookSummaryLabel,
      stripeSetupStatus.lastVerifiedAt,
    ]
  );

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setProviderForms((current) => {
      const currentStripe = current.STRIPE || EMPTY_PROVIDER_FORMS.STRIPE;
      if (
        currentStripe.mode === stripeSavedMode ||
        currentStripe.publishableKey.trim() ||
        currentStripe.secretKey.trim() ||
        currentStripe.webhookSecret.trim()
      ) {
        return current;
      }

      return {
        ...current,
        STRIPE: {
          ...currentStripe,
          mode: stripeSavedMode,
        },
      };
    });
  }, [stripeSavedMode]);
  const resendCredentialMeta = resendProviderStatus?.credentialMeta || [];
  const smtpCredentialMeta = smtpProviderStatus?.credentialMeta || [];
  const resendSavedCredentialMeta = resendCredentialMeta.filter((entry) => entry.present);
  const smtpSavedCredentialMeta = smtpCredentialMeta.filter((entry) => entry.present);
  const senderConfigured = Boolean(String(settings.senderEmail || '').trim());
  const activeEmailProvider = emailStatus?.provider === 'RESEND' || emailStatus?.provider === 'SMTP'
    ? emailStatus.provider
    : null;
  const emailProviderSource = String(emailStatus?.providerSource || 'none').trim().toLowerCase();
  const emailVerificationStatus = String(emailStatus?.verificationStatus || '').trim().toLowerCase();
  const emailProviderStatusPending = !emailStatus && !providerStatusLoaded && (providerStatusLoading || activeSection === 'email');
  const emailProviderSetupStatus = useMemo(() => {
    if (!emailStatus) {
      return {
        label: 'Loading saved status...',
        tone: 'neutral',
        detail: 'Loading saved email provider status.',
      };
    }

    if (emailVerificationStatus === 'verified') {
      return {
        label: 'Verified',
        tone: 'success',
        detail: `${emailStatus.provider || 'Provider'} setup is verified.`,
      };
    }
    if (emailVerificationStatus === 'needs_attention') {
      if (isLikelyVerificationTimeout(emailStatus?.lastError)) {
        return {
          label: 'Verification unavailable',
          tone: 'warning',
          detail: 'Saved email provider configuration is present, but verification is temporarily unavailable.',
        };
      }
      return {
        label: 'Needs attention',
        tone: 'danger',
        detail: emailStatus.lastError || 'Email provider verification failed. Review credentials and verify again.',
      };
    }
    if (emailVerificationStatus === 'verification_unavailable') {
      return {
        label: 'Verification unavailable',
        tone: 'warning',
        detail:
          emailProviderSource === 'env'
            ? 'Email provider is active from environment fallback credentials. Save and verify provider credentials in Settings -> Email.'
            : 'Saved email provider configuration exists, but verification metadata is unavailable.',
      };
    }
    if (emailVerificationStatus === 'configured') {
      return {
        label: 'Configured',
        tone: 'warning',
        detail: 'Saved provider configuration exists, but verification has not been run yet.',
      };
    }

    return {
      label: 'Setup needed',
      tone: 'warning',
      detail: 'Connect and save an email provider before sending transactional emails.',
    };
  }, [emailProviderSource, emailStatus, emailVerificationStatus]);
  const emailJobHealthPresentation = useMemo(() => {
    const health = String(emailStatus?.jobHealthStatus || 'unknown').trim().toLowerCase();
    if (health === 'healthy') {
      return {
        label: 'Healthy',
        tone: 'success',
        detail: 'Email worker and queue health look good.',
        showLogsAction: false,
      };
    }
    if (health === 'critical') {
      return {
        label: 'Critical',
        tone: 'danger',
        detail: 'Email queue processing needs attention.',
        showLogsAction: true,
      };
    }
    if (health === 'warning') {
      return {
        label: 'Warning',
        tone: 'warning',
        detail: 'Email delivery processing may be delayed.',
        showLogsAction: true,
      };
    }
    return {
      label: 'Unknown',
      tone: 'warning',
      detail: 'Email job health is currently unknown.',
      showLogsAction: true,
    };
  }, [emailStatus?.jobHealthStatus]);
  const resendSetupStatus = useMemo(
    () =>
      resendProviderStatus
        ? describeProviderGatewayStatus(resendProviderStatus, describeResendSetup(setupCheckById))
        : emailProviderStatusPending
          ? {
              label: 'Loading saved status...',
              tone: 'neutral',
              detail: 'Loading saved provider verification status.',
            }
          : describeProviderGatewayStatus(resendProviderStatus, describeResendSetup(setupCheckById)),
    [emailProviderStatusPending, resendProviderStatus, setupCheckById]
  );
  const smtpSetupStatus = useMemo(
    () =>
      smtpProviderStatus
        ? describeProviderGatewayStatus(smtpProviderStatus, {
            label: 'Not configured',
            tone: 'warning',
            detail: 'SMTP credentials are not configured yet.',
          })
        : emailProviderStatusPending
          ? {
              label: 'Loading saved status...',
              tone: 'neutral',
              detail: 'Loading saved provider verification status.',
            }
          : describeProviderGatewayStatus(smtpProviderStatus, {
              label: 'Not configured',
              tone: 'warning',
              detail: 'SMTP credentials are not configured yet.',
            }),
    [emailProviderStatusPending, smtpProviderStatus]
  );
  const emailProviderRows = useMemo(
    () => [
      {
        id: EMAIL_PROVIDER_DRAWER.RESEND,
        iconText: 'R',
        iconClassName: 'providerIconResend',
        name: 'Resend',
        status: resendSetupStatus,
        description: 'Transactional email API provider for customer receipts and updates.',
        badges: [
          { label: 'Official', tone: 'neutral' },
          resendSetupStatus.label === 'Verified'
            ? { label: 'Active', tone: 'success' }
            : resendSetupStatus.label === 'Loading saved status...'
              ? { label: 'Loading saved status...', tone: 'neutral' }
            : resendSetupStatus.label === 'Credentials saved'
              ? { label: 'Configured', tone: 'warning' }
            : resendSetupStatus.label === 'Error'
                ? { label: 'Needs attention', tone: 'danger' }
                : { label: 'Needs setup', tone: 'warning' },
        ],
        chips: ['Order confirmations', 'Shipping updates', 'Delivery webhooks'],
      },
      {
        id: EMAIL_PROVIDER_DRAWER.SMTP,
        iconText: 'S',
        iconClassName: 'providerIconSmtp',
        name: 'SMTP',
        status: smtpSetupStatus,
        description: 'Use host/port credentials from your mail service when SMTP delivery is required.',
        badges: [
          { label: 'Built-in', tone: 'neutral' },
          smtpSetupStatus.label === 'Verified'
            ? { label: 'Ready', tone: 'success' }
            : smtpSetupStatus.label === 'Loading saved status...'
              ? { label: 'Loading saved status...', tone: 'neutral' }
            : smtpSetupStatus.label === 'Credentials saved'
              ? { label: 'Configured', tone: 'warning' }
            : smtpSetupStatus.label === 'Error'
                ? { label: 'Needs attention', tone: 'danger' }
                : { label: 'Needs setup', tone: 'warning' },
        ],
        chips: ['Host + port auth', 'TLS toggle', 'Manual verification'],
      },
      {
        id: EMAIL_PROVIDER_DRAWER.SENDLAYER,
        iconText: 'L',
        iconClassName: 'providerIconSendLayer',
        name: 'SendLayer',
        status: {
          label: 'Coming soon',
          tone: 'warning',
          detail: 'Runtime adapter support is not active yet.',
          sourceLabel: 'Not active',
          lastVerifiedAt: null,
        },
        description: 'Reserved provider slot for future SendLayer runtime support.',
        badges: [{ label: 'Coming soon', tone: 'warning' }],
        chips: ['Not active'],
      },
    ],
    [resendSetupStatus, smtpSetupStatus]
  );
  const hasStoreAddress = Boolean(String(settings.address || '').trim());
  const activeEmailTemplate = useMemo(
    () => EMAIL_TEMPLATE_SUMMARY.find((template) => template.id === activeEmailTemplateId) || null,
    [activeEmailTemplateId]
  );
  const brandDisplayName = String(brandKit?.name || settings.storeName || 'Your store').trim();
  const storefrontPrimaryColor = 'var(--checkout-surface)';
  const storefrontTextColor = 'var(--checkout-text)';
  const checkoutPreviewLogo = brandKit?.checkoutLogoUrl || brandKit?.logoUrl || '';
  const emailPreviewLogo = brandKit?.emailLogoUrl || brandKit?.logoUrl || '';
  const emailHeaderColor = 'var(--checkout-surface-strong)';
  const shippingMode = shippingSettingsProfile?.shippingMode || 'MANUAL';
  const shippingProvider = shippingSettingsProfile?.shippingLiveProvider || null;

  const shippoStatus = useMemo(() => {
    const fallback =
      shippingProvider === 'SHIPPO'
        ? shippingSetupStatus?.providerConnected
          ? { label: 'Verified', tone: 'success', detail: 'Shippo credentials are saved and the connection test passed.' }
          : { label: 'Credentials saved', tone: 'warning', detail: 'Shippo is selected, but provider verification is still pending.' }
        : { label: 'Not configured', tone: 'warning', detail: 'Shippo is not selected as the live provider.' };
    return describeProviderGatewayStatus(shippoProviderStatus, fallback);
  }, [shippingProvider, shippingSetupStatus, shippoProviderStatus]);

  const easypostStatus = useMemo(() => {
    const fallback =
      shippingProvider === 'EASYPOST'
        ? shippingSetupStatus?.providerConnected
          ? { label: 'Verified', tone: 'success', detail: 'EasyPost credentials are saved and the connection test passed.' }
          : { label: 'Credentials saved', tone: 'warning', detail: 'EasyPost is selected, but provider verification is still pending.' }
        : { label: 'Not configured', tone: 'warning', detail: 'EasyPost is not selected as the live provider.' };
    return describeProviderGatewayStatus(easypostProviderStatus, fallback);
  }, [shippingProvider, shippingSetupStatus, easypostProviderStatus]);

  useEffect(() => {
    if (savedState !== 'saved_just_now') return;
    const timer = window.setTimeout(() => {
      setSavedState((current) => (current === 'saved_just_now' ? 'saved' : current));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [savedState]);

  useEffect(() => {
    if (shippingModeSavedState !== 'saved_just_now') return;
    const timer = window.setTimeout(() => {
      setShippingModeSavedState((current) => (current === 'saved_just_now' ? 'saved' : current));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [shippingModeSavedState]);

  async function handleSettingsPatch(patch) {
    setSavedState('saving');

    try {
      await updateSettings(patch);
      setSavedState('saved_just_now');
    } catch {
      setSavedState('error');
    }
  }

  function handleBrandKitPatch(patch) {
    setBrandKit((current) => ({ ...(current || {}), ...patch }));
    setSavedState('dirty');
  }

  async function handleBrandKitSave() {
    if (!brandKit) return;
    setSavedState('saving');
    setBrandKitError('');
    try {
      const updated = await fetch('/api/settings/brand-kit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandKit),
      }).then(parseApiJson);
      setBrandKit(updated);
      setSavedState('saved_just_now');
    } catch (saveError) {
      setSavedState('error');
      setBrandKitError(saveError instanceof Error ? saveError.message : 'Failed to save brand kit');
    }
  }

  async function handleBrandAssetUpload(field, file) {
    if (!file) return;
    setUploadingField(field);
    setBrandKitError('');
    setBrandKitNotice('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('altText', file.name);
      const uploaded = await fetch('/api/media/upload', { method: 'POST', body: form }).then(parseApiJson);
      const assetUrl = uploaded?.url || '';
      if (!assetUrl) {
        throw new Error('Upload succeeded but no asset URL was returned.');
      }
      handleBrandKitPatch({ [field]: assetUrl });
      setBrandKitNotice('Asset uploaded. Save changes to persist it in Brand & appearance.');
    } catch (uploadError) {
      setBrandKitError(uploadError instanceof Error ? uploadError.message : 'Brand asset upload failed.');
    } finally {
      setUploadingField('');
    }
  }

  function renderAssetUploadField({ field, label, refObject }) {
    const currentValue = brandKit?.[field] || '';
    return (
      <div className={styles.assetField}>
        <div className={styles.assetFieldHeader}>
          <span>{label}</span>
          <div className={styles.assetActions}>
            <input
              accept="image/*"
              className={styles.hiddenFileInput}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleBrandAssetUpload(field, file);
                }
                event.target.value = '';
              }}
              ref={refObject}
              type="file"
            />
            <AdminButton
              disabled={uploadingField === field}
              onClick={() => refObject.current?.click()}
              size="sm"
              variant="secondary"
            >
              {uploadingField === field ? 'Uploading...' : currentValue ? 'Replace file' : 'Upload file'}
            </AdminButton>
            {currentValue ? (
              <AdminButton onClick={() => handleBrandKitPatch({ [field]: '' })} size="sm" variant="ghost">
                Clear
              </AdminButton>
            ) : null}
          </div>
        </div>
        {currentValue ? (
          <div className={styles.assetPreview}>
            <img alt={`${label} preview`} src={currentValue} />
          </div>
        ) : (
          <p className={styles.assetHint}>No file selected yet.</p>
        )}
      </div>
    );
  }

  async function refreshShippingConfig(scope = activeSection) {
    const shouldLoadShipping = scope === 'shipping' || scope === 'all';
    const shouldLoadTaxes = scope === 'taxes' || scope === 'all';

    setShippingConfigLoading(true);
    setShippingConfigError('');
    setShippingConfigLoadedBySection((current) => ({
      shipping: shouldLoadShipping ? false : current.shipping,
      taxes: shouldLoadTaxes ? false : current.taxes,
    }));

    try {
      if (shouldLoadShipping) {
        const [shippingSettingsData, shippingSetupData] = await Promise.all([
          fetch('/api/settings/shipping', { cache: 'no-store' }).then(parseApiJson),
          fetch('/api/settings/shipping/setup-status', { cache: 'no-store' }).then(parseApiJson),
        ]);
        setShippingSettingsProfile(shippingSettingsData || null);
        setShippingSetupStatus(shippingSetupData || null);
      }

      if (shouldLoadTaxes) {
        const [zonesData, taxRulesData, taxSettingsData] = await Promise.all([
          fetch('/api/settings/shipping-zones').then(parseApiJson),
          fetch('/api/settings/tax-rules').then(parseApiJson),
          fetch('/api/settings/tax', { cache: 'no-store' }).then(parseApiJson),
        ]);
        setShippingZones((zonesData || []).map(toZoneForm));
        setTaxRules((taxRulesData || []).map(toTaxForm));
        setTaxSettings({
          enabled: Boolean(taxSettingsData?.enabled),
          strategy: taxSettingsData?.strategy || 'MANUAL',
          defaultTaxRatePercent: String(Number(taxSettingsData?.defaultTaxRatePercent ?? 0)),
          taxShipping: Boolean(taxSettingsData?.taxShipping),
          pricesIncludeTax: Boolean(taxSettingsData?.pricesIncludeTax),
          originCountry: taxSettingsData?.originCountry || '',
          originState: taxSettingsData?.originState || '',
          originPostalCode: taxSettingsData?.originPostalCode || '',
        });
      }

      setShippingConfigLoadedBySection((current) => ({
        shipping: shouldLoadShipping ? true : current.shipping,
        taxes: shouldLoadTaxes ? true : current.taxes,
      }));
    } catch (refreshError) {
      setShippingConfigError(
        refreshError instanceof Error ? refreshError.message : 'Failed to load shipping configuration'
      );
    } finally {
      setShippingConfigLoading(false);
    }
  }

  const taxRegionSummaryRows = useMemo(() => {
    const defaultRatePercent = parseNumberOrUndefined(taxSettings.defaultTaxRatePercent) ?? 0;
    const configuredRows = taxRules.map((rule) => {
      const regionParts = [rule.name, rule.countryCode, rule.provinceCode].filter(Boolean);
      const ratePercent = parseNumberOrUndefined(rule.ratePercent) ?? 0;
      return {
        id: `configured-${rule.id}`,
        region: regionParts.join(' - ') || 'Configured region',
        rateLabel: `${ratePercent.toFixed(2)}%`,
        activeLabel: rule.isActive ? 'Active' : 'Inactive',
        source: 'Manual',
      };
    });

    return [
      ...configuredRows,
      {
        id: 'fallback-default-rate',
        region: 'Rest of world fallback',
        rateLabel: `${defaultRatePercent.toFixed(2)}%`,
        activeLabel: taxSettings.enabled && defaultRatePercent > 0 ? 'Active fallback' : 'Inactive fallback',
        source: 'Manual default',
      },
    ];
  }, [taxRules, taxSettings.defaultTaxRatePercent, taxSettings.enabled]);

  async function handleSaveTaxSettings() {
    const ratePercent = parseNumberOrUndefined(taxSettings.defaultTaxRatePercent);
    if (ratePercent == null || ratePercent < 0 || ratePercent > 100) {
      setTaxSettingsFormError('Manual tax rate must be between 0 and 100%.');
      setShippingConfigError('Manual tax rate must be between 0 and 100%.');
      setTaxSettingsSaveState('failed');
      pushSettingsToast('Tax settings failed. Manual tax rate must be between 0 and 100%.', 'error');
      return;
    }

    try {
      setTaxSettingsSaveState('saving');
      setTaxSettingsFormError('');
      setShippingConfigError('');
      setTaxSettingsSaving(true);
      const updated = await fetch('/api/settings/tax', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: taxSettings.enabled,
          strategy: 'MANUAL',
          defaultTaxRatePercent: ratePercent,
          taxShipping: taxSettings.taxShipping,
          pricesIncludeTax: taxSettings.pricesIncludeTax,
          originCountry: taxSettings.originCountry || null,
          originState: taxSettings.originState || null,
          originPostalCode: taxSettings.originPostalCode || null,
        }),
      }).then(parseApiJson);

      setTaxSettings({
        enabled: Boolean(updated?.enabled),
        strategy: updated?.strategy || 'MANUAL',
        defaultTaxRatePercent: String(Number(updated?.defaultTaxRatePercent ?? 0)),
        taxShipping: Boolean(updated?.taxShipping),
        pricesIncludeTax: Boolean(updated?.pricesIncludeTax),
        originCountry: updated?.originCountry || '',
        originState: updated?.originState || '',
        originPostalCode: updated?.originPostalCode || '',
      });
      setTaxPreviewError('');
      setTaxSettingsSaveState('saved');
      closeTaxDrawer();
      pushSettingsToast('Tax settings saved', 'success');
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save tax settings';
      setTaxSettingsFormError(message);
      setShippingConfigError(message);
      setTaxSettingsSaveState('failed');
      pushSettingsToast(`Tax settings failed: ${message}`, 'error');
    } finally {
      setTaxSettingsSaving(false);
    }
  }

  async function handleCalculateTaxPreview() {
    try {
      setTaxPreviewCalculating(true);
      setTaxPreviewError('');
      setTaxSettingsFormError('');
      const result = calculateTaxPreview(
        {
          subtotal: shippingTaxPreview.subtotal,
          shippingAmount: shippingTaxPreview.shippingAmount,
          country: shippingTaxPreview.country,
          province: shippingTaxPreview.province,
        },
        {
          enabled: taxSettings.enabled,
          defaultTaxRatePercent: taxSettings.defaultTaxRatePercent,
          taxShipping: taxSettings.taxShipping,
        },
        taxRules
      );
      setTaxPreviewResult(result);
      pushSettingsToast('Tax preview calculated', 'success');
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : 'Failed to calculate tax preview';
      setTaxPreviewError(message);
      setTaxPreviewResult(EMPTY_TAX_PREVIEW_RESULT);
      pushSettingsToast(`Tax preview failed: ${message}`, 'error');
    } finally {
      setTaxPreviewCalculating(false);
    }
  }

  async function refreshSetupStatus() {
    try {
      setSetupLoading(true);
      setSetupError('');
      const diagnostics = await fetch('/api/setup/status', { cache: 'no-store' }).then(parseApiJson);
      setSetupStatus(diagnostics);
    } catch (refreshError) {
      setSetupStatus(null);
      setSetupError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh setup diagnostics');
    } finally {
      setSetupLoading(false);
      setSetupLoaded(true);
    }
  }

  async function refreshDeploymentValidation() {
    try {
      setDeploymentLoading(true);
      setDeploymentError('');
      const data = await fetch('/api/deployment-validation', { cache: 'no-store' }).then(parseApiJson);
      setDeploymentStatus(data);
    } catch (refreshError) {
      setDeploymentStatus(null);
      setDeploymentError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh deployment validation');
    } finally {
      setDeploymentLoading(false);
      setDeploymentLoaded(true);
    }
  }

  async function handleUpdateShippingMode(nextMode) {
    if (!nextMode || nextMode === shippingMode) return;
    try {
      setShippingModeSaving(true);
      setShippingConfigError('');
      const updated = await fetch('/api/settings/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingMode: nextMode }),
      }).then(parseApiJson);
      setShippingSettingsProfile(updated);
      await refreshShippingConfig();
    } catch (updateError) {
      setShippingConfigError(updateError instanceof Error ? updateError.message : 'Failed to update shipping mode');
    } finally {
      setShippingModeSaving(false);
    }
  }

  async function handleSelectLiveProvider(provider) {
    try {
      setShippingModeSaving(true);
      setShippingConfigError('');
      const updated = await fetch('/api/settings/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingLiveProvider: provider,
          shippingMode: shippingMode === 'MANUAL' ? 'HYBRID' : shippingMode,
        }),
      }).then(parseApiJson);
      setShippingSettingsProfile(updated);
      await refreshShippingConfig();
    } catch (updateError) {
      setShippingConfigError(updateError instanceof Error ? updateError.message : 'Failed to select shipping provider');
    } finally {
      setShippingModeSaving(false);
    }
  }

  async function handleCopyCommand(commandId, command) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        const temp = document.createElement('textarea');
        temp.value = command;
        temp.setAttribute('readonly', '');
        temp.style.position = 'absolute';
        temp.style.left = '-9999px';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }

      setSetupCopiedCommandId(commandId);
      setTimeout(() => {
        setSetupCopiedCommandId((current) => (current === commandId ? '' : current));
      }, 1400);
    } catch {
      setSetupCopiedCommandId('');
    }
  }

  function openPaymentDrawer(providerId) {
    setProviderStatusError('');
    setProviderNotice('');
    setActivePaymentDrawer(providerId);
    if (providerId === PAYMENT_PROVIDER_DRAWER.STRIPE) {
      setShowStripeAdvanced(false);
      setStripeCredentialReplaceByField({ ...EMPTY_STRIPE_REPLACE_STATE });
      if (!providerStatusLoaded && !stripeActionsRestricted) {
        void refreshProviderStatuses({ includeRuntime: false });
      }
    }
  }

  function closePaymentDrawer() {
    setStripeCredentialReplaceByField({ ...EMPTY_STRIPE_REPLACE_STATE });
    setActivePaymentDrawer(null);
  }

  function openEmailDrawer(providerId) {
    setProviderStatusError('');
    setProviderNotice('');
    setActiveEmailDrawer(providerId);
  }

  function closeEmailDrawer() {
    setActiveEmailDrawer(null);
  }

  function openBrandDrawer(drawerId) {
    setActiveBrandDrawer(drawerId);
  }

  function closeBrandDrawer() {
    setActiveBrandDrawer(null);
  }

  function patchTaxSettings(nextPatch) {
    setTaxSettingsSaveState('idle');
    setTaxSettingsFormError('');
    setTaxSettings((current) => ({ ...current, ...nextPatch }));
  }

  function openTaxDrawer(drawerId) {
    setTaxSettingsFormError('');
    setTaxSettingsSaveState('idle');
    setActiveTaxDrawer(drawerId);
  }

  function closeTaxDrawer() {
    setTaxSettingsFormError('');
    setActiveTaxDrawer(null);
  }

  async function openEmailTemplateDrawer(templateId) {
    setActiveEmailTemplateId(templateId);
    setTemplateEditorError('');
    setTemplateEditorSendResult(null);
    setTemplateEditorSendTo('');
    setTemplateEditorSendState('idle');

    const meta = EMAIL_TEMPLATE_SUMMARY.find((t) => t.id === templateId);
    if (!meta?.editable) return;

    setTemplateEditorLoading(true);
    try {
      const res = await fetch(`/api/email-templates/${templateId}`, { cache: 'no-store' }).then(parseApiJson);
      const fields = res?.fields || {};
      setTemplateEditorDraft({
        enabled: fields.enabled ?? true,
        subject: fields.subject || '',
        preheader: fields.preheader || '',
        headerTitle: fields.headerTitle || '',
        bodyText: fields.bodyText || '',
        buttonLabel: fields.buttonLabel || '',
        footerText: fields.footerText || '',
        replyToEmail: fields.replyToEmail || '',
      });
    } catch {
      setTemplateEditorError('Failed to load template settings.');
    } finally {
      setTemplateEditorLoading(false);
    }
  }

  function closeEmailTemplateDrawer() {
    setActiveEmailTemplateId('');
    setTemplateEditorDraft(EMPTY_TEMPLATE_DRAFT);
    setTemplateEditorError('');
    setTemplateEditorSendResult(null);
  }

  async function handleSaveEmailTemplate() {
    if (!activeEmailTemplateId || templateEditorSaving) return;
    setTemplateEditorSaving(true);
    setTemplateEditorError('');
    try {
      const body = {
        enabled: templateEditorDraft.enabled,
        subject: templateEditorDraft.subject,
        preheader: templateEditorDraft.preheader,
        headerTitle: templateEditorDraft.headerTitle,
        bodyText: templateEditorDraft.bodyText,
        buttonLabel: templateEditorDraft.buttonLabel,
        footerText: templateEditorDraft.footerText,
        replyToEmail: templateEditorDraft.replyToEmail || null,
      };
      const res = await fetch(`/api/email-templates/${activeEmailTemplateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(parseApiJson);
      if (!res) throw new Error('Save failed');
      pushToast('Template saved.', 'success');
    } catch {
      setTemplateEditorError('Failed to save template.');
    } finally {
      setTemplateEditorSaving(false);
    }
  }

  async function handleResetEmailTemplate() {
    if (!activeEmailTemplateId || templateEditorSaving) return;
    setTemplateEditorSaving(true);
    setTemplateEditorError('');
    try {
      const res = await fetch(`/api/email-templates/${activeEmailTemplateId}/reset`, {
        method: 'POST',
      }).then(parseApiJson);
      const fields = res?.fields || {};
      setTemplateEditorDraft({
        enabled: fields.enabled ?? true,
        subject: fields.subject || '',
        preheader: fields.preheader || '',
        headerTitle: fields.headerTitle || '',
        bodyText: fields.bodyText || '',
        buttonLabel: fields.buttonLabel || '',
        footerText: fields.footerText || '',
        replyToEmail: fields.replyToEmail || '',
      });
      pushToast('Template reset to defaults.', 'success');
    } catch {
      setTemplateEditorError('Failed to reset template.');
    } finally {
      setTemplateEditorSaving(false);
    }
  }

  async function handleSendTestEmail() {
    if (!activeEmailTemplateId || !templateEditorSendTo.trim()) return;
    setTemplateEditorSendState('sending');
    setTemplateEditorSendResult(null);
    try {
      const res = await fetch(`/api/email-templates/${activeEmailTemplateId}/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: templateEditorSendTo.trim() }),
      }).then(parseApiJson);
      setTemplateEditorSendResult(res);
      setTemplateEditorSendState('done');
    } catch {
      setTemplateEditorSendState('error');
      setTemplateEditorSendResult({ sent: false, error: 'Request failed.' });
    }
  }

  async function handleCopyStripeWebhookEndpoint() {
    if (stripeActionsRestricted) {
      setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
      return;
    }
    if (typeof window === 'undefined') return;
    const endpoint = stripeWebhookEndpoint || `${window.location.origin}/api/webhooks/stripe`;
    await handleCopyCommand('stripe-webhook-endpoint', endpoint);
  }

  const handleShippingModeSaveStateChange = useCallback((state, context = {}) => {
    setShippingModeSavedState(state || 'saved');
    setShippingModeSaveError(context?.errorCopy || '');
    setShippingModeDirty(
      typeof context?.dirty === 'boolean' ? context.dirty : state === 'dirty' || state === 'error'
    );
  }, []);

  const handleRegisterShippingModeSaveAction = useCallback((action) => {
    const registration = resolveShippingSaveActionRegistration(action);
    shippingModeSaveActionRef.current = registration.saveAction;
    setShippingModeSaveActionReady(registration.saveActionReady);
  }, []);

  const activeSavedState = activeSection === 'shipping' ? shippingModeSavedState : savedState;
  const activeSavedErrorCopy =
    activeSection === 'shipping' ? shippingModeSaveError : activeSection === 'brand-kit' ? brandKitError : '';
  const activeSectionShippingConfigLoaded =
    activeSection === 'shipping'
      ? shippingConfigLoadedBySection.shipping
      : activeSection === 'taxes'
        ? shippingConfigLoadedBySection.taxes
        : true;

  const showHeaderSaveButton = activeSection === 'brand-kit' || activeSection === 'shipping';
  const activeTabLoading = isSettingsTabLoadingState({
    activeSection,
    loading,
    hasError: Boolean(error),
    brandKitLoading,
    brandKitLoaded,
    shippingConfigLoading,
    shippingConfigLoaded: activeSectionShippingConfigLoaded,
    providerStatusLoading,
    providerStatusLoaded,
    paymentActivityLoading,
    paymentActivityLoaded,
    emailActivityLoading,
    emailActivityLoaded,
    setupLoading,
    setupLoaded,
    deploymentLoading,
    deploymentLoaded,
    wizardLoading,
    wizardLoaded,
    sessionUser,
  });
  const shippingHeaderSaveState =
    activeSection === 'shipping'
      ? getShippingHeaderSaveButtonState({
          loading,
          hasError: Boolean(error),
          hasSaveAction: shippingModeSaveActionReady,
          shippingModeSavedState,
          shippingModeDirty,
        })
      : null;
  const brandHeaderSaveState =
    activeSection === 'brand-kit'
      ? {
          disabled: loading || Boolean(error) || activeTabLoading || brandKitLoading || savedState !== 'dirty',
          label: savedState === 'saving' ? 'Saving...' : savedState === 'dirty' ? 'Save changes' : 'Saved',
        }
      : null;
  const headerSaveButtonDisabled =
    loading ||
    Boolean(error) ||
    activeTabLoading ||
    (activeSection === 'brand-kit' && Boolean(brandHeaderSaveState?.disabled)) ||
    (activeSection === 'shipping' && Boolean(shippingHeaderSaveState?.disabled));
  const headerSaveButtonLabel =
    activeSection === 'shipping'
      ? shippingHeaderSaveState?.label || (shippingModeDirty ? 'Save changes' : 'Saved')
      : activeSection === 'brand-kit'
        ? brandHeaderSaveState?.label || 'Saved'
        : 'Saved';
  const headerSaveButtonOnClick =
    activeSection === 'brand-kit'
      ? handleBrandKitSave
      : activeSection === 'shipping'
        ? () => void invokeShippingSaveAction(shippingModeSaveActionRef.current)
        : undefined;

  async function refreshProviderStatuses(options = { includeRuntime: true }) {
    const includeRuntime = options?.includeRuntime !== false;
    setProviderStatusLoading(true);
    if (includeRuntime) {
      setStripeRuntimeLoading(true);
    }
    setProviderStatusError('');
    const runtimeRequest = includeRuntime
      ? fetch('/api/settings/payments/stripe/status', { cache: 'no-store' })
          .then(parseApiJson)
          .then((runtimePayload) => {
            setStripeRuntimeStatus(runtimePayload || null);
            setStripePublicRuntimeStatus(null);
            setStripePermissionRestrictedByApi(false);
            setStripeRuntimeLoaded(true);
          })
          .catch(async (runtimeError) => {
            if (isPermissionRestrictedError(runtimeError)) {
              setStripePermissionRestrictedByApi(true);
              setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
              setStripeRuntimeStatus(null);
              await loadStripePublicRuntimeStatus();
            } else {
              setProviderStatusError('Failed to refresh Stripe status.');
            }
          })
          .finally(() => {
            setStripeRuntimeLoading(false);
            setStripeRuntimeLoaded(true);
          })
      : Promise.resolve();

    try {
      const providerPayload = await fetch('/api/settings/providers', { cache: 'no-store' }).then(parseApiJson);
      const nextMap = {};
      for (const entry of providerPayload?.providers || []) {
        nextMap[entry.provider] = entry;
      }
      const stripeProviderSnapshot = providerPayload?.stripeProviderStatus || null;
      setProviderStatusMap(nextMap);
      setStripeRuntimeStatus((current) => current || buildStripeRuntimeStatusFromProviderSnapshot(stripeProviderSnapshot));
      setStripePermissionRestrictedByApi(false);
      setProviderStatusLoaded(true);
    } catch (refreshError) {
      if (isPermissionRestrictedError(refreshError)) {
        setStripePermissionRestrictedByApi(true);
        setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
        await loadStripePublicRuntimeStatus();
      } else {
        setProviderStatusError(
          refreshError instanceof Error ? refreshError.message : 'Failed to refresh provider statuses'
        );
      }
    } finally {
      setProviderStatusLoading(false);
    }

    await runtimeRequest;
  }

  async function refreshEmailStatus() {
    setEmailStatusLoading(true);
    setEmailStatusError('');
    try {
      const payload = await fetch('/api/settings/email/status', { cache: 'no-store' }).then(parseApiJson);
      setEmailStatus(payload || null);
      setEmailStatusLoaded(true);
    } catch (refreshError) {
      setEmailStatusError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh email setup status');
    } finally {
      setEmailStatusLoading(false);
    }
  }

  function patchProviderForm(provider, patch) {
    setProviderForms((current) => ({
      ...current,
      [provider]: {
        ...(current[provider] || {}),
        ...patch,
      },
    }));
  }

  function applyProviderStatus(provider, status) {
    if (!provider || !status) return;
    setProviderStatusMap((current) => ({
      ...current,
      [provider]: status,
    }));
    setProviderStatusLoaded(true);
  }

  function resetProviderForm(provider) {
    const nextDefaults = EMPTY_PROVIDER_FORMS[provider];
    if (!nextDefaults) return;
    setProviderForms((current) => ({
      ...current,
      [provider]: { ...nextDefaults },
    }));
    if (provider === 'STRIPE') {
      setStripeCredentialReplaceByField({ ...EMPTY_STRIPE_REPLACE_STATE });
    }
  }

  function startStripeCredentialReplace(field) {
    if (stripeActionsRestricted) {
      setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
      return;
    }
    setStripeCredentialReplaceByField((current) => ({
      ...current,
      [field]: true,
    }));
  }

  function cancelStripeCredentialReplace(field) {
    if (stripeActionsRestricted) return;
    setStripeCredentialReplaceByField((current) => ({
      ...current,
      [field]: false,
    }));

    if (field === 'publishableKey') {
      patchProviderForm('STRIPE', { publishableKey: '' });
      return;
    }

    if (field === 'secretKey') {
      patchProviderForm('STRIPE', { secretKey: '' });
      return;
    }

    patchProviderForm('STRIPE', { webhookSecret: '' });
  }

  async function handleSaveProviderCredentials(provider, payload) {
    if (provider === 'STRIPE' && stripeActionsRestricted) {
      setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
      return;
    }
    setProviderActionById((current) => ({ ...current, [provider]: 'saving' }));
    setProviderNotice('');
    setProviderStatusError('');
    try {
      const data = await fetch(`/api/settings/providers/${provider}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(parseApiJson);
      applyProviderStatus(data?.provider || provider, data?.status);
      if (provider === 'STRIPE') {
        await refreshProviderStatuses();
      }
      if (provider === 'RESEND' || provider === 'SMTP') {
        await refreshEmailStatus();
      }
      resetProviderForm(provider);
      setProviderNotice(
        provider === 'STRIPE'
          ? 'Credentials saved securely. Secret values are encrypted and hidden. Run "Verify now" to confirm DB-backed runtime connectivity.'
          : `${provider} credentials saved. Run verification to confirm connectivity.`
      );
    } catch (saveError) {
      if (provider === 'STRIPE' && isPermissionRestrictedError(saveError)) {
        setStripePermissionRestrictedByApi(true);
        setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
        await loadStripePublicRuntimeStatus();
      } else {
        setProviderStatusError(saveError instanceof Error ? saveError.message : 'Failed to save provider credentials');
      }
    } finally {
      setProviderActionById((current) => ({ ...current, [provider]: '' }));
    }
  }

  async function handleVerifyProvider(provider) {
    if (provider === 'STRIPE' && stripeActionsRestricted) {
      setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
      return;
    }
    setProviderActionById((current) => ({ ...current, [provider]: 'verifying' }));
    setProviderNotice('');
    setProviderStatusError('');
    try {
      const data = await fetch(`/api/settings/providers/${provider}/verify`, {
        method: 'POST',
      }).then(parseApiJson);
      applyProviderStatus(data?.provider || provider, data?.status);
      if (provider === 'STRIPE') {
        await refreshProviderStatuses();
      }
      if (provider === 'RESEND' || provider === 'SMTP') {
        await refreshEmailStatus();
      }
      if (data?.verification?.ok) {
        setProviderNotice(`${provider} verification succeeded.`);
      } else {
        setProviderStatusError(data?.verification?.message || `${provider} verification failed.`);
      }
    } catch (verifyError) {
      if (provider === 'STRIPE' && isPermissionRestrictedError(verifyError)) {
        setStripePermissionRestrictedByApi(true);
        setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
        await loadStripePublicRuntimeStatus();
      } else {
        setProviderStatusError(verifyError instanceof Error ? verifyError.message : 'Provider verification failed');
      }
    } finally {
      setProviderActionById((current) => ({ ...current, [provider]: '' }));
    }
  }

  async function handleDisconnectProvider(provider) {
    if (provider === 'STRIPE' && stripeActionsRestricted) {
      setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
      return;
    }
    setProviderActionById((current) => ({ ...current, [provider]: 'disconnecting' }));
    setProviderNotice('');
    setProviderStatusError('');
    try {
      const data = await fetch(`/api/settings/providers/${provider}`, {
        method: 'DELETE',
      }).then(parseApiJson);
      applyProviderStatus(data?.provider || provider, data?.status);
      if (provider === 'STRIPE') {
        await refreshProviderStatuses();
      }
      if (provider === 'RESEND' || provider === 'SMTP') {
        await refreshEmailStatus();
      }
      resetProviderForm(provider);
      setProviderNotice(`${provider} credentials disconnected.`);
    } catch (disconnectError) {
      if (provider === 'STRIPE' && isPermissionRestrictedError(disconnectError)) {
        setStripePermissionRestrictedByApi(true);
        setProviderStatusError(STRIPE_OWNER_PERMISSION_ERROR_COPY);
        await loadStripePublicRuntimeStatus();
      } else {
        setProviderStatusError(
          disconnectError instanceof Error ? disconnectError.message : 'Failed to disconnect provider credentials'
        );
      }
    } finally {
      setProviderActionById((current) => ({ ...current, [provider]: '' }));
    }
  }

  async function handleSendProviderTestEmail(provider) {
    const toEmail = String(providerTestEmailById[provider] || '').trim();
    if (!toEmail) {
      setProviderStatusError('Enter a test recipient email before sending.');
      return;
    }

    setProviderActionById((current) => ({ ...current, [provider]: 'testing' }));
    setProviderNotice('');
    setProviderStatusError('');
    try {
      const data = await fetch(`/api/settings/providers/${provider}/test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail,
          fromEmail: provider === 'RESEND' ? providerForms.RESEND.fromEmail || undefined : providerForms.SMTP.fromEmail || undefined,
        }),
      }).then(parseApiJson);
      setProviderNotice(`Test email sent via ${provider} to ${data?.result?.toEmail || toEmail}.`);
    } catch (testError) {
      setProviderStatusError(testError instanceof Error ? testError.message : 'Failed to send test email');
    } finally {
      setProviderActionById((current) => ({ ...current, [provider]: '' }));
    }
  }

  async function handleCreateZone() {
    try {
      setShippingConfigError('');
      const created = await fetch('/api/settings/shipping-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newZone.name,
          countryCode: newZone.countryCode,
          provinceCode: newZone.provinceCode || null,
          priority: parseNumberOrUndefined(newZone.priority),
          isActive: newZone.isActive,
        }),
      }).then(parseApiJson);

      setShippingZones((current) => [...current, toZoneForm(created)]);
      setNewZone(EMPTY_ZONE_FORM);
    } catch (createError) {
      setShippingConfigError(createError instanceof Error ? createError.message : 'Failed to create shipping zone');
    }
  }

  function updateZoneDraft(zoneId, patch) {
    setShippingZones((current) =>
      current.map((zone) =>
        zone.id === zoneId
          ? {
              ...zone,
              ...patch,
            }
          : zone
      )
    );
  }

  async function handleSaveZone(zone) {
    try {
      setShippingConfigError('');
      const updated = await fetch(`/api/settings/shipping-zones/${zone.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: zone.name,
          countryCode: zone.countryCode,
          provinceCode: zone.provinceCode || null,
          priority: parseNumberOrUndefined(zone.priority),
          isActive: zone.isActive,
        }),
      }).then(parseApiJson);

      setShippingZones((current) => current.map((entry) => (entry.id === zone.id ? toZoneForm(updated) : entry)));
    } catch (saveError) {
      setShippingConfigError(saveError instanceof Error ? saveError.message : 'Failed to save shipping zone');
    }
  }

  async function handleDeleteZone(zoneId) {
    try {
      setShippingConfigError('');
      await fetch(`/api/settings/shipping-zones/${zoneId}`, {
        method: 'DELETE',
      }).then(parseApiJson);
      setShippingZones((current) => current.filter((zone) => zone.id !== zoneId));
      setNewRateByZoneId((current) => {
        const next = { ...current };
        delete next[zoneId];
        return next;
      });
    } catch (deleteError) {
      setShippingConfigError(deleteError instanceof Error ? deleteError.message : 'Failed to delete shipping zone');
    }
  }

  function updateRateDraft(zoneId, rateId, patch) {
    setShippingZones((current) =>
      current.map((zone) =>
        zone.id === zoneId
          ? {
              ...zone,
              rates: zone.rates.map((rate) => (rate.id === rateId ? { ...rate, ...patch } : rate)),
            }
          : zone
      )
    );
  }

  async function handleSaveRate(zoneId, rate) {
    try {
      setShippingConfigError('');
      const updated = await fetch(`/api/settings/shipping-zones/${zoneId}/rates/${rate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: rate.name,
          method: rate.method,
          amount: parseNumberOrUndefined(rate.amount),
          minSubtotal: parseNumberOrNull(rate.minSubtotal),
          maxSubtotal: parseNumberOrNull(rate.maxSubtotal),
          priority: parseNumberOrUndefined(rate.priority),
          isActive: rate.isActive,
        }),
      }).then(parseApiJson);

      updateRateDraft(zoneId, rate.id, {
        name: updated.name,
        method: updated.method,
        amount: String(updated.amount ?? ''),
        minSubtotal: updated.minSubtotal == null ? '' : String(updated.minSubtotal),
        maxSubtotal: updated.maxSubtotal == null ? '' : String(updated.maxSubtotal),
        priority: String(updated.priority ?? 100),
        isActive: updated.isActive !== false,
      });
    } catch (saveError) {
      setShippingConfigError(saveError instanceof Error ? saveError.message : 'Failed to save shipping rate');
    }
  }

  async function handleDeleteRate(zoneId, rateId) {
    try {
      setShippingConfigError('');
      await fetch(`/api/settings/shipping-zones/${zoneId}/rates/${rateId}`, {
        method: 'DELETE',
      }).then(parseApiJson);

      setShippingZones((current) =>
        current.map((zone) =>
          zone.id === zoneId
            ? {
                ...zone,
                rates: zone.rates.filter((rate) => rate.id !== rateId),
              }
            : zone
        )
      );
    } catch (deleteError) {
      setShippingConfigError(deleteError instanceof Error ? deleteError.message : 'Failed to delete shipping rate');
    }
  }

  async function handleCreateRate(zoneId) {
    const draft = newRateByZoneId[zoneId] || EMPTY_RATE_FORM;

    try {
      setShippingConfigError('');
      const created = await fetch(`/api/settings/shipping-zones/${zoneId}/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          method: draft.method,
          amount: parseNumberOrUndefined(draft.amount),
          minSubtotal: parseNumberOrNull(draft.minSubtotal),
          maxSubtotal: parseNumberOrNull(draft.maxSubtotal),
          priority: parseNumberOrUndefined(draft.priority),
          isActive: draft.isActive,
        }),
      }).then(parseApiJson);

      setShippingZones((current) =>
        current.map((zone) =>
          zone.id === zoneId
            ? {
                ...zone,
                rates: [
                  ...zone.rates,
                  {
                    id: created.id,
                    name: created.name,
                    method: created.method,
                    amount: String(created.amount ?? ''),
                    minSubtotal: created.minSubtotal == null ? '' : String(created.minSubtotal),
                    maxSubtotal: created.maxSubtotal == null ? '' : String(created.maxSubtotal),
                    priority: String(created.priority ?? 100),
                    isActive: created.isActive !== false,
                  },
                ],
              }
            : zone
        )
      );

      setNewRateByZoneId((current) => ({
        ...current,
        [zoneId]: { ...EMPTY_RATE_FORM },
      }));
    } catch (createError) {
      setShippingConfigError(createError instanceof Error ? createError.message : 'Failed to create shipping rate');
    }
  }

  async function handleCreateTaxRule() {
    try {
      setShippingConfigError('');
      const created = await fetch('/api/settings/tax-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTaxRule.name,
          countryCode: newTaxRule.countryCode,
          provinceCode: newTaxRule.provinceCode || null,
          rate: (parseNumberOrUndefined(newTaxRule.ratePercent) ?? 0) / 100,
          priority: parseNumberOrUndefined(newTaxRule.priority),
          isActive: newTaxRule.isActive,
        }),
      }).then(parseApiJson);

      setTaxRules((current) => [...current, toTaxForm(created)]);
      setNewTaxRule(EMPTY_TAX_FORM);
    } catch (createError) {
      setShippingConfigError(createError instanceof Error ? createError.message : 'Failed to create tax rule');
    }
  }

  function updateTaxRuleDraft(ruleId, patch) {
    setTaxRules((current) => current.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  }

  async function handleSaveTaxRule(rule) {
    try {
      setShippingConfigError('');
      const updated = await fetch(`/api/settings/tax-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: rule.name,
          countryCode: rule.countryCode,
          provinceCode: rule.provinceCode || null,
          rate: (parseNumberOrUndefined(rule.ratePercent) ?? 0) / 100,
          priority: parseNumberOrUndefined(rule.priority),
          isActive: rule.isActive,
        }),
      }).then(parseApiJson);

      setTaxRules((current) => current.map((entry) => (entry.id === rule.id ? toTaxForm(updated) : entry)));
    } catch (saveError) {
      setShippingConfigError(saveError instanceof Error ? saveError.message : 'Failed to save tax rule');
    }
  }

  async function handleDeleteTaxRule(ruleId) {
    try {
      setShippingConfigError('');
      await fetch(`/api/settings/tax-rules/${ruleId}`, {
        method: 'DELETE',
      }).then(parseApiJson);
      setTaxRules((current) => current.filter((rule) => rule.id !== ruleId));
    } catch (deleteError) {
      setShippingConfigError(deleteError instanceof Error ? deleteError.message : 'Failed to delete tax rule');
    }
  }

  return (
    <AppShell
      onCreateOrder={() => {}}
      onNotificationsClick={() => {}}
      onQuickActionClick={() => {}}
      onSearchChange={() => {}}
      searchValue=""
    >
      <div className={styles.page}>
        <SettingsWorkspaceNav
          activeSection={activeSection}
          loading={loading}
          onSelectSection={setActiveSection}
          sections={SETTINGS_SECTIONS}
        />

        <div className={styles.detailPanel}>
          <div aria-busy={loading || shippingConfigLoading || setupLoading} className={`${styles.detailCard} glass-card refraction-edge admin-spotlight`}>
            <SettingsWorkspacePageHeader
              activeSavedErrorCopy={activeSavedErrorCopy}
              activeSavedState={activeSavedState}
              activeSection={activeSection}
              activeTitle={activeTitle}
              headerSaveButtonDisabled={headerSaveButtonDisabled}
              headerSaveButtonLabel={headerSaveButtonLabel}
              onHeaderSaveClick={headerSaveButtonOnClick}
              onRefreshSetupStatus={refreshSetupStatus}
              setupLoading={setupLoading}
              showHeaderSaveButton={showHeaderSaveButton}
            />

            <SettingsWorkspaceLoadState
              activeSection={activeSection}
              activeTabLoading={activeTabLoading}
              error={error}
              loading={loading}
            />

            {!activeTabLoading && !loading && !error && activeSection === 'general' ? (
              <GeneralSettingsPanel
                currencyOptions={GENERAL_SETTINGS_CURRENCY_OPTIONS}
                hasStoreAddress={hasStoreAddress}
                onNavigateSection={setActiveSection}
                onSettingsPatch={handleSettingsPatch}
                settings={settings}
                timezoneOptions={GENERAL_SETTINGS_TIMEZONE_OPTIONS}
              />
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'brand-kit' ? (
              <div className={styles.brandKitLayout}>
                <div className={styles.brandKitHeading}>
                  <h3>Brand assets</h3>
                  <p>
                    Theme customization is locked for private beta. Logos and support details are used across storefront, checkout, customer emails, and documents.
                    Email wording is edited in Settings -&gt; Email.
                  </p>
                </div>

                <>
                    <section className={styles.brandPreviewGrid}>
                      <AdminCard as="article" className={`${styles.compactSettingsCard} ${styles.brandPreviewCard}`} variant="card">
                        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                          <h4>Storefront preview</h4>
                        </div>
                        <div className={styles.brandPreviewFrame}>
                          <div className={styles.brandPreviewHeader} style={{ backgroundColor: storefrontPrimaryColor, color: storefrontTextColor }}>
                            <span className={styles.brandPreviewLabel}>{brandDisplayName}</span>
                            <span className={styles.methodChip}>Storefront</span>
                          </div>
                        </div>
                      </AdminCard>
                      <AdminCard as="article" className={`${styles.compactSettingsCard} ${styles.brandPreviewCard}`} variant="card">
                        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                          <h4>Checkout preview</h4>
                        </div>
                        <div className={styles.brandPreviewFrame}>
                          <div className={styles.brandPreviewHeader} style={{ backgroundColor: storefrontPrimaryColor, color: storefrontTextColor }}>
                            <span className={styles.brandPreviewLabel}>{checkoutPreviewLogo ? 'Checkout logo set' : brandDisplayName}</span>
                            <span className={styles.methodChip}>Checkout</span>
                          </div>
                        </div>
                      </AdminCard>
                      <AdminCard as="article" className={`${styles.compactSettingsCard} ${styles.brandPreviewCard}`} variant="card">
                        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                          <h4>Email preview</h4>
                        </div>
                        <div className={styles.brandPreviewFrame}>
                          <div className={styles.brandPreviewHeader} style={{ backgroundColor: emailHeaderColor, color: '#ffffff' }}>
                            <span className={styles.brandPreviewLabel}>{emailPreviewLogo ? 'Email logo set' : brandDisplayName}</span>
                            <span className={styles.methodChip}>Email</span>
                          </div>
                        </div>
                      </AdminCard>
                    </section>

                    <section className={styles.setupColumns}>
                      <AdminCard as="section" className={`${styles.setupColumnCard} ${styles.compactSettingsCard}`} variant="card">
                        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                          <h4>Global brand assets</h4>
                        </div>
                        <p className={styles.compactRowDescription}>Used for storefront logo, favicon, packing slips, and default email branding.</p>
                        <div className={styles.compactDrawerGrid}>
                          <p className={styles.compactMeta}>
                            <strong>Store logo:</strong> {brandKit.logoUrl ? 'Configured' : 'Not set'}
                          </p>
                          <p className={styles.compactMeta}>Used in Storefront, packing slips, default email branding.</p>
                          <p className={styles.compactMeta}>
                            <strong>Favicon:</strong> {brandKit.faviconUrl ? 'Configured' : 'Not set'}
                          </p>
                          <p className={styles.compactMeta}>Used in browser tabs and storefront metadata.</p>
                        </div>
                        <div className={styles.compactActionRow}>
                          <AdminButton onClick={() => openBrandDrawer(BRAND_DRAWER.GLOBAL_ASSETS)} size="sm" variant="secondary">
                            Manage
                          </AdminButton>
                        </div>
                      </AdminCard>

                    </section>

                    <section className={styles.setupColumns}>
                      <AdminCard as="section" className={`${styles.setupColumnCard} ${styles.compactSettingsCard}`} variant="card">
                        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                          <h4>Checkout branding</h4>
                        </div>
                        <p className={styles.compactRowDescription}>Controls checkout identity assets used in customer-facing surfaces.</p>
                        <div className={styles.compactDrawerGrid}>
                          <p className={styles.compactMeta}>
                            <strong>Checkout logo:</strong> {brandKit.checkoutLogoUrl ? 'Configured' : 'Not set'}
                          </p>
                          <p className={styles.compactMeta}>Used in checkout header.</p>
                        </div>
                        <div className={styles.compactActionRow}>
                          <AdminButton onClick={() => openBrandDrawer(BRAND_DRAWER.CHECKOUT_BRANDING)} size="sm" variant="secondary">
                            Edit
                          </AdminButton>
                        </div>
                      </AdminCard>

                      <AdminCard as="section" className={`${styles.setupColumnCard} ${styles.compactSettingsCard}`} variant="card">
                        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                          <h4>Email branding</h4>
                        </div>
                        <p className={styles.compactRowDescription}>Controls customer email logo/header/footer styling.</p>
                        <div className={styles.compactDrawerGrid}>
                          <p className={styles.compactMeta}>
                            <strong>Email logo:</strong> {brandKit.emailLogoUrl ? 'Configured' : 'Not set'}
                          </p>
                          <p className={styles.compactMeta}>Used in customer emails only.</p>
                        </div>
                        <p className={styles.compactMeta}>Want to change email wording? Manage customer email templates in Settings -&gt; Email.</p>
                        <div className={styles.compactActionRow}>
                          <AdminButton onClick={() => openBrandDrawer(BRAND_DRAWER.EMAIL_BRANDING)} size="sm" variant="secondary">
                            Edit
                          </AdminButton>
                          <AdminButton asChild size="sm" variant="ghost">
                            <Link href="/admin/settings?section=email">Open email templates</Link>
                          </AdminButton>
                        </div>
                      </AdminCard>
                    </section>

                    <section className={styles.setupColumns}>
                      <AdminCard as="section" className={`${styles.setupColumnCard} ${styles.compactSettingsCard}`} variant="card">
                        <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                          <h4>Social links</h4>
                        </div>
                        <p className={styles.compactRowDescription}>Social destinations for storefront and supported email footers.</p>
                        <div className={styles.compactDrawerGrid}>
                          <p className={styles.compactMeta}>
                            <strong>Configured links:</strong>{' '}
                            {[brandKit.instagramUrl, brandKit.facebookUrl, brandKit.tiktokUrl, brandKit.youtubeUrl].filter(Boolean).length}
                          </p>
                          <p className={styles.compactMeta}>Used in storefront footer and email footer where supported.</p>
                        </div>
                        <div className={styles.compactActionRow}>
                          <AdminButton onClick={() => openBrandDrawer(BRAND_DRAWER.SOCIAL_LINKS)} size="sm" variant="secondary">
                            Manage
                          </AdminButton>
                        </div>
                      </AdminCard>
                    </section>
                </>

                {brandKitNotice ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusText}>{brandKitNotice}</p>
                  </div>
                ) : null}
                {brandKitLoading && !brandKitLoaded ? <p className={styles.statusText}>Loading Brand & appearance...</p> : null}
                {brandKitLoadWarning ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusText}>Could not load saved brand settings.</p>
                    <div className={styles.compactActionRow}>
                      <AdminButton disabled={brandKitLoading} onClick={() => refreshBrandKit()} size="sm" variant="secondary">
                        {brandKitLoading ? 'Retrying...' : 'Retry'}
                      </AdminButton>
                    </div>
                  </div>
                ) : null}
                {brandKitError ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Brand & appearance error</p>
                    <p className={styles.statusText}>{brandKitError}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'shipping' ? (
              <ShippingSettingsWorkspace
                embedded
                onModeSaveStateChange={handleShippingModeSaveStateChange}
                onRegisterSaveAction={handleRegisterShippingModeSaveAction}
              />
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'taxes' ? (
              <div className={styles.configStack}>
                <section className={styles.configSection}>
                  <div className={styles.sectionHeading}>
                    <h3>Tax status</h3>
                  </div>
                  <AdminCard as="article" className={`${styles.compactSettingsCard} ${styles.taxSummaryCard}`} variant="card">
                    <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                      <h4>Tax collection</h4>
                      <AdminStatusChip tone={taxSettings.enabled ? 'success' : 'warning'}>
                        {taxSettings.enabled ? 'On' : 'Off'}
                      </AdminStatusChip>
                    </div>
                    <div className={styles.taxSummaryList}>
                      <p className={styles.taxSummaryRow}><strong>Status:</strong> {taxSettings.enabled ? 'On' : 'Off'}</p>
                      <p className={styles.taxSummaryRow}><strong>Strategy:</strong> Manual</p>
                      <p className={styles.taxSummaryRow}>
                        <strong>Manual tax rate:</strong> {(parseNumberOrUndefined(taxSettings.defaultTaxRatePercent) ?? 0).toFixed(2)}%
                      </p>
                      <p className={styles.taxSummaryRow}><strong>Tax shipping:</strong> {taxSettings.taxShipping ? 'Yes' : 'No'}</p>
                      <p className={styles.taxSummaryRow}><strong>Prices include tax:</strong> {taxSettings.pricesIncludeTax ? 'Yes' : 'No'}</p>
                    </div>
                    <p className={styles.compactMeta}>Configure how Doopify calculates tax at checkout.</p>
                    <div className={styles.compactActionRow}>
                      <AdminButton onClick={() => openTaxDrawer(TAX_DRAWER.COLLECTION)} size="sm" variant="secondary">
                        Manage
                      </AdminButton>
                    </div>
                  </AdminCard>
                </section>

                {shippingConfigLoading ? (
                  <p className={styles.statusText}>Loading tax regions and settings...</p>
                ) : null}

                {shippingConfigError ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Tax configuration error</p>
                    <p className={styles.statusText}>{shippingConfigError}</p>
                    <AdminButton onClick={() => refreshShippingConfig()} size="sm" variant="secondary">
                      Retry
                    </AdminButton>
                  </div>
                ) : null}

                <section className={styles.configSection}>
                  <div className={styles.sectionHeading}>
                    <h3>Tax regions</h3>
                  </div>
                  <AdminCard as="article" className={`${styles.compactSettingsCard} ${styles.taxSummaryCard}`} variant="card">
                    <p className={styles.compactMeta}>
                      Tax regions override the default manual rate for matching destinations.
                    </p>
                    <div className={styles.taxRegionList}>
                      {taxRegionSummaryRows.map((row) => (
                        <div className={styles.taxRegionRow} key={row.id}>
                          <div>
                            <p className={styles.taxRegionTitle}>{row.region}</p>
                            <p className={styles.compactMeta}>
                              <strong>Rate:</strong> {row.rateLabel}
                            </p>
                            <p className={styles.compactMeta}>
                              <strong>Status:</strong> {row.activeLabel}
                            </p>
                            <p className={styles.compactMeta}>
                              <strong>Source:</strong> {row.source}
                            </p>
                          </div>
                          <AdminButton onClick={() => openTaxDrawer(TAX_DRAWER.REGIONS)} size="sm" variant="secondary">
                            Manage
                          </AdminButton>
                        </div>
                      ))}
                    </div>
                  </AdminCard>
                </section>

                <section className={styles.configSection}>
                  <div className={styles.sectionHeading}>
                    <h3>International duties & import taxes</h3>
                  </div>
                  <AdminCard as="article" className={`${styles.compactSettingsCard} ${styles.taxSummaryCard}`} variant="card">
                    <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                      <h4>Coming later</h4>
                      <AdminStatusChip tone="warning">Private beta</AdminStatusChip>
                    </div>
                    <p className={styles.compactMeta}>
                      International customs support is coming later.
                    </p>
                  </AdminCard>
                </section>

                <section className={styles.configSection}>
                  <div className={styles.sectionHeading}>
                    <h3>Tax preview</h3>
                  </div>
                  <p className={styles.compactMeta}>
                    Estimate checkout tax using your current manual tax settings.
                  </p>

                  <div className={styles.inlineGrid}>
                    <label className={styles.field}>
                      <span>Subtotal (USD)</span>
                      <AdminInput
                        className={styles.input}
                        onChange={(event) =>
                          setShippingTaxPreview((current) => ({ ...current, subtotal: event.target.value }))
                        }
                        value={shippingTaxPreview.subtotal}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Shipping amount (USD)</span>
                      <AdminInput
                        className={styles.input}
                        disabled={!taxSettings.taxShipping}
                        onChange={(event) =>
                          setShippingTaxPreview((current) => ({ ...current, shippingAmount: event.target.value }))
                        }
                        placeholder={taxSettings.taxShipping ? '0.00' : 'Tax shipping disabled'}
                        value={shippingTaxPreview.shippingAmount}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Destination country</span>
                      <AdminInput
                        className={styles.input}
                        onChange={(event) =>
                          setShippingTaxPreview((current) => ({ ...current, country: event.target.value }))
                        }
                        value={shippingTaxPreview.country}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Destination state/province</span>
                      <AdminInput
                        className={styles.input}
                        onChange={(event) =>
                          setShippingTaxPreview((current) => ({ ...current, province: event.target.value }))
                        }
                        value={shippingTaxPreview.province}
                      />
                    </label>
                  </div>

                  <div className={styles.compactActionRow}>
                    <AdminButton disabled={taxPreviewCalculating} onClick={handleCalculateTaxPreview} size="sm" variant="secondary">
                      {taxPreviewCalculating ? 'Calculating preview...' : 'Calculate preview'}
                    </AdminButton>
                  </div>

                  {taxPreviewError ? (
                    <div className={styles.statusBlock}>
                      <p className={styles.statusTitle}>Preview error</p>
                      <p className={styles.statusText}>{taxPreviewError}</p>
                    </div>
                  ) : null}

                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Preview result</p>
                    <p className={styles.statusText}><strong>Estimated tax:</strong> {formatTaxPreviewCurrency(taxPreviewResult.estimatedTax)}</p>
                    <p className={styles.statusText}><strong>Total with tax:</strong> {formatTaxPreviewCurrency(taxPreviewResult.totalWithTax)}</p>
                    <p className={styles.statusText}><strong>Rule/source:</strong> {taxPreviewResult.sourceUsed || 'Not calculated yet'}</p>
                    <p className={styles.statusText}>{taxPreviewResult.note || 'Run a preview to see the matching tax source.'}</p>
                  </div>
                </section>
              </div>
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'payments' ? (
              <div className={styles.configStack}>
                <section className={styles.configSection}>
                  <div className={styles.sectionHeading}>
                    <h3>Payments</h3>
                    <p className={styles.cardSubtext}>
                      Manage processors, checkout methods, and payment visibility. For pilot launch: save Stripe credentials, run Verify now, confirm webhook endpoint readiness, then run a checkout smoke test.
                    </p>
                  </div>
                </section>
                {providerStatusErrorDisplay ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Provider action error</p>
                    <p className={styles.statusText}>{providerStatusErrorDisplay}</p>
                  </div>
                ) : null}
                {emailStatusError ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Email status error</p>
                    <p className={styles.statusText}>{emailStatusError}</p>
                  </div>
                ) : null}
                {providerNotice ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Provider update</p>
                    <p className={styles.statusText}>{providerNotice}</p>
                  </div>
                ) : null}
                <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
                  <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                    <h4>Payment providers</h4>
                    <AdminTooltip content="Provider credentials are managed in drawers to keep this page compact and secret-safe." />
                  </div>
                  <p className={styles.cardSubtext}>Connect gateways and check runtime status by provider. Stripe should be green before first paid pilot checkout.</p>
                  {showPaymentsProviderRowsSkeleton ? (
                    <SettingsProviderRowsSkeleton rows={3} />
                  ) : (
                    <div className={styles.providerList}>
                      {paymentProviderRows.map((providerRow) => {
                        return (
                          <article className={`${styles.providerRow} ${styles.compactProviderRow}`} key={providerRow.id}>
                            <div className={`${styles.providerIcon} ${styles[providerRow.iconClassName] || ''}`}>{providerRow.iconText}</div>
                            <div className={`${styles.providerMain} ${styles.compactRowMain}`}>
                              <div className={styles.providerTitleLine}>
                                <h4 className={styles.compactRowTitle}>{providerRow.name}</h4>
                                {providerRow.status ? (
                                  <AdminStatusChip tone={providerRow.status.tone}>{providerRow.status.label}</AdminStatusChip>
                                ) : providerRow.statusLoading ? (
                                  <span
                                    aria-label="Loading saved Stripe status"
                                    className={styles.statusChipSpinner}
                                    role="status"
                                    title="Loading saved Stripe status"
                                  />
                                ) : null}
                              </div>
                              <p className={styles.compactRowDescription}>{providerRow.description}</p>
                              <p className={styles.compactMeta}>{providerRow.sourceMeta}</p>
                              <p className={styles.compactMeta}>{providerRow.statusMeta}</p>
                              {providerRow.lastCheckedMeta ? <p className={styles.compactMeta}>{providerRow.lastCheckedMeta}</p> : null}
                              <div className={`${styles.methodChipRow} ${styles.compactChipRow}`}>
                                {providerRow.chips.map((chip) => (
                                  <span className={styles.methodChip} key={`${providerRow.id}-${chip}`}>
                                    {chip}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className={`${styles.providerActions} ${styles.compactActionRow}`}>
                              {providerRow.id === PAYMENT_PROVIDER_DRAWER.STRIPE ? (
                                <AdminButton
                                  aria-label="Verify Stripe now"
                                  disabled={stripeActionsRestricted || providerActionById.STRIPE === 'verifying'}
                                  onClick={() => handleVerifyProvider('STRIPE')}
                                  size="sm"
                                  variant="ghost"
                                >
                                  {providerActionById.STRIPE === 'verifying' ? 'Verifying...' : 'Verify now'}
                                </AdminButton>
                              ) : null}
                              <AdminButton
                                aria-label={`Manage ${providerRow.name}`}
                                onClick={() => openPaymentDrawer(providerRow.id)}
                                size="sm"
                                variant="secondary"
                              >
                                Manage
                              </AdminButton>
                              <AdminButton aria-label={`More ${providerRow.name} actions`} size="sm" variant="icon">
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  more_horiz
                                </span>
                              </AdminButton>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </AdminCard>

                <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
                  <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                    <h4>Customer checkout methods</h4>
                    <AdminTooltip content="Method labels are derived from real runtime status and never claim unsupported behavior." />
                  </div>
                  <p className={styles.cardSubtext}>These are the payment options customers can see during checkout.</p>
                  <div className={styles.checkoutMethodGrid}>
                    {checkoutMethodStatuses.map((entry) => (
                      <article className={styles.checkoutMethodCard} key={entry.id}>
                        <div className={styles.providerTitleLine}>
                          <h4 className={styles.compactRowTitle}>{entry.title}</h4>
                          <AdminStatusChip tone={entry.statusTone}>{entry.statusLabel}</AdminStatusChip>
                        </div>
                        <p className={styles.compactRowDescription}>{entry.detail}</p>
                      </article>
                    ))}
                  </div>
                </AdminCard>

                <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
                  <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                    <h4>Payment activity</h4>
                    <AdminTooltip content="Rows currently come from order payment records. Refund timeline enrichment will follow with a dedicated activity API." />
                  </div>
                  <p className={styles.cardSubtext}>
                    Track payment outcomes and provider references. This does not represent payout reconciliation.
                  </p>
                  {paymentActivityError ? <p className={styles.statusText}>{paymentActivityError}</p> : null}
                  {paymentActivityRows.length ? (
                    <AdminTable columns={paymentActivityColumns} isLoading={paymentActivityLoading} rows={paymentActivityRows} />
                  ) : paymentActivityLoading ? (
                    <AdminTable columns={paymentActivityColumns} isLoading rows={[]} />
                  ) : (
                    <AdminEmptyState
                      description="No payment records are available yet. Activity appears after checkout payments are created."
                      icon="payments"
                      title="No payment activity yet"
                    />
                  )}
                </AdminCard>
              </div>
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'email' ? (
              <div className={styles.configStack}>
                <section className={styles.configSection}>
                  <div className={styles.sectionHeading}>
                    <h3>Customer email system</h3>
                    <p className={styles.cardSubtext}>
                      Keep email setup compact: provider connection, sender identity, branding, templates, and delivery activity.
                    </p>
                  </div>
                </section>
                {providerStatusErrorDisplay ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Provider action error</p>
                    <p className={styles.statusText}>{providerStatusErrorDisplay}</p>
                  </div>
                ) : null}
                {providerNotice ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Provider update</p>
                    <p className={styles.statusText}>{providerNotice}</p>
                  </div>
                ) : null}

                <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
                  <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                    <h4>Setup checklist</h4>
                  </div>
                  <div className={styles.checkoutMethodGrid}>
                    <article className={styles.checkoutMethodCard}>
                      <div className={styles.providerTitleLine}>
                        <h4 className={styles.compactRowTitle}>Provider connected</h4>
                        <AdminStatusChip tone={emailProviderSetupStatus.tone}>{emailProviderSetupStatus.label}</AdminStatusChip>
                      </div>
                      <p className={styles.compactRowDescription}>{emailProviderSetupStatus.detail}</p>
                      {emailStatus?.lastVerifiedAt ? (
                        <p className={styles.compactMeta}>
                          Last verified: {formatDateTime(emailStatus.lastVerifiedAt, settings.timezone)}
                        </p>
                      ) : null}
                      {emailStatus?.lastError ? (
                        <p className={styles.compactMeta}>Last error: {emailStatus.lastError}</p>
                      ) : null}
                      {activeEmailProvider ? (
                        <div className={styles.compactActionRow}>
                          <AdminButton
                            disabled={providerActionById[activeEmailProvider] === 'verifying'}
                            onClick={() => handleVerifyProvider(activeEmailProvider)}
                            size="sm"
                            variant="secondary"
                          >
                            {providerActionById[activeEmailProvider] === 'verifying' ? 'Verifying...' : 'Verify email setup'}
                          </AdminButton>
                        </div>
                      ) : null}
                    </article>
                    <article className={styles.checkoutMethodCard}>
                      <div className={styles.providerTitleLine}>
                        <h4 className={styles.compactRowTitle}>Sender identity</h4>
                        <AdminStatusChip tone={senderConfigured ? 'success' : 'warning'}>
                          {senderConfigured ? 'Configured' : 'Setup needed'}
                        </AdminStatusChip>
                      </div>
                      <p className={styles.compactRowDescription}>
                        {senderConfigured ? `Using ${settings.senderEmail}` : 'Add a sender email so customer messages use your store identity.'}
                      </p>
                    </article>
                    <article className={styles.checkoutMethodCard}>
                      <div className={styles.providerTitleLine}>
                        <h4 className={styles.compactRowTitle}>Job health</h4>
                        <AdminStatusChip tone={emailJobHealthPresentation.tone}>{emailJobHealthPresentation.label}</AdminStatusChip>
                      </div>
                      <p className={styles.compactRowDescription}>{emailJobHealthPresentation.detail}</p>
                      {emailJobHealthPresentation.showLogsAction ? (
                        <div className={styles.compactActionRow}>
                          <AdminButton asChild size="sm" variant="ghost">
                            <Link href="/admin/webhooks">Open delivery logs</Link>
                          </AdminButton>
                        </div>
                      ) : null}
                    </article>
                  </div>
                </AdminCard>

                <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
                  <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                    <h4>Email providers</h4>
                    <AdminTooltip content="Credentials and secret fields are managed inside the provider drawer." />
                  </div>
                  <p className={styles.cardSubtext}>Choose a provider and manage credentials without exposing secret inputs on this page.</p>
                  <div className={styles.providerList}>
                    {emailProviderRows.map((providerRow) => (
                      <article className={`${styles.providerRow} ${styles.compactProviderRow}`} key={providerRow.id}>
                        <div className={`${styles.providerIcon} ${styles[providerRow.iconClassName]}`}>{providerRow.iconText}</div>
                        <div className={`${styles.providerMain} ${styles.compactRowMain}`}>
                          <div className={styles.providerTitleLine}>
                            <h4 className={styles.compactRowTitle}>{providerRow.name}</h4>
                            <AdminStatusChip tone={providerRow.status.tone}>{providerRow.status.label}</AdminStatusChip>
                            {providerRow.badges.map((badge) => (
                              <AdminStatusChip key={`${providerRow.id}-${badge.label}`} tone={badge.tone}>
                                {badge.label}
                              </AdminStatusChip>
                            ))}
                          </div>
                          <p className={styles.compactRowDescription}>{providerRow.description}</p>
                          <p className={styles.compactMeta}>
                            <strong>Active source:</strong> {providerRow.status.sourceLabel || 'Not active'}
                          </p>
                          <p className={styles.compactMeta}>
                            <strong>Last verified:</strong> {formatDateTime(providerRow.status.lastVerifiedAt, settings.timezone)}
                          </p>
                          <div className={`${styles.methodChipRow} ${styles.compactChipRow}`}>
                            {providerRow.chips.map((chip) => (
                              <span className={styles.methodChip} key={`${providerRow.id}-${chip}`}>
                                {chip}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className={styles.providerActions}>
                          {providerRow.id === EMAIL_PROVIDER_DRAWER.RESEND || providerRow.id === EMAIL_PROVIDER_DRAWER.SMTP ? (
                            <AdminButton
                              disabled={providerActionById[providerRow.id] === 'verifying'}
                              onClick={() => handleVerifyProvider(providerRow.id)}
                              size="sm"
                              variant="ghost"
                            >
                              {providerActionById[providerRow.id] === 'verifying' ? 'Verifying...' : 'Verify email setup'}
                            </AdminButton>
                          ) : null}
                          <AdminButton onClick={() => openEmailDrawer(providerRow.id)} size="sm" variant="secondary">
                            Manage
                          </AdminButton>
                        </div>
                      </article>
                    ))}
                  </div>
                </AdminCard>

                <section className={styles.setupColumns}>
                  <AdminCard as="section" className={`${styles.setupColumnCard} ${styles.compactSettingsCard}`} variant="card">
                    <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                      <h4>Sender identity</h4>
                    </div>
                    <p className={styles.statusText}>Use verified sender details before enabling customer templates at scale.</p>
                    <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                      <label className={styles.field}>
                        <span>From email</span>
                        <AdminInput
                          className={styles.input}
                          onChange={(event) => handleSettingsPatch({ senderEmail: event.target.value })}
                          placeholder="store@example.com"
                          value={settings.senderEmail || ''}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Support email</span>
                        <AdminInput
                          className={styles.input}
                          onChange={(event) => handleSettingsPatch({ supportEmail: event.target.value })}
                          placeholder="support@example.com"
                          value={settings.supportEmail || ''}
                        />
                      </label>
                    </div>
                  </AdminCard>

                  <AdminCard as="section" className={`${styles.setupColumnCard} ${styles.compactSettingsCard}`} variant="card">
                    <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                      <h4>Email branding</h4>
                    </div>
                    <p className={styles.compactRowDescription}>Email colors and logo come from Brand & appearance.</p>
                    <div className={styles.compactActionRow}>
                      <AdminButton onClick={() => setActiveSection('brand-kit')} size="sm" variant="secondary">
                        Open Brand & appearance
                      </AdminButton>
                      <AdminButton asChild size="sm" variant="ghost">
                        <Link href="/admin/settings?section=email">Open email templates</Link>
                      </AdminButton>
                    </div>
                  </AdminCard>
                </section>

                <section className={styles.setupColumns}>
                  <AdminCard as="section" className={`${styles.setupColumnCard} ${styles.compactSettingsCard}`} variant="card">
                    <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                      <h4>Customer email templates</h4>
                    </div>
                    <div className={styles.rateList}>
                      {EMAIL_TEMPLATE_SUMMARY.map((template) => (
                        <div className={styles.rateRow} key={template.id}>
                          <div className={styles.providerTitleLine}>
                            <h4>{template.label}</h4>
                            <AdminStatusChip tone={template.statusTone}>{template.statusLabel}</AdminStatusChip>
                          </div>
                          <p className={styles.compactMeta}>
                            <strong>Trigger:</strong> {template.triggerLabel}
                          </p>
                          <div className={styles.compactActionRow}>
                            {template.editable ? (
                              <AdminButton onClick={() => openEmailTemplateDrawer(template.id)} size="sm" variant="secondary">
                                Manage
                              </AdminButton>
                            ) : (
                              <AdminButton disabled size="sm" variant="ghost">
                                Coming soon
                              </AdminButton>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AdminCard>

                  <AdminCard as="section" className={`${styles.setupColumnCard} ${styles.compactSettingsCard}`} variant="card">
                    <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                      <h4>Recent email activity</h4>
                    </div>
                    <p className={styles.cardSubtext}>Track customer email delivery outcomes here. Use Delivery logs for deeper observability and retries.</p>
                    <div className={styles.actionRow}>
                      <AdminButton asChild size="sm" variant="ghost">
                        <Link href="/admin/webhooks">Open Delivery logs</Link>
                      </AdminButton>
                    </div>
                    {emailActivityError ? <p className={styles.statusText}>{emailActivityError}</p> : null}
                    {emailActivityRows.length ? (
                      <AdminTable columns={emailActivityColumns} isLoading={emailActivityLoading} rows={emailActivityRows} />
                    ) : emailActivityLoading ? (
                      <AdminTable columns={emailActivityColumns} isLoading rows={[]} />
                    ) : (
                      <AdminEmptyState
                        description="No email deliveries have been recorded yet."
                        icon="mail"
                        title="No email activity yet"
                      />
                    )}
                  </AdminCard>
                </section>
              </div>
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'email-legacy' ? (
              <div className={styles.configStack}>
                <section className={styles.configSection}>
                  <div className={styles.sectionHeading}>
                    <h3>Email provider setup</h3>
                    <p className={styles.cardSubtext}>Configure transactional email providers and webhook verification. Provider setup now lives here.</p>
                  </div>
                </section>
                {providerStatusErrorDisplay ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Provider action error</p>
                    <p className={styles.statusText}>{providerStatusErrorDisplay}</p>
                  </div>
                ) : null}
                {providerNotice ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Provider update</p>
                    <p className={styles.statusText}>{providerNotice}</p>
                  </div>
                ) : null}

                <section className={styles.setupGrid}>
                  <AdminCard as="article" className={styles.setupCard} variant="card">
                    <div className={styles.setupCardHeader}>
                      <h4>
                        SMTP{' '}
                        <AdminTooltip content="SMTP uses host/port/auth credentials from your mail provider. Secrets should be encrypted at rest when saved." />
                      </h4>
                      <AdminStatusChip tone={smtpSetupStatus.tone}>{smtpSetupStatus.label}</AdminStatusChip>
                    </div>
                    <p className={styles.statusText}>{smtpSetupStatus.detail}</p>
                    <p className={styles.statusText}>
                      <strong>Active source:</strong> {smtpSetupStatus.sourceLabel || 'Not active'}
                      {smtpSetupStatus.lastVerifiedAt
                        ? ` • Last verified ${formatDateTimeForDisplay(smtpSetupStatus.lastVerifiedAt, {
                            timeZone: settings.timezone,
                            fallbackText: 'Not verified yet',
                          })}`
                        : ''}
                    </p>
                    <div className={styles.inlineGrid}>
                      <label className={styles.field}>
                        <span>Host</span>
                        <AdminInput className={styles.input} onChange={(event) => patchProviderForm('SMTP', { host: event.target.value })} value={providerForms.SMTP.host} />
                      </label>
                      <label className={styles.field}>
                        <span>Port</span>
                        <AdminInput className={styles.input} onChange={(event) => patchProviderForm('SMTP', { port: event.target.value })} value={providerForms.SMTP.port} />
                      </label>
                      <label className={styles.field}>
                        <span>Username</span>
                        <AdminInput className={styles.input} onChange={(event) => patchProviderForm('SMTP', { username: event.target.value })} value={providerForms.SMTP.username} />
                      </label>
                      <label className={styles.field}>
                        <span>Password</span>
                        <AdminInput className={styles.input} onChange={(event) => patchProviderForm('SMTP', { password: event.target.value })} type="password" value={providerForms.SMTP.password} />
                      </label>
                      <label className={styles.checkboxField}>
                        <AdminInput
                          checked={Boolean(providerForms.SMTP.secure)}
                          onChange={(event) => patchProviderForm('SMTP', { secure: event.target.checked })}
                          className={styles.settingsCheckbox} type="checkbox"
                        />
                        <span>Secure/TLS connection</span>
                      </label>
                      <label className={styles.field}>
                        <span>From email (optional)</span>
                        <AdminInput className={styles.input} onChange={(event) => patchProviderForm('SMTP', { fromEmail: event.target.value })} value={providerForms.SMTP.fromEmail} />
                      </label>
                    </div>
                    <div className={styles.actionRow}>
                      <AdminButton
                        disabled={
                          providerActionById.SMTP === 'saving' ||
                          !providerForms.SMTP.host.trim() ||
                          !providerForms.SMTP.port.trim() ||
                          !providerForms.SMTP.username.trim() ||
                          !providerForms.SMTP.password.trim()
                        }
                        onClick={() =>
                          handleSaveProviderCredentials('SMTP', {
                            host: providerForms.SMTP.host,
                            port: Number(providerForms.SMTP.port),
                            secure: Boolean(providerForms.SMTP.secure),
                            username: providerForms.SMTP.username,
                            password: providerForms.SMTP.password,
                            fromEmail: providerForms.SMTP.fromEmail || undefined,
                          })
                        }
                        size="sm"
                        variant="secondary"
                      >
                        {providerActionById.SMTP === 'saving' ? 'Saving...' : 'Connect SMTP'}
                      </AdminButton>
                      <AdminButton
                        disabled={providerActionById.SMTP === 'verifying'}
                        onClick={() => handleVerifyProvider('SMTP')}
                        size="sm"
                        variant="secondary"
                      >
                        {providerActionById.SMTP === 'verifying' ? 'Verifying...' : 'Verify provider'}
                      </AdminButton>
                      <AdminButton
                        disabled={providerActionById.SMTP === 'disconnecting'}
                        onClick={() => handleDisconnectProvider('SMTP')}
                        size="sm"
                        variant="ghost"
                      >
                        {providerActionById.SMTP === 'disconnecting' ? 'Disconnecting...' : 'Disconnect'}
                      </AdminButton>
                    </div>
                  </AdminCard>

                  <AdminCard as="article" className={styles.setupCard} variant="card">
                    <div className={styles.setupCardHeader}>
                      <h4>
                        Resend{' '}
                        <AdminTooltip content="Resend can send transactional email. Add webhook signing secret for bounce/complaint verification." />
                      </h4>
                      <AdminStatusChip tone={resendSetupStatus.tone}>{resendSetupStatus.label}</AdminStatusChip>
                    </div>
                    <p className={styles.statusText}>{resendSetupStatus.detail}</p>
                    <p className={styles.statusText}>
                      <strong>Active source:</strong> {resendSetupStatus.sourceLabel || 'Not active'}
                      {resendSetupStatus.lastVerifiedAt
                        ? ` • Last verified ${formatDateTimeForDisplay(resendSetupStatus.lastVerifiedAt, {
                            timeZone: settings.timezone,
                            fallbackText: 'Not verified yet',
                          })}`
                        : ''}
                    </p>
                    <div className={styles.inlineGrid}>
                      <label className={styles.field}>
                        <span>Resend API key</span>
                        <AdminInput
                          className={styles.input}
                          onChange={(event) => patchProviderForm('RESEND', { apiKey: event.target.value })}
                          placeholder="re_..."
                          type="password"
                          value={providerForms.RESEND.apiKey}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Webhook secret (optional)</span>
                        <AdminInput
                          className={styles.input}
                          onChange={(event) => patchProviderForm('RESEND', { webhookSecret: event.target.value })}
                          placeholder="whsec_..."
                          type="password"
                          value={providerForms.RESEND.webhookSecret}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>From email (optional)</span>
                        <AdminInput
                          className={styles.input}
                          onChange={(event) => patchProviderForm('RESEND', { fromEmail: event.target.value })}
                          placeholder="store@example.com"
                          value={providerForms.RESEND.fromEmail}
                        />
                      </label>
                    </div>
                    <div className={styles.actionRow}>
                      <AdminButton
                        disabled={providerActionById.RESEND === 'saving' || !providerForms.RESEND.apiKey.trim()}
                        onClick={() =>
                          handleSaveProviderCredentials('RESEND', {
                            apiKey: providerForms.RESEND.apiKey,
                            webhookSecret: providerForms.RESEND.webhookSecret || undefined,
                            fromEmail: providerForms.RESEND.fromEmail || undefined,
                          })
                        }
                        size="sm"
                        variant="secondary"
                      >
                        {providerActionById.RESEND === 'saving' ? 'Saving...' : 'Connect Resend'}
                      </AdminButton>
                      <AdminButton
                        disabled={providerActionById.RESEND === 'verifying'}
                        onClick={() => handleVerifyProvider('RESEND')}
                        size="sm"
                        variant="secondary"
                      >
                        {providerActionById.RESEND === 'verifying' ? 'Verifying...' : 'Verify provider'}
                      </AdminButton>
                      <AdminButton
                        disabled={providerActionById.RESEND === 'disconnecting'}
                        onClick={() => handleDisconnectProvider('RESEND')}
                        size="sm"
                        variant="ghost"
                      >
                        {providerActionById.RESEND === 'disconnecting' ? 'Disconnecting...' : 'Disconnect'}
                      </AdminButton>
                    </div>
                    <p className={styles.setupFixText}>Do not treat this as live-ready unless runtime provider configuration and webhook verification are both complete.</p>
                  </AdminCard>

                  <AdminCard as="article" className={styles.setupCard} variant="card">
                    <div className={styles.setupCardHeader}>
                      <h4>
                        SendLayer{' '}
                        <AdminTooltip content="SendLayer support can be added as another provider option once runtime adapter support is ready." />
                      </h4>
                      <AdminStatusChip tone="neutral">Coming soon</AdminStatusChip>
                    </div>
                    <p className={styles.statusText}>SendLayer onboarding is not active yet.</p>
                    <div className={styles.actionRow}>
                      <AdminButton disabled size="sm" variant="secondary">Set up SendLayer</AdminButton>
                    </div>
                  </AdminCard>
                </section>

                <AdminCard className={styles.brandRow} spotlight variant="inset">
                  <div className={styles.rowMeta}>
                    <h4>
                      Sender profile{' '}
                      <AdminTooltip content="This sender address is used by transactional templates. Keep it aligned with your domain authentication setup." />
                    </h4>
                    <p>Keep sender identity aligned with store branding while observability handles retries and provider health.</p>
                  </div>
                  <div className={styles.rowInputs}>
                    <label className={styles.field}>
                      <span>Sender email</span>
                      <AdminInput className={styles.input} onChange={(event) => handleSettingsPatch({ senderEmail: event.target.value })} value={settings.senderEmail} />
                    </label>
                  </div>
                </AdminCard>
                <AdminLiveStatus label="Email observability live" />
              </div>
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'webhooks' ? (
              <div className={styles.configStack}>
                <AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">
                  <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                    <h4>Outbound webhooks</h4>
                    <AdminTooltip content="Settings -> Webhooks is for outbound endpoint setup. Monitoring and retries live in Delivery logs." />
                  </div>
                  <p className={styles.cardSubtext}>
                    Send store updates to another app using a destination URL from that app.
                  </p>
                </AdminCard>
                <div className={styles.compactInfoStrip}>
                  <p className={styles.compactInfoStripTitle}>Looking to monitor deliveries?</p>
                  <p>
                    Use System -&gt; Delivery logs to inspect failures, retries, and provider responses.
                  </p>
                </div>
                <IntegrationsPanel />
              </div>
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'account' ? (
              <AccountSettingsPanel currentUser={sessionUser} />
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'team' ? (
              <TeamSettingsPanel currentUserRole={sessionUser?.role} currentUserId={sessionUser?.id} />
            ) : null}

            {!activeTabLoading && !loading && !error && activeSection === 'setup' ? (
              <div className={styles.setupPanel}>
                <AdminCard className={styles.setupSummaryCard} variant="card">
                  <h4>Launch setup</h4>
                  <p className={styles.statusText}>
                    Review the setup items that matter before sending customers to your store.
                  </p>
                </AdminCard>

                <SetupFirstRunGuidePanel
                  isOpen={setupSectionExpanded.firstRunGuide}
                  onRefreshWizard={refreshWizard}
                  onToggleOpen={(isOpen) => {
                    setSetupSectionExpanded((current) => ({
                      ...current,
                      firstRunGuide: isOpen,
                    }));
                  }}
                  showWizardError={showWizardError}
                  showWizardLoading={showWizardLoading}
                  showWizardSteps={showWizardSteps}
                  wizardError={wizardError}
                  wizardLoading={wizardLoading}
                  wizardSteps={wizardSteps}
                />

                <details
                  className={styles.setupCollapsibleSection}
                  onToggle={(event) => {
                    const isOpen = event.currentTarget.open;
                    setSetupSectionExpanded((current) => ({
                      ...current,
                      deploymentValidation: isOpen,
                    }));
                  }}
                >
                  <summary
                    aria-controls="setup-deployment-validation-body"
                    aria-expanded={setupSectionExpanded.deploymentValidation}
                    className={styles.setupCollapsibleSummary}
                  >
                    <div className={styles.setupCollapsibleHeading}>
                      <h4>Deployment validation</h4>
                      <p className={styles.statusText}>
                        Infrastructure and environment configuration checks.
                      </p>
                    </div>
                    <span className={styles.setupCollapsibleAffordance}>
                      <span className={styles.setupCollapsibleState}>
                        {showDeploymentError
                          ? 'Needs attention'
                          : showDeploymentLoading
                            ? 'Loading deployment validation...'
                            : deploymentStatus?.deploymentReady
                              ? 'Ready'
                              : showDeploymentChecklist
                                ? 'Issues found'
                                : 'Available'}
                      </span>
                      <span aria-hidden="true" className={styles.setupChevronIcon}>
                        <svg className={styles.setupChevronSvg} viewBox="0 0 16 16">
                          <path d="M4 6l4 4 4-4" />
                        </svg>
                      </span>
                    </span>
                  </summary>
                  <div className={styles.setupCollapsibleBody} id="setup-deployment-validation-body">
                {showDeploymentLoading ? (
                  <div className={styles.statusBlock}>
                    <div className={styles.loadingLine} />
                    <div className={styles.loadingLine} />
                    <div className={`${styles.loadingLine} ${styles.loadingLineShort}`} />
                    <p className={styles.statusText}>Loading deployment validation...</p>
                  </div>
                ) : null}

                {showDeploymentError ? (
                  <div className={styles.statusBlock}>
                    <p className={styles.statusTitle}>Deployment validation error</p>
                    <p className={styles.statusText}>{deploymentError}</p>
                  </div>
                ) : null}

                {showDeploymentChecklist ? (
                  <>
                    <AdminCard className={styles.setupSummaryCard} variant="card">
                      <div className={styles.setupCardHeader}>
                        <div>
                          <p className={styles.eyebrow}>Deployment validation</p>
                          <h3 className={styles.setupHeadline}>
                            {deploymentStatus.deploymentReady ? 'Deployment ready' : 'Deployment issues found'}
                          </h3>
                          <p className={styles.statusText}>
                            Infrastructure and environment configuration checks.
                          </p>
                        </div>
                        <AdminButton
                          disabled={deploymentLoading}
                          onClick={() => refreshDeploymentValidation()}
                          size="sm"
                          variant="secondary"
                        >
                          {deploymentLoading ? 'Refreshing...' : 'Refresh'}
                        </AdminButton>
                      </div>
                    </AdminCard>

                    <section className={styles.setupGrid}>
                      {(deploymentStatus.checks || []).map((check) => (
                        <AdminCard as="article" className={styles.setupCard} key={check.id} variant="card">
                          <div className={styles.setupCardHeader}>
                            <h4>{check.title}</h4>
                            <AdminStatusChip
                              tone={
                                check.status === 'ready'
                                  ? 'success'
                                  : check.status === 'needs_setup'
                                    ? 'danger'
                                    : check.status === 'warning'
                                      ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {check.status === 'ready'
                                ? 'Ready'
                                : check.status === 'needs_setup'
                                  ? 'Needs setup'
                                  : check.status === 'warning'
                                    ? 'Warning'
                                  : check.status === 'skipped'
                                    ? 'Skipped'
                                    : 'Optional'}
                            </AdminStatusChip>
                          </div>
                          <p className={styles.statusText}>{check.summary}</p>
                          {check.fix ? <p className={styles.setupFixText}>Fix: {check.fix}</p> : null}
                        </AdminCard>
                      ))}
                    </section>
                  </>
                ) : null}
                  </div>
                </details>

                <details
                  className={styles.setupCollapsibleSection}
                  onToggle={(event) => {
                    const isOpen = event.currentTarget.open;
                    setSetupSectionExpanded((current) => ({
                      ...current,
                      advancedDiagnostics: isOpen,
                    }));
                  }}
                >
                  <summary
                    aria-controls="setup-advanced-diagnostics-body"
                    aria-expanded={setupSectionExpanded.advancedDiagnostics}
                    className={styles.setupCollapsibleSummary}
                  >
                    <div className={styles.setupCollapsibleHeading}>
                      <h4>Advanced diagnostics</h4>
                      <p className={styles.statusText}>
                        Foundation checks, environment hints, and setup helper commands for owners and developers.
                      </p>
                    </div>
                    <span className={styles.setupCollapsibleAffordance}>
                      <span className={styles.setupCollapsibleState}>
                        {showSetupErrorState
                          ? 'Needs attention'
                          : showSetupLoadingState
                            ? 'Loading diagnostics...'
                            : showSetupDiagnostics
                              ? `${setupCompletionPercent}% complete`
                              : 'Available'}
                      </span>
                      <span aria-hidden="true" className={styles.setupChevronIcon}>
                        <svg className={styles.setupChevronSvg} viewBox="0 0 16 16">
                          <path d="M4 6l4 4 4-4" />
                        </svg>
                      </span>
                    </span>
                  </summary>
                  <div className={styles.setupCollapsibleBody} id="setup-advanced-diagnostics-body">
                {showSetupDiagnostics ? (
                  <AdminCard className={styles.setupSummaryCard} variant="card">
                    <div>
                      <p className={styles.eyebrow}>Setup health</p>
                      <h3 className={styles.setupHeadline}>{setupStatus?.overallStatus?.replaceAll('_', ' ') || 'unknown'}</h3>
                      <p className={styles.statusText}>Completion: {setupCompletionPercent}%</p>
                    </div>
                    <div className={styles.setupMeterTrack} role="img" aria-label={`Setup completion ${setupCompletionPercent}%`}>
                      <div className={styles.setupMeterFill} style={{ width: `${setupCompletionPercent}%` }} />
                    </div>
                  </AdminCard>
                ) : null}

                <SettingsSetupDiagnosticsState
                  setupError={setupError}
                  setupLoaded={setupLoaded}
                  showSetupDiagnostics={showSetupDiagnostics}
                  showSetupErrorState={showSetupErrorState}
                  showSetupLoadingState={showSetupLoadingState}
                />

                {showSetupDiagnostics ? (
                  <>
                    <section className={styles.setupGrid}>
                      {setupCards.map((card) => (
                        <AdminCard as="article" className={styles.setupCard} key={card.id} variant="card">
                          <div className={styles.setupCardHeader}>
                            <h4>
                              {card.label}
                              {card.tooltip ? <AdminTooltip content={card.tooltip} /> : null}
                            </h4>
                            <AdminStatusChip tone={card.status === 'PASS' ? 'success' : card.status === 'FAIL' ? 'danger' : 'warning'}>
                              {card.status}
                            </AdminStatusChip>
                          </div>
                          <p className={styles.statusText}>{card.summary}</p>
                          {card.fix ? <p className={styles.setupFixText}>Fix: {card.fix}</p> : null}
                        </AdminCard>
                      ))}
                    </section>

                    <section className={styles.setupColumns}>
                      <AdminCard as="article" className={styles.setupColumnCard} variant="card">
                        <h4>Provider setup moved</h4>
                        <p className={styles.statusText}>
                          Provider setup now lives in Payments, Shipping, and Email. This page only checks the app foundation.
                        </p>
                        <ul className={styles.setupList}>
                          {SETUP_FOUNDATION_HINTS.map((hint) => (
                            <li key={hint}>{hint}</li>
                          ))}
                        </ul>
                      </AdminCard>

                      <AdminCard as="article" className={styles.setupColumnCard} variant="card">
                        <h4>Missing env warnings</h4>
                        {setupMissingEnvVars.length ? (
                          <div className={styles.warningTagList}>
                            {setupMissingEnvVars.map((envName) => (
                              <AdminStatusChip key={envName} tone="warning">{envName}</AdminStatusChip>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.statusText}>No env variable gaps detected in current diagnostics.</p>
                        )}
                      </AdminCard>

                      <AdminCard as="article" className={styles.setupColumnCard} variant="card">
                        <h4>Copy .env template</h4>
                        <div className={styles.commandList}>
                          <div className={styles.commandRow}>
                            <code className={styles.commandCode}>.env.local template</code>
                            <AdminButton
                              onClick={() => handleCopyCommand('env-template', SETUP_ENV_TEMPLATE)}
                              size="sm"
                              variant="secondary"
                            >
                              {setupCopiedCommandId === 'env-template' ? 'Copied' : 'Copy'}
                            </AdminButton>
                          </div>
                        </div>
                        <pre className={styles.setupTemplateCode}>{SETUP_ENV_TEMPLATE}</pre>
                      </AdminCard>
                    </section>

                    <section className={styles.setupColumns}>
                      <AdminCard as="article" className={styles.setupColumnCard} variant="card">
                        <h4>Copy/paste CLI commands</h4>
                        <div className={styles.commandList}>
                          {SETUP_COMMANDS.map((entry) => (
                            <div className={styles.commandRow} key={entry.id}>
                              <code className={styles.commandCode}>{entry.command}</code>
                              <AdminButton
                                onClick={() => handleCopyCommand(entry.id, entry.command)}
                                size="sm"
                                variant="secondary"
                              >
                                {setupCopiedCommandId === entry.id ? 'Copied' : 'Copy'}
                              </AdminButton>
                            </div>
                          ))}
                        </div>
                      </AdminCard>

                      <AdminCard as="article" className={styles.setupColumnCard} variant="card">
                        <h4>Setup docs checklist</h4>
                        <ul className={styles.setupList}>
                          <li>1. Copy <code>.env.example</code> to <code>.env.local</code>.</li>
                          <li>2. Set <code>DATABASE_URL</code> and <code>DIRECT_URL</code> before app boot.</li>
                          <li>3. Create the first owner at <code>/create-owner</code> (SETUP_TOKEN is local-optional).</li>
                          <li>4. Configure Stripe, shipping, and optional email in Settings tabs.</li>
                          <li>5. Run a paid test checkout and confirm the order in admin.</li>
                        </ul>
                      </AdminCard>
                    </section>

                    <section className={styles.setupColumns}>
                      <AdminCard as="article" className={styles.setupColumnCard} variant="card">
                        <h4>Required next steps</h4>
                        {setupRequiredNextSteps.length ? (
                          <ul className={styles.setupList}>
                            {setupRequiredNextSteps.map((action) => (
                              <li key={action}>{action}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className={styles.statusText}>No required steps right now.</p>
                        )}
                      </AdminCard>

                      <AdminCard as="article" className={styles.setupColumnCard} variant="card">
                        <h4>Optional production steps</h4>
                        {setupOptionalFoundationSteps.length ? (
                          <ul className={styles.setupList}>
                            {setupOptionalFoundationSteps.map((action) => (
                              <li key={action}>{action}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className={styles.statusText}>No optional production steps right now.</p>
                        )}
                      </AdminCard>
                    </section>
                  </>
                ) : null}
                  </div>
                </details>
              </div>
            ) : null}

          </div>
        </div>
      </div>
      <AdminDrawer
        onClose={closePaymentDrawer}
        open={Boolean(activePaymentDrawer)}
        subtitle={
          activePaymentDrawer === PAYMENT_PROVIDER_DRAWER.STRIPE
            ? 'Connect Stripe and manage checkout credentials. Pilot order: Save credentials -> Verify now -> Confirm webhook endpoint.'
            : activePaymentDrawer === PAYMENT_PROVIDER_DRAWER.PAYPAL
              ? 'Status and rollout notes for PayPal checkout support.'
              : activePaymentDrawer === PAYMENT_PROVIDER_DRAWER.MANUAL
                ? 'Offline payment guidance for draft and invoice workflows.'
                : 'Provider setup details.'
        }
        title={
          activePaymentDrawer === PAYMENT_PROVIDER_DRAWER.STRIPE
            ? 'Stripe'
            : activePaymentDrawer === PAYMENT_PROVIDER_DRAWER.PAYPAL
              ? 'PayPal'
              : activePaymentDrawer === PAYMENT_PROVIDER_DRAWER.MANUAL
                ? 'Manual payments'
                : 'Provider setup'
        }
      >
        {activePaymentDrawer === PAYMENT_PROVIDER_DRAWER.STRIPE ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>{stripeConnectionPresentation.heading}</h4>
                <AdminStatusChip tone={stripeConnectionPresentation.badgeTone}>{stripeConnectionPresentation.badgeLabel}</AdminStatusChip>
              </div>
              <p className={styles.compactMeta}>{stripeConnectionPresentation.copy}</p>
              <div className={styles.statusSummaryList}>
                {stripeConnectionSummaryRows.map((row) => (
                  <div className={styles.statusSummaryRow} key={`stripe-summary-${row.label}`}>
                    <span className={styles.statusSummaryLabel}>{row.label}</span>
                    <span className={styles.statusSummaryValue}>{row.value}</span>
                  </div>
                ))}
                <div className={styles.statusSummaryRow}>
                  <span className={styles.statusSummaryLabel}>Webhook endpoint</span>
                  <span className={styles.statusSummaryValue}>{stripeWebhookEndpointStatusLabel}</span>
                </div>
              </div>
              {showStripeRuntimeMismatchWarning ? (
                <p className={styles.setupFixText}>
                  Stripe is verified but checkout is currently using {stripeCheckoutSourceLabel}. Re-run Stripe verification and confirm runtime status.
                </p>
              ) : null}
            </AdminCard>

            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Credentials</h4>
                <AdminTooltip content="Credentials are encrypted at rest. Inputs clear after save and show masked placeholders from saved metadata." />
              </div>
              <p className={styles.compactMeta}>
                {stripeActionsRestricted
                  ? STRIPE_OWNER_REQUIRED_HELPER_COPY
                  : 'Save API keys and webhook secret, then verify Stripe API and add the webhook endpoint in Stripe.'}
              </p>
              {stripeActionsRestricted ? (
                <p className={styles.compactMeta}>{STRIPE_OWNER_REQUIRED_NEXT_STEP_COPY}</p>
              ) : (
                <p className={styles.compactMeta}>
                  Recommended pilot sequence: save keys, verify Stripe, copy webhook endpoint, then confirm runtime status is using the verified source.
                </p>
              )}
              <p className={styles.compactMeta}>
                Credentials are saved securely. Secret values are encrypted and hidden. Use Replace only when changing keys.
              </p>
              <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                <AdminField hint="pk_test_... or pk_live_..." label="Publishable key">
                  {stripeShowPublishableInput ? (
                    <div className={styles.credentialInputStack}>
                      <AdminInput
                        disabled={stripeActionsRestricted}
                        onChange={(event) => patchProviderForm('STRIPE', { publishableKey: event.target.value })}
                        placeholder="pk_test_..."
                        type="text"
                        value={providerForms.STRIPE.publishableKey}
                      />
                      {stripeCredentialMaskMap.PUBLISHABLE_KEY ? (
                        <AdminButton
                          disabled={stripeActionsRestricted}
                          onClick={() => cancelStripeCredentialReplace('publishableKey')}
                          size="sm"
                          variant="ghost"
                        >
                          Cancel replacement
                        </AdminButton>
                      ) : null}
                    </div>
                  ) : (
                    <div className={styles.savedCredentialRow}>
                      <span className={styles.savedCredentialValue}>Saved credential • {stripeCredentialMaskMap.PUBLISHABLE_KEY}</span>
                      <AdminButton
                        disabled={stripeActionsRestricted}
                        onClick={() => startStripeCredentialReplace('publishableKey')}
                        size="sm"
                        variant="ghost"
                      >
                        Replace
                      </AdminButton>
                    </div>
                  )}
                </AdminField>
                <AdminField hint="sk_test_... or sk_live_..." label="Secret key">
                  {stripeShowSecretInput ? (
                    <div className={styles.credentialInputStack}>
                      <AdminInput
                        disabled={stripeActionsRestricted}
                        onChange={(event) => patchProviderForm('STRIPE', { secretKey: event.target.value })}
                        placeholder="sk_test_..."
                        type="password"
                        value={providerForms.STRIPE.secretKey}
                      />
                      {stripeCredentialMaskMap.SECRET_KEY ? (
                        <AdminButton
                          disabled={stripeActionsRestricted}
                          onClick={() => cancelStripeCredentialReplace('secretKey')}
                          size="sm"
                          variant="ghost"
                        >
                          Cancel replacement
                        </AdminButton>
                      ) : null}
                    </div>
                  ) : (
                    <div className={styles.savedCredentialRow}>
                      <span className={styles.savedCredentialValue}>Saved credential • {stripeCredentialMaskMap.SECRET_KEY}</span>
                      <AdminButton
                        disabled={stripeActionsRestricted}
                        onClick={() => startStripeCredentialReplace('secretKey')}
                        size="sm"
                        variant="ghost"
                      >
                        Replace
                      </AdminButton>
                    </div>
                  )}
                </AdminField>
                <AdminField hint="Used to verify webhook signatures from Stripe." label="Webhook secret">
                  {stripeShowWebhookInput ? (
                    <div className={styles.credentialInputStack}>
                      <AdminInput
                        disabled={stripeActionsRestricted}
                        onChange={(event) => patchProviderForm('STRIPE', { webhookSecret: event.target.value })}
                        placeholder="whsec_..."
                        type="password"
                        value={providerForms.STRIPE.webhookSecret}
                      />
                      {stripeCredentialMaskMap.WEBHOOK_SECRET ? (
                        <AdminButton
                          disabled={stripeActionsRestricted}
                          onClick={() => cancelStripeCredentialReplace('webhookSecret')}
                          size="sm"
                          variant="ghost"
                        >
                          Cancel replacement
                        </AdminButton>
                      ) : null}
                    </div>
                  ) : (
                    <div className={styles.savedCredentialRow}>
                      <span className={styles.savedCredentialValue}>Saved credential • {stripeCredentialMaskMap.WEBHOOK_SECRET}</span>
                      <AdminButton
                        disabled={stripeActionsRestricted}
                        onClick={() => startStripeCredentialReplace('webhookSecret')}
                        size="sm"
                        variant="ghost"
                      >
                        Replace
                      </AdminButton>
                    </div>
                  )}
                </AdminField>
                <label className={styles.field}>
                  <span>Mode</span>
                  <AdminSelect
                    className={styles.input}
                    disabled={stripeActionsRestricted}
                    onChange={(nextValue) => patchProviderForm('STRIPE', { mode: nextValue })}
                    options={STRIPE_MODE_OPTIONS}
                    value={providerForms.STRIPE.mode}
                  />
                </label>
              </div>
              <div className={styles.compactActionRow}>
                <AdminButton
                  disabled={
                    stripeActionsRestricted ||
                    providerActionById.STRIPE === 'saving' ||
                    (!stripeHasSavedRequiredKeys &&
                      (!providerForms.STRIPE.publishableKey.trim() ||
                        !providerForms.STRIPE.secretKey.trim()))
                  }
                  onClick={() => handleSaveProviderCredentials('STRIPE', stripeSavePayload)}
                  size="sm"
                  variant="primary"
                >
                  {providerActionById.STRIPE === 'saving' ? 'Saving...' : 'Save Stripe settings'}
                </AdminButton>
                <AdminButton
                  disabled={stripeActionsRestricted || providerActionById.STRIPE === 'verifying'}
                  onClick={() => handleVerifyProvider('STRIPE')}
                  size="sm"
                  variant="secondary"
                >
                  {providerActionById.STRIPE === 'verifying' ? 'Verifying...' : 'Verify now'}
                </AdminButton>
                <AdminButton disabled={stripeActionsRestricted} onClick={handleCopyStripeWebhookEndpoint} size="sm" variant="ghost">
                  {setupCopiedCommandId === 'stripe-webhook-endpoint' ? 'Copied endpoint' : 'Copy webhook endpoint'}
                </AdminButton>
              </div>
              <div className={styles.endpointInlineRow}>
                <span className={styles.statusSummaryLabel}>Endpoint URL</span>
                <span className={styles.endpointMonospace}>
                  {stripeWebhookEndpoint || 'Unavailable until this page has a valid origin'}
                </span>
              </div>
              {!stripeActionsRestricted && !stripeWebhookEndpointReady ? (
                <p className={styles.setupFixText}>
                  Store URL needs setup. {stripeWebhookEndpointMessage} Set NEXT_PUBLIC_STORE_URL to the deployed domain and redeploy before relying on webhook readiness for pilot traffic.
                </p>
              ) : null}
              {!stripeActionsRestricted && stripeWebhookEndpointIssue === 'placeholder' ? (
                <p className={styles.setupFixText}>
                  Placeholder domains are not accepted for webhook readiness.
                </p>
              ) : null}
              {stripeSavedCredentialEntries.length ? (
                <details className={styles.drawerDetails}>
                  <summary className={styles.drawerDetailsSummary}>Developer details</summary>
                  <div className={styles.drawerDetailsBody}>
                    {stripeSavedCredentialEntries.map((entry) => (
                      <p className={styles.compactMeta} key={entry.key}>
                        <strong>{entry.key}:</strong> {entry.maskedValue || 'saved'}
                      </p>
                    ))}
                  </div>
                </details>
              ) : null}
            </AdminCard>

            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Checkout methods through Stripe</h4>
              </div>
              <div className={`${styles.methodChipRow} ${styles.compactChipRow}`}>
                {stripeMethodChips.map((chip) => (
                  <span className={styles.methodChip} key={`stripe-drawer-${chip}`}>
                    {chip}
                  </span>
                ))}
              </div>
              <p className={styles.compactMeta}>Wallet availability depends on HTTPS, live mode, and domain checks.</p>
            </AdminCard>

            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Advanced</h4>
              </div>
              <p className={styles.compactMeta}>Developer tooling and destructive actions.</p>
              <AdminButton
                className={styles.advancedToggle}
                disabled={stripeActionsRestricted}
                onClick={() => setShowStripeAdvanced((current) => !current)}
                size="sm"
                variant="secondary"
              >
                {showStripeAdvanced ? 'Hide advanced options' : 'Show advanced options'}
              </AdminButton>
              {stripeActionsRestricted ? (
                <p className={styles.compactMeta}>{STRIPE_OWNER_REQUIRED_HELPER_COPY}</p>
              ) : null}
              {showStripeAdvanced ? (
                <div className={styles.compactDrawerGrid}>
                  <p className={styles.compactMeta}>
                    Disconnecting Stripe removes DB-backed credentials. Env fallback may remain active if env keys still exist.
                  </p>
                  <div className={styles.compactActionRow}>
                    <AdminButton
                      disabled={stripeActionsRestricted || providerActionById.STRIPE === 'disconnecting'}
                      onClick={() => handleDisconnectProvider('STRIPE')}
                      size="sm"
                      variant="ghost"
                    >
                      {providerActionById.STRIPE === 'disconnecting' ? 'Disconnecting...' : 'Disconnect Stripe'}
                    </AdminButton>
                    <AdminButton
                      disabled={stripeActionsRestricted}
                      onClick={() => handleCopyCommand('stripe-webhook-cli', 'npm run doopify:stripe:webhook')}
                      size="sm"
                      variant="ghost"
                    >
                      {setupCopiedCommandId === 'stripe-webhook-cli' ? 'Copied CLI command' : 'Copy webhook CLI command'}
                    </AdminButton>
                  </div>
                </div>
              ) : null}
            </AdminCard>
          </div>
        ) : null}

        {activePaymentDrawer === PAYMENT_PROVIDER_DRAWER.PAYPAL ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>PayPal status</h4>
                <AdminStatusChip tone="warning">Setup needed</AdminStatusChip>
              </div>
              <div className={styles.compactDrawerGrid}>
                <p className={styles.compactMeta}>
                  <strong>Runtime:</strong> Not implemented
                </p>
                <p className={styles.compactMeta}>
                  <strong>Checkout visibility:</strong> Hidden
                </p>
                <p className={styles.compactMeta}>
                  <strong>Refund support:</strong> Not implemented
                </p>
                <p className={styles.compactMeta}>
                  <strong>Webhooks:</strong> Not implemented
                </p>
              </div>
            </AdminCard>

            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Not yet available</h4>
              </div>
              <p className={styles.compactMeta}>
                PayPal support is planned. Keep hidden until payment creation, webhook verification, refunds, and order finalization are implemented.
              </p>
              <p className={styles.compactMeta}>
                Future credential fields stay hidden until runtime support exists to avoid fake setup.
              </p>
            </AdminCard>
          </div>
        ) : null}

        {activePaymentDrawer === PAYMENT_PROVIDER_DRAWER.MANUAL ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Manual payment usage</h4>
                <AdminStatusChip tone="neutral">Built-in</AdminStatusChip>
              </div>
              <p className={styles.compactMeta}>Manual payments are for draft orders, invoices, and phone orders.</p>
            </AdminCard>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Offline instructions</h4>
              </div>
              <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                <AdminField hint="Shown internally to staff during draft order collection." label="Cash instructions">
                  <AdminTextarea placeholder="Example: Collect cash on pickup and mark payment received after handoff." rows={3} />
                </AdminField>
                <AdminField hint="Reference details for manual reconciliation." label="Bank transfer instructions">
                  <AdminTextarea placeholder="Example: Include routing/account notes and expected settlement window." rows={3} />
                </AdminField>
              </div>
              <AdminField hint="Optional merchant-facing reminder for invoice flows." label="Manual payment notes">
                <AdminTextarea placeholder="Example: Payment due within 7 days. Include order number in transfer memo." rows={3} />
              </AdminField>
              <div className={styles.compactActionRow}>
                <AdminButton disabled size="sm" variant="secondary">
                  Save instructions
                </AdminButton>
              </div>
              <p className={styles.compactMeta}>
                Manual storefront checkout is disabled until server-owned manual payment finalization is implemented.
              </p>
            </AdminCard>
          </div>
        ) : null}
      </AdminDrawer>
      <AdminDrawer
        onClose={closeEmailDrawer}
        open={Boolean(activeEmailDrawer)}
        subtitle={
          activeEmailDrawer === EMAIL_PROVIDER_DRAWER.RESEND
            ? 'Save credentials, verify status, and send a test message.'
            : activeEmailDrawer === EMAIL_PROVIDER_DRAWER.SMTP
              ? 'Configure SMTP credentials and verify connectivity.'
              : activeEmailDrawer === EMAIL_PROVIDER_DRAWER.SENDLAYER
                ? 'Provider status while runtime support remains pending.'
                : 'Email provider setup details.'
        }
        title={
          activeEmailDrawer === EMAIL_PROVIDER_DRAWER.RESEND
            ? 'Resend'
            : activeEmailDrawer === EMAIL_PROVIDER_DRAWER.SMTP
              ? 'SMTP'
              : activeEmailDrawer === EMAIL_PROVIDER_DRAWER.SENDLAYER
                ? 'SendLayer'
                : 'Email provider setup'
        }
      >
        {activeEmailDrawer === EMAIL_PROVIDER_DRAWER.RESEND ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Connection status</h4>
                <AdminStatusChip tone={resendSetupStatus.tone}>{resendSetupStatus.label}</AdminStatusChip>
              </div>
              <p className={styles.statusText}>{resendSetupStatus.detail}</p>
              <div className={styles.compactDrawerGrid}>
                <p className={styles.compactMeta}>
                  <strong>Active source:</strong> {resendSetupStatus.sourceLabel || 'Not active'}
                </p>
                <p className={styles.compactMeta}>
                  <strong>Webhook status:</strong> {describeResendSetup(setupCheckById).label}
                </p>
                <p className={styles.compactMeta}>
                  <strong>Last verified:</strong> {formatDateTime(resendSetupStatus.lastVerifiedAt, settings.timezone)}
                </p>
              </div>
            </AdminCard>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Credentials</h4>
                <AdminTooltip content="Saved secret values are not rendered back. Fields clear after save and masked metadata remains." />
              </div>
              <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                <AdminField label="Resend API key">
                  <AdminInput
                    onChange={(event) => patchProviderForm('RESEND', { apiKey: event.target.value })}
                    placeholder="re_..."
                    type="password"
                    value={providerForms.RESEND.apiKey}
                  />
                </AdminField>
                <AdminField hint="Optional for bounce/complaint signature checks." label="Webhook secret">
                  <AdminInput
                    onChange={(event) => patchProviderForm('RESEND', { webhookSecret: event.target.value })}
                    placeholder="whsec_..."
                    type="password"
                    value={providerForms.RESEND.webhookSecret}
                  />
                </AdminField>
                <AdminField hint="Optional sender override for test sends." label="From email">
                  <AdminInput
                    onChange={(event) => patchProviderForm('RESEND', { fromEmail: event.target.value })}
                    placeholder="store@example.com"
                    value={providerForms.RESEND.fromEmail}
                  />
                </AdminField>
                <AdminField label="Test recipient email">
                  <AdminInput
                    onChange={(event) => setProviderTestEmailById((current) => ({ ...current, RESEND: event.target.value }))}
                    placeholder="owner@example.com"
                    value={providerTestEmailById.RESEND}
                  />
                </AdminField>
              </div>
              <div className={styles.compactActionRow}>
                <AdminButton
                  disabled={providerActionById.RESEND === 'saving' || !providerForms.RESEND.apiKey.trim()}
                  onClick={() =>
                    handleSaveProviderCredentials('RESEND', {
                      apiKey: providerForms.RESEND.apiKey,
                      webhookSecret: providerForms.RESEND.webhookSecret || undefined,
                      fromEmail: providerForms.RESEND.fromEmail || undefined,
                    })
                  }
                  size="sm"
                  variant="secondary"
                >
                  {providerActionById.RESEND === 'saving' ? 'Saving...' : 'Save credentials'}
                </AdminButton>
                <AdminButton
                  disabled={providerActionById.RESEND === 'verifying'}
                  onClick={() => handleVerifyProvider('RESEND')}
                  size="sm"
                  variant="secondary"
                >
                  {providerActionById.RESEND === 'verifying' ? 'Verifying...' : 'Verify provider'}
                </AdminButton>
                <AdminButton
                  disabled={providerActionById.RESEND === 'testing' || !providerTestEmailById.RESEND.trim()}
                  onClick={() => handleSendProviderTestEmail('RESEND')}
                  size="sm"
                  variant="ghost"
                >
                  {providerActionById.RESEND === 'testing' ? 'Sending test...' : 'Send test email'}
                </AdminButton>
              </div>
              {resendSavedCredentialMeta.length ? (
                <div className={styles.maskedSecretList}>
                  {resendSavedCredentialMeta.map((entry) => (
                    <p className={styles.compactMeta} key={`resend-${entry.key}`}>
                      <strong>{entry.key}:</strong> {entry.maskedValue || 'saved'}
                    </p>
                  ))}
                </div>
              ) : (
                <p className={styles.compactMeta}>No DB credential metadata yet. Env fallback may still be active.</p>
              )}
            </AdminCard>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Advanced</h4>
              </div>
              <p className={styles.compactMeta}>Disconnecting removes DB-backed credentials. Env fallback may remain active if env keys still exist.</p>
              <div className={styles.compactActionRow}>
                <AdminButton
                  disabled={providerActionById.RESEND === 'disconnecting'}
                  onClick={() => handleDisconnectProvider('RESEND')}
                  size="sm"
                  variant="ghost"
                >
                  {providerActionById.RESEND === 'disconnecting' ? 'Disconnecting...' : 'Disconnect Resend'}
                </AdminButton>
              </div>
            </AdminCard>
          </div>
        ) : null}

        {activeEmailDrawer === EMAIL_PROVIDER_DRAWER.SMTP ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Connection status</h4>
                <AdminStatusChip tone={smtpSetupStatus.tone}>{smtpSetupStatus.label}</AdminStatusChip>
              </div>
              <p className={styles.statusText}>{smtpSetupStatus.detail}</p>
              <div className={styles.compactDrawerGrid}>
                <p className={styles.compactMeta}>
                  <strong>Active source:</strong> {smtpSetupStatus.sourceLabel || 'Not active'}
                </p>
                <p className={styles.compactMeta}>
                  <strong>Last verified:</strong> {formatDateTime(smtpSetupStatus.lastVerifiedAt, settings.timezone)}
                </p>
              </div>
            </AdminCard>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Credentials</h4>
                <AdminTooltip content="Saved secret values are not rendered back. Fields clear after save and masked metadata remains." />
              </div>
              <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                <AdminField label="Host">
                  <AdminInput
                    onChange={(event) => patchProviderForm('SMTP', { host: event.target.value })}
                    placeholder="smtp.provider.com"
                    value={providerForms.SMTP.host}
                  />
                </AdminField>
                <AdminField label="Port">
                  <AdminInput
                    onChange={(event) => patchProviderForm('SMTP', { port: event.target.value })}
                    placeholder="587"
                    value={providerForms.SMTP.port}
                  />
                </AdminField>
                <AdminField label="Username">
                  <AdminInput
                    onChange={(event) => patchProviderForm('SMTP', { username: event.target.value })}
                    value={providerForms.SMTP.username}
                  />
                </AdminField>
                <AdminField label="Password">
                  <AdminInput
                    onChange={(event) => patchProviderForm('SMTP', { password: event.target.value })}
                    type="password"
                    value={providerForms.SMTP.password}
                  />
                </AdminField>
                <label className={styles.checkboxField}>
                  <AdminInput
                    checked={Boolean(providerForms.SMTP.secure)}
                    onChange={(event) => patchProviderForm('SMTP', { secure: event.target.checked })}
                    className={styles.settingsCheckbox} type="checkbox"
                  />
                  <span>Secure/TLS connection</span>
                </label>
                <AdminField hint="Optional sender override for test sends." label="From email">
                  <AdminInput
                    onChange={(event) => patchProviderForm('SMTP', { fromEmail: event.target.value })}
                    placeholder="store@example.com"
                    value={providerForms.SMTP.fromEmail}
                  />
                </AdminField>
                <AdminField label="Test recipient email">
                  <AdminInput
                    onChange={(event) => setProviderTestEmailById((current) => ({ ...current, SMTP: event.target.value }))}
                    placeholder="owner@example.com"
                    value={providerTestEmailById.SMTP}
                  />
                </AdminField>
              </div>
              <div className={styles.compactActionRow}>
                <AdminButton
                  disabled={
                    providerActionById.SMTP === 'saving' ||
                    !providerForms.SMTP.host.trim() ||
                    !providerForms.SMTP.port.trim() ||
                    !providerForms.SMTP.username.trim() ||
                    !providerForms.SMTP.password.trim()
                  }
                  onClick={() =>
                    handleSaveProviderCredentials('SMTP', {
                      host: providerForms.SMTP.host,
                      port: Number(providerForms.SMTP.port),
                      secure: Boolean(providerForms.SMTP.secure),
                      username: providerForms.SMTP.username,
                      password: providerForms.SMTP.password,
                      fromEmail: providerForms.SMTP.fromEmail || undefined,
                    })
                  }
                  size="sm"
                  variant="secondary"
                >
                  {providerActionById.SMTP === 'saving' ? 'Saving...' : 'Save credentials'}
                </AdminButton>
                <AdminButton
                  disabled={providerActionById.SMTP === 'verifying'}
                  onClick={() => handleVerifyProvider('SMTP')}
                  size="sm"
                  variant="secondary"
                >
                  {providerActionById.SMTP === 'verifying' ? 'Verifying...' : 'Verify provider'}
                </AdminButton>
                <AdminButton
                  disabled={providerActionById.SMTP === 'testing' || !providerTestEmailById.SMTP.trim()}
                  onClick={() => handleSendProviderTestEmail('SMTP')}
                  size="sm"
                  variant="ghost"
                >
                  {providerActionById.SMTP === 'testing' ? 'Sending test...' : 'Send test email'}
                </AdminButton>
              </div>
              {smtpSavedCredentialMeta.length ? (
                <div className={styles.maskedSecretList}>
                  {smtpSavedCredentialMeta.map((entry) => (
                    <p className={styles.compactMeta} key={`smtp-${entry.key}`}>
                      <strong>{entry.key}:</strong> {entry.maskedValue || 'saved'}
                    </p>
                  ))}
                </div>
              ) : (
                <p className={styles.compactMeta}>No DB credential metadata yet. Env fallback may still be active.</p>
              )}
            </AdminCard>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Advanced</h4>
              </div>
              <p className={styles.compactMeta}>Disconnecting removes DB-backed credentials. Env fallback may remain active if env keys still exist.</p>
              <div className={styles.compactActionRow}>
                <AdminButton
                  disabled={providerActionById.SMTP === 'disconnecting'}
                  onClick={() => handleDisconnectProvider('SMTP')}
                  size="sm"
                  variant="ghost"
                >
                  {providerActionById.SMTP === 'disconnecting' ? 'Disconnecting...' : 'Disconnect SMTP'}
                </AdminButton>
              </div>
            </AdminCard>
          </div>
        ) : null}

        {activeEmailDrawer === EMAIL_PROVIDER_DRAWER.SENDLAYER ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Setup status</h4>
                <AdminStatusChip tone="warning">Coming soon</AdminStatusChip>
              </div>
              <div className={styles.compactDrawerGrid}>
                <p className={styles.compactMeta}>
                  <strong>Runtime:</strong> Not implemented
                </p>
                <p className={styles.compactMeta}>
                  <strong>Checkout visibility:</strong> Hidden
                </p>
                <p className={styles.compactMeta}>
                  <strong>Webhooks:</strong> Not implemented
                </p>
              </div>
            </AdminCard>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Not yet available</h4>
              </div>
              <p className={styles.compactMeta}>
                Keep this provider hidden until runtime send, webhook verification, and delivery logging support exists.
              </p>
            </AdminCard>
          </div>
        ) : null}
      </AdminDrawer>
      <AdminDrawer
        onClose={closeBrandDrawer}
        open={Boolean(activeBrandDrawer)}
        subtitle={
          activeBrandDrawer === BRAND_DRAWER.GLOBAL_ASSETS
            ? 'Used for storefront logo, favicon, packing slips, and default email branding.'
            : activeBrandDrawer === BRAND_DRAWER.CHECKOUT_BRANDING
                ? 'Controls checkout identity assets and support details used in customer-facing surfaces.'
                : activeBrandDrawer === BRAND_DRAWER.EMAIL_BRANDING
                  ? 'Controls customer email logo/header/footer styling.'
                  : activeBrandDrawer === BRAND_DRAWER.SOCIAL_LINKS
                    ? 'Manage social profile destinations used in supported surfaces.'
                    : 'Brand settings details.'
        }
        title={
          activeBrandDrawer === BRAND_DRAWER.GLOBAL_ASSETS
            ? 'Global brand assets'
            : activeBrandDrawer === BRAND_DRAWER.CHECKOUT_BRANDING
                ? 'Checkout branding'
                : activeBrandDrawer === BRAND_DRAWER.EMAIL_BRANDING
                  ? 'Email branding'
                  : activeBrandDrawer === BRAND_DRAWER.SOCIAL_LINKS
                    ? 'Social links'
                    : 'Brand details'
        }
      >
        {activeBrandDrawer === BRAND_DRAWER.GLOBAL_ASSETS ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Identity</h4>
              </div>
              <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                <label className={styles.field}>
                  <span>Brand name</span>
                  <AdminInput className={styles.input} onChange={(event) => handleBrandKitPatch({ name: event.target.value })} value={brandKit?.name || ''} />
                </label>
                <p className={styles.compactMeta}>Used as fallback display name across storefront, checkout, and emails.</p>
                <label className={styles.field}>
                  <span>Support email</span>
                  <AdminInput className={styles.input} onChange={(event) => handleBrandKitPatch({ supportEmail: event.target.value })} value={brandKit?.supportEmail || ''} />
                </label>
                <p className={styles.compactMeta}>Customer-facing support/reply email.</p>
                <p className={styles.compactMeta}>
                  <strong>Support phone:</strong> {settings.phone ? settings.phone : 'Not set'}
                </p>
                <p className={styles.compactMeta}>Optional customer-facing phone number used in checkout and customer communications.</p>
              </div>
              <p className={styles.compactMeta}>Store logo: Used in storefront header, packing slips, and default customer email branding.</p>
              <p className={styles.compactMeta}>Favicon: Used in browser tabs and storefront metadata.</p>
              <p className={styles.compactMeta}>Theme customization is locked for private beta.</p>
            </AdminCard>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={styles.brandFieldGrid}>
                {renderAssetUploadField({ field: 'logoUrl', label: 'Store logo', refObject: logoUploadRef })}
                {renderAssetUploadField({ field: 'faviconUrl', label: 'Favicon', refObject: faviconUploadRef })}
              </div>
              <p className={styles.compactMeta}>Store logo: Used in storefront header, packing slips, and default customer email branding.</p>
              <p className={styles.compactMeta}>Favicon: Used in browser tabs and storefront metadata.</p>
              <div className={styles.compactActionRow}>
                <AdminButton className={styles.advancedToggle} onClick={() => setShowAdvancedUrls((current) => !current)} size="sm" variant="secondary">
                  {showAdvancedUrls ? 'Hide URL fallback' : 'Use URL fallback instead'}
                </AdminButton>
              </div>
              {showAdvancedUrls ? (
                <div className={styles.brandFieldGrid}>
                  <label className={styles.field}>
                    <span>Store logo URL</span>
                    <AdminInput className={styles.input} onChange={(event) => handleBrandKitPatch({ logoUrl: event.target.value })} value={brandKit?.logoUrl || ''} />
                  </label>
                  <label className={styles.field}>
                    <span>Favicon URL</span>
                    <AdminInput className={styles.input} onChange={(event) => handleBrandKitPatch({ faviconUrl: event.target.value })} value={brandKit?.faviconUrl || ''} />
                  </label>
                </div>
              ) : null}
            </AdminCard>
          </div>
        ) : null}

        {activeBrandDrawer === BRAND_DRAWER.CHECKOUT_BRANDING ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Checkout logo</h4>
              </div>
              <div className={styles.brandFieldGrid}>
                {renderAssetUploadField({ field: 'checkoutLogoUrl', label: 'Checkout logo', refObject: checkoutLogoUploadRef })}
              </div>
              <p className={styles.compactMeta}>Checkout logo: Used in checkout only.</p>
              <p className={styles.compactMeta}>Checkout colors are locked to frontend beta-safe tokens for readability.</p>
            </AdminCard>
          </div>
        ) : null}

        {activeBrandDrawer === BRAND_DRAWER.EMAIL_BRANDING ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Email visual defaults</h4>
              </div>
              <div className={styles.brandFieldGrid}>
                {renderAssetUploadField({ field: 'emailLogoUrl', label: 'Email logo', refObject: emailLogoUploadRef })}
                <label className={styles.field}>
                  <span>Email footer text</span>
                  <AdminInput className={styles.input} onChange={(event) => handleBrandKitPatch({ emailFooterText: event.target.value })} value={brandKit?.emailFooterText || ''} />
                </label>
              </div>
              <p className={styles.compactMeta}>Email logo: Used in customer emails only.</p>
              <div className={styles.compactActionRow}>
                <AdminButton asChild size="sm" variant="ghost">
                  <Link href="/admin/settings?section=email">Open email templates</Link>
                </AdminButton>
              </div>
            </AdminCard>
          </div>
        ) : null}

        {activeBrandDrawer === BRAND_DRAWER.SOCIAL_LINKS ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Social links</h4>
              </div>
              <div className={styles.brandFieldGrid}>
                <label className={styles.field}>
                  <span>Instagram URL</span>
                  <AdminInput className={styles.input} onChange={(event) => handleBrandKitPatch({ instagramUrl: event.target.value })} value={brandKit?.instagramUrl || ''} />
                </label>
                <label className={styles.field}>
                  <span>Facebook URL</span>
                  <AdminInput className={styles.input} onChange={(event) => handleBrandKitPatch({ facebookUrl: event.target.value })} value={brandKit?.facebookUrl || ''} />
                </label>
                <label className={styles.field}>
                  <span>TikTok URL</span>
                  <AdminInput className={styles.input} onChange={(event) => handleBrandKitPatch({ tiktokUrl: event.target.value })} value={brandKit?.tiktokUrl || ''} />
                </label>
                <label className={styles.field}>
                  <span>YouTube URL</span>
                  <AdminInput className={styles.input} onChange={(event) => handleBrandKitPatch({ youtubeUrl: event.target.value })} value={brandKit?.youtubeUrl || ''} />
                </label>
              </div>
              <p className={styles.compactMeta}>Social links: Used in storefront footer and email footer where supported.</p>
            </AdminCard>
          </div>
        ) : null}
      </AdminDrawer>
      <AdminDrawer
        onClose={closeTaxDrawer}
        open={Boolean(activeTaxDrawer)}
        subtitle={
          activeTaxDrawer === TAX_DRAWER.COLLECTION
            ? 'Configure how Doopify calculates tax at checkout.'
            : activeTaxDrawer === TAX_DRAWER.REGIONS
              ? 'Manage manual tax regions and rule-level overrides.'
              : 'Tax settings details.'
        }
        title={
          activeTaxDrawer === TAX_DRAWER.COLLECTION
            ? 'Tax collection'
            : activeTaxDrawer === TAX_DRAWER.REGIONS
              ? 'Tax regions'
              : 'Taxes & duties'
        }
      >
        {activeTaxDrawer === TAX_DRAWER.COLLECTION ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Tax collection</h4>
              </div>
              <p className={styles.compactMeta}>Configure how Doopify calculates tax at checkout.</p>
              <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                <label className={styles.checkboxField}>
                  <AdminInput
                    checked={taxSettings.enabled}
                    onChange={(event) => patchTaxSettings({ enabled: event.target.checked })}
                    className={styles.settingsCheckbox} type="checkbox"
                  />
                  <span>Enable tax collection</span>
                </label>
                <p className={styles.compactMeta}>Adds tax during checkout using your manual tax rules.</p>
                <label className={styles.field}>
                  <span>Strategy</span>
                  <AdminSelect
                    className={styles.input}
                    disabled
                    onChange={(nextValue) => patchTaxSettings({ strategy: nextValue })}
                    options={TAX_STRATEGY_OPTIONS}
                    value={taxSettings.strategy}
                  />
                </label>
                <p className={styles.compactMeta}>Manual uses the rates you configure in Doopify. Automated tax is coming later.</p>
                <label className={styles.field}>
                  <span>Manual tax rate (%)</span>
                  <AdminInput
                    className={styles.input}
                    onChange={(event) => patchTaxSettings({ defaultTaxRatePercent: event.target.value })}
                    value={taxSettings.defaultTaxRatePercent}
                  />
                </label>
                <p className={styles.compactMeta}>Default rate used when no region-specific rule matches.</p>
                <label className={styles.checkboxField}>
                  <AdminInput
                    checked={taxSettings.taxShipping}
                    onChange={(event) => patchTaxSettings({ taxShipping: event.target.checked })}
                    className={styles.settingsCheckbox} type="checkbox"
                  />
                  <span>Tax shipping</span>
                </label>
                <p className={styles.compactMeta}>Applies tax to shipping charges when enabled.</p>
                <label className={styles.checkboxField}>
                  <AdminInput
                    checked={taxSettings.pricesIncludeTax}
                    onChange={(event) => patchTaxSettings({ pricesIncludeTax: event.target.checked })}
                    className={styles.settingsCheckbox} type="checkbox"
                  />
                  <span>Prices include tax</span>
                </label>
                <p className={styles.compactMeta}>Use only if product prices already include tax.</p>
              </div>
              {taxSettingsFormError ? <p className={styles.statusText}>{taxSettingsFormError}</p> : null}
              <div className={styles.compactActionRow}>
                <AdminButton disabled={taxSettingsSaving} onClick={handleSaveTaxSettings} size="sm" variant="secondary">
                  {taxSettingsSaveState === 'saving'
                    ? 'Saving...'
                    : taxSettingsSaveState === 'saved'
                      ? 'Saved'
                      : taxSettingsSaveState === 'failed'
                        ? 'Failed'
                        : 'Save tax collection'}
                </AdminButton>
              </div>
            </AdminCard>
          </div>
        ) : null}

        {activeTaxDrawer === TAX_DRAWER.REGIONS ? (
          <div className={styles.drawerStack}>
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Add tax rule</h4>
              </div>
              <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                <label className={styles.field}>
                  <span>Rule name</span>
                  <AdminInput className={styles.input} onChange={(event) => setNewTaxRule((current) => ({ ...current, name: event.target.value }))} value={newTaxRule.name} />
                </label>
                <label className={styles.field}>
                  <span>Country code</span>
                  <AdminInput className={styles.input} onChange={(event) => setNewTaxRule((current) => ({ ...current, countryCode: event.target.value }))} value={newTaxRule.countryCode} />
                </label>
                <label className={styles.field}>
                  <span>State/Province code</span>
                  <AdminInput className={styles.input} onChange={(event) => setNewTaxRule((current) => ({ ...current, provinceCode: event.target.value }))} value={newTaxRule.provinceCode} />
                </label>
                <label className={styles.field}>
                  <span>Tax rate (%)</span>
                  <AdminInput className={styles.input} onChange={(event) => setNewTaxRule((current) => ({ ...current, ratePercent: event.target.value }))} value={newTaxRule.ratePercent} />
                </label>
                <label className={styles.field}>
                  <span>Priority</span>
                  <AdminInput className={styles.input} onChange={(event) => setNewTaxRule((current) => ({ ...current, priority: event.target.value }))} value={newTaxRule.priority} />
                </label>
                <label className={styles.checkboxField}>
                  <AdminInput checked={newTaxRule.isActive} onChange={(event) => setNewTaxRule((current) => ({ ...current, isActive: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
                  <span>Active</span>
                </label>
              </div>
              <div className={styles.compactActionRow}>
                <AdminButton onClick={handleCreateTaxRule} size="sm" variant="secondary">
                  Add tax rule
                </AdminButton>
              </div>
            </AdminCard>

            {taxRules.map((rule) => (
              <AdminCard as="section" className={styles.compactDrawerCard} key={rule.id} variant="card">
                <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                  <h4>{rule.name || 'Tax rule'}</h4>
                </div>
                <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
                  <label className={styles.field}>
                    <span>Rule name</span>
                    <AdminInput className={styles.input} onChange={(event) => updateTaxRuleDraft(rule.id, { name: event.target.value })} value={rule.name} />
                  </label>
                  <label className={styles.field}>
                    <span>Country code</span>
                    <AdminInput className={styles.input} onChange={(event) => updateTaxRuleDraft(rule.id, { countryCode: event.target.value })} value={rule.countryCode} />
                  </label>
                  <label className={styles.field}>
                    <span>State/Province code</span>
                    <AdminInput className={styles.input} onChange={(event) => updateTaxRuleDraft(rule.id, { provinceCode: event.target.value })} value={rule.provinceCode} />
                  </label>
                  <label className={styles.field}>
                    <span>Tax rate (%)</span>
                    <AdminInput className={styles.input} onChange={(event) => updateTaxRuleDraft(rule.id, { ratePercent: event.target.value })} value={rule.ratePercent} />
                  </label>
                  <label className={styles.field}>
                    <span>Priority</span>
                    <AdminInput className={styles.input} onChange={(event) => updateTaxRuleDraft(rule.id, { priority: event.target.value })} value={rule.priority} />
                  </label>
                  <label className={styles.checkboxField}>
                    <AdminInput checked={rule.isActive} onChange={(event) => updateTaxRuleDraft(rule.id, { isActive: event.target.checked })} className={styles.settingsCheckbox} type="checkbox" />
                    <span>Active</span>
                  </label>
                </div>
                <div className={styles.compactActionRow}>
                  <AdminButton onClick={() => handleSaveTaxRule(rule)} size="sm" variant="secondary">
                    Save tax rule
                  </AdminButton>
                  <AdminButton onClick={() => handleDeleteTaxRule(rule.id)} size="sm" variant="danger">
                    Delete tax rule
                  </AdminButton>
                </div>
              </AdminCard>
            ))}
          </div>
        ) : null}
      </AdminDrawer>
      <AdminDrawer
        onClose={closeEmailTemplateDrawer}
        open={Boolean(activeEmailTemplate)}
        subtitle={activeEmailTemplate?.editable ? 'Edit subject, content, and preview.' : 'Template status and trigger.'}
        title={activeEmailTemplate ? `${activeEmailTemplate.label}` : 'Customer email template'}
      >
        {activeEmailTemplate ? (
          <div className={styles.drawerStack}>
            {/* Status card shown for all templates */}
            <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
              <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                <h4>Template status</h4>
                <AdminStatusChip tone={activeEmailTemplate.statusTone}>{activeEmailTemplate.statusLabel}</AdminStatusChip>
              </div>
              <p className={styles.compactMeta}>
                <strong>Trigger:</strong> {activeEmailTemplate.triggerLabel}
              </p>
              {activeEmailTemplate.editorStateLabel ? (
                <p className={styles.compactMeta}>{activeEmailTemplate.editorStateLabel}</p>
              ) : null}
            </AdminCard>

            {/* Real editor — only for editable templates */}
            {activeEmailTemplate.editable ? (
              <>
                {templateEditorLoading ? (
                  <div className={styles.statusBlock}>
                    <div className={styles.loadingLine} />
                    <div className={styles.loadingLine} />
                    <p className={styles.statusText}>Loading template...</p>
                  </div>
                ) : (
                  <>
                    <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
                      <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
                        <h4>Enabled</h4>
                        <AdminStatusChip tone={templateEditorDraft.enabled ? 'success' : 'neutral'}>
                          {templateEditorDraft.enabled ? 'On' : 'Off'}
                        </AdminStatusChip>
                      </div>
                      <p className={styles.compactMeta}>When disabled, this email type will not be sent. Orders and payments are not affected.</p>
                      <div className={styles.compactActionRow}>
                        <AdminButton
                          onClick={() => setTemplateEditorDraft((d) => ({ ...d, enabled: !d.enabled }))}
                          size="sm"
                          variant="secondary"
                        >
                          {templateEditorDraft.enabled ? 'Disable' : 'Enable'}
                        </AdminButton>
                      </div>
                    </AdminCard>

                    <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
                      <h4>Email content</h4>
                      <div className={styles.drawerFormGrid}>
                        <AdminField hint="Appears in the recipient's inbox subject line." label="Subject">
                          <AdminInput
                            onChange={(e) => setTemplateEditorDraft((d) => ({ ...d, subject: e.target.value }))}
                            placeholder="Your order {{orderNumber}} is confirmed"
                            value={templateEditorDraft.subject}
                          />
                        </AdminField>
                        <AdminField hint="Short preview text shown below the subject in some email clients." label="Preview text">
                          <AdminInput
                            onChange={(e) => setTemplateEditorDraft((d) => ({ ...d, preheader: e.target.value }))}
                            placeholder="Thank you for your purchase."
                            value={templateEditorDraft.preheader}
                          />
                        </AdminField>
                        <AdminField hint="Large heading shown at the top of the email body." label="Header title">
                          <AdminInput
                            onChange={(e) => setTemplateEditorDraft((d) => ({ ...d, headerTitle: e.target.value }))}
                            placeholder="Order confirmation"
                            value={templateEditorDraft.headerTitle}
                          />
                        </AdminField>
                        <AdminField hint="Main message below the heading." label="Body message">
                          <AdminTextarea
                            onChange={(e) => setTemplateEditorDraft((d) => ({ ...d, bodyText: e.target.value }))}
                            placeholder="Thanks for your order! We'll email you when it ships."
                            rows={4}
                            value={templateEditorDraft.bodyText}
                          />
                        </AdminField>
                        <AdminField hint="Label on the primary call-to-action button." label="Button label">
                          <AdminInput
                            onChange={(e) => setTemplateEditorDraft((d) => ({ ...d, buttonLabel: e.target.value }))}
                            placeholder="View order"
                            value={templateEditorDraft.buttonLabel}
                          />
                        </AdminField>
                        <AdminField hint="Text shown at the bottom of the email." label="Footer note">
                          <AdminInput
                            onChange={(e) => setTemplateEditorDraft((d) => ({ ...d, footerText: e.target.value }))}
                            placeholder="Thank you for choosing us."
                            value={templateEditorDraft.footerText}
                          />
                        </AdminField>
                        <AdminField hint="Optional. Leave blank to use the store reply-to address." label="Reply-to email">
                          <AdminInput
                            onChange={(e) => setTemplateEditorDraft((d) => ({ ...d, replyToEmail: e.target.value }))}
                            placeholder="support@example.com"
                            type="email"
                            value={templateEditorDraft.replyToEmail}
                          />
                        </AdminField>
                      </div>
                    </AdminCard>

                    <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
                      <h4>Available variables</h4>
                      <p className={styles.compactMeta}>Use these in subject, preview text, header, body, button, and footer fields.</p>
                      <div className={styles.warningTagList}>
                        {TEMPLATE_VARIABLES.map((v) => (
                          <AdminTooltip content={v.description} key={v.key}>
                            <AdminStatusChip tone="neutral">{v.key}</AdminStatusChip>
                          </AdminTooltip>
                        ))}
                      </div>
                    </AdminCard>

                    <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
                      <h4>Preview</h4>
                      <p className={styles.compactMeta}>Live preview uses sample order data. Branding inherits from store settings.</p>
                      <div className={styles.setupFixText} style={{ fontSize: '12px', lineHeight: 1.5 }}>
                        <p><strong>Subject:</strong> {templateEditorDraft.subject || '(empty)'}</p>
                        <p><strong>Header:</strong> {templateEditorDraft.headerTitle || '(empty)'}</p>
                        <p><strong>Body:</strong> {templateEditorDraft.bodyText || '(empty)'}</p>
                        <p><strong>Button:</strong> {templateEditorDraft.buttonLabel || '(empty)'}</p>
                        <p><strong>Footer:</strong> {templateEditorDraft.footerText || '(empty)'}</p>
                      </div>
                    </AdminCard>

                    <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
                      <h4>Send test email</h4>
                      <p className={styles.compactMeta}>Sends a test with sample order data. Does not create real orders or payments.</p>
                      <div className={styles.drawerFormGrid}>
                        <AdminField label="Recipient email">
                          <AdminInput
                            onChange={(e) => setTemplateEditorSendTo(e.target.value)}
                            placeholder="you@example.com"
                            type="email"
                            value={templateEditorSendTo}
                          />
                        </AdminField>
                      </div>
                      {templateEditorSendResult ? (
                        <p className={styles.compactMeta}>
                          {templateEditorSendResult.sent
                            ? `Test sent via ${templateEditorSendResult.provider}.`
                            : templateEditorSendResult.error || 'Send did not complete.'}
                        </p>
                      ) : null}
                      <div className={styles.compactActionRow}>
                        <AdminButton
                          disabled={templateEditorSendState === 'sending' || !templateEditorSendTo.trim()}
                          onClick={handleSendTestEmail}
                          size="sm"
                          variant="secondary"
                        >
                          {templateEditorSendState === 'sending' ? 'Sending...' : 'Send test'}
                        </AdminButton>
                      </div>
                    </AdminCard>

                    {templateEditorError ? (
                      <p className={styles.statusText} style={{ color: 'var(--color-danger, #dc2626)' }}>{templateEditorError}</p>
                    ) : null}

                    <div className={styles.compactActionRow}>
                      <AdminButton
                        disabled={templateEditorSaving}
                        onClick={handleSaveEmailTemplate}
                        size="sm"
                        variant="primary"
                      >
                        {templateEditorSaving ? 'Saving...' : 'Save template'}
                      </AdminButton>
                      <AdminButton
                        disabled={templateEditorSaving}
                        onClick={handleResetEmailTemplate}
                        size="sm"
                        variant="ghost"
                      >
                        Reset to defaults
                      </AdminButton>
                      <AdminButton asChild size="sm" variant="ghost">
                        <Link href="/admin/webhooks">View delivery logs</Link>
                      </AdminButton>
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </AdminDrawer>
      <SettingsToastViewport onDismiss={dismissSettingsToast} toasts={settingsToasts} />
    </AppShell>
  );
}





