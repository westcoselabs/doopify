"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useCart } from '@/context/CartContext';
import {
  isCheckoutEmailValid,
  normalizeCheckoutEmail,
} from './checkout-create.helpers';

const EMPTY_ADDRESS = {
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'US',
  phone: '',
};

type AddressForm = typeof EMPTY_ADDRESS

type AddressPayload = {
  firstName: string
  lastName: string
  company?: string
  address1: string
  address2?: string
  city: string
  province?: string
  postalCode: string
  country: string
  phone?: string
}

type CartItem = {
  variantId: string
  productId?: string
  title: string
  variantTitle?: string
  quantity: number
  price: number
  image?: string
}

type ShippingQuote = {
  id: string
  selectedShippingQuoteId?: string
  displayName: string
  source?: string
  carrier?: string
  service?: string
  amount: number
  currency?: string
  estimatedDays?: number | null
  amountCents?: number
}

type CheckoutStoreSettings = {
  name?: string
  currency?: string
  logoUrl?: string
  checkoutLogoUrl?: string
}

type DiscountApplication = {
  code?: string
}

type CheckoutData = {
  clientSecret: string
  currency?: string
  subtotal: number
  shippingAmount?: number
  taxAmount: number
  total: number
  discountAmount: number
  discountApplications?: DiscountApplication[]
  selectedShippingRate?: ShippingQuote
  availableShippingRates?: ShippingQuote[]
}

type RecoverCheckoutData = {
  email?: string
  shippingAddress?: Partial<AddressForm>
  billingAddress?: Partial<AddressForm>
  items?: CartItem[]
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

type StripePaymentResult = {
  error?: { message?: string } | null
  paymentIntent?: { id?: string } | null
}

type StripePaymentElement = {
  mount: (selectorOrElement: string | Element) => void
  unmount: () => void
}

type StripeElementsSubmitResult = {
  error?: { message?: string } | null
}

type StripeElements = {
  create: (type: 'payment', options: { layout: 'accordion' }) => StripePaymentElement
  submit: () => Promise<StripeElementsSubmitResult>
}

type StripeClient = {
  elements: (options: {
    clientSecret: string
    appearance: {
      theme: 'night'
      variables: Record<string, string>
      rules?: Record<string, Record<string, string>>
    }
  }) => StripeElements
  confirmPayment: (options: {
    elements: StripeElements
    clientSecret: string
    confirmParams: { return_url: string }
    redirect: 'if_required'
  }) => Promise<StripePaymentResult>
}

type StripeConstructor = (publishableKey: string) => StripeClient | null

declare global {
  interface Window {
    Stripe?: StripeConstructor
  }
}

type CartContextValue = {
  items: CartItem[]
  total: number
  replaceItems: (items: CartItem[]) => void
  removeItem: (variantId: string) => void
  updateQuantity: (variantId: string, quantity: number) => void
}

type CheckoutClientPageProps = {
  publishableKey: string
  store: CheckoutStoreSettings | null
  recoveryToken: string
}

function loadStripeJs(): Promise<StripeConstructor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Stripe.js can only load in the browser'))
  }

  if (window.Stripe) {
    return Promise.resolve(window.Stripe)
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-stripe-js="true"]')
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.Stripe) {
          resolve(window.Stripe)
          return
        }

        reject(new Error('Failed to load Stripe.js'))
      })
      existing.addEventListener('error', () => reject(new Error('Failed to load Stripe.js')))
      return
    }

    const script = document.createElement('script')
    script.src = 'https://js.stripe.com/v3/'
    script.async = true
    script.dataset.stripeJs = 'true'
    script.onload = () => {
      if (window.Stripe) {
        resolve(window.Stripe)
        return
      }

      reject(new Error('Failed to load Stripe.js'))
    }
    script.onerror = () => reject(new Error('Failed to load Stripe.js'))
    document.head.appendChild(script)
  })
}

function getApiErrorMessage<TData>(payload: ApiResponse<TData> | null, fallback: string): string {
  if (payload && !payload.success && payload.error) {
    return payload.error
  }

  return fallback
}

function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount || 0)
}

function buildAddressPayload(address: AddressForm): AddressPayload {
  return {
    firstName: address.firstName.trim(),
    lastName: address.lastName.trim(),
    company: address.company.trim() || undefined,
    address1: address.address1.trim(),
    address2: address.address2.trim() || undefined,
    city: address.city.trim(),
    province: address.province.trim() || undefined,
    postalCode: address.postalCode.trim(),
    country: address.country.trim(),
    phone: address.phone.trim() || undefined,
  }
}

function buildCheckoutItemsPayload(items: CartItem[]): Array<{ variantId: string; quantity: number }> {
  return items.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
  }));
}

function isAddressComplete(address: AddressForm): boolean {
  return Boolean(
    address.firstName.trim() &&
    address.lastName.trim() &&
    address.address1.trim() &&
    address.city.trim() &&
    address.postalCode.trim() &&
    address.country.trim()
  )
}

function resolveCheckoutLogo(store: CheckoutStoreSettings | null): string {
  return store?.checkoutLogoUrl || store?.logoUrl || '';
}

const CHECKOUT_BUTTON_BASE_STYLE = {
  borderRadius: 'var(--checkout-button-radius)',
  textTransform: 'var(--checkout-button-transform)',
} as const;

const CHECKOUT_BUTTON_READY_STYLE = {
  background: 'var(--checkout-button-bg)',
  color: 'var(--checkout-button-text)',
  border: '1px solid var(--checkout-button-border)',
} as const;

const STRIPE_BETA_APPEARANCE = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#9fb4ff',
    colorBackground: '#15171d',
    colorText: '#f8f8fb',
    colorTextSecondary: '#b5bcc9',
    colorTextPlaceholder: '#949db0',
    colorIcon: '#d3d9e6',
    colorIconCardError: '#ef4444',
    colorDanger: '#ef4444',
    colorSuccess: '#34d399',
    colorBorder: '#3b4051',
    colorInputBackground: '#0f1117',
    borderRadius: '16px',
    spacingUnit: '4px',
    fontSizeBase: '16px',
  },
  rules: {
    '.Label': {
      color: '#f2f4f8',
      fontSize: '14px',
      marginBottom: '6px',
    },
    '.Input': {
      color: '#f8f8fb',
      backgroundColor: '#0f1117',
      border: '1px solid #3b4051',
      boxShadow: 'none',
    },
    '.Input::placeholder': {
      color: '#949db0',
    },
    '.Input:focus': {
      border: '1px solid #9fb4ff',
      boxShadow: '0 0 0 1px rgba(159,180,255,0.48)',
    },
    '.Tab': {
      color: '#e9ecf5',
      backgroundColor: '#111319',
      border: '1px solid #3b4051',
    },
    '.Tab--selected': {
      color: '#0f1117',
      backgroundColor: '#dfe5f5',
      borderColor: '#dfe5f5',
    },
    '.AccordionItem': {
      backgroundColor: '#111319',
      border: '1px solid #2f3443',
    },
    '.AccordionItem:hover': {
      border: '1px solid #4c5470',
    },
    '.Error': {
      color: '#fca5a5',
    },
  },
} as const;

export default function CheckoutClientPage({ publishableKey, store, recoveryToken }: CheckoutClientPageProps) {
  const router = useRouter();
  const { items, total: cartSubtotal, replaceItems, removeItem, updateQuantity } = useCart() as CartContextValue;
  const [email, setEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState(EMPTY_ADDRESS);
  const [billingAddress, setBillingAddress] = useState(EMPTY_ADDRESS);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [checkout, setCheckout] = useState<CheckoutData | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [error, setError] = useState('');
  const [paymentReady, setPaymentReady] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountError, setDiscountError] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [selectedShippingQuoteId, setSelectedShippingQuoteId] = useState('');
  const [shippingRatesLoading, setShippingRatesLoading] = useState(false);
  const [shippingRatesError, setShippingRatesError] = useState('');

  const stripeRef = useRef<StripeClient | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);
  const mountedClientSecretRef = useRef<string | null>(null);
  const lastRecoveredTokenRef = useRef<string | null>(null);
  const lastCartSignatureRef = useRef('');
  const lastAddressSignatureRef = useRef('');
  const lastShippingSelectionRef = useRef('');

  const currency = checkout?.currency || store?.currency || 'USD';
  const checkoutLogo = resolveCheckoutLogo(store);
  const brandButtonBaseStyle = CHECKOUT_BUTTON_BASE_STYLE;
  const lineCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );
  const selectedShippingQuote = useMemo(
    () =>
      shippingQuotes.find((quote) => (quote.selectedShippingQuoteId || quote.id) === selectedShippingQuoteId) ||
      null,
    [shippingQuotes, selectedShippingQuoteId]
  );
  const previewSubtotal = checkout?.subtotal ?? cartSubtotal;
  const previewShipping = checkout?.shippingAmount ?? selectedShippingQuote?.amount ?? null;
  const previewTotal = checkout?.total ?? (previewSubtotal + (selectedShippingQuote?.amount || 0));
  const shippingAddressValid = isAddressComplete(shippingAddress);
  const billingAddressValid = billingSameAsShipping || isAddressComplete(billingAddress);
  const cartSignature = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          price: item.price,
        }))
      ),
    [items]
  );
  const addressSignature = useMemo(
    () =>
      JSON.stringify({
        shippingAddress,
        billingAddress,
        billingSameAsShipping,
      }),
    [billingAddress, billingSameAsShipping, shippingAddress]
  );
  const checkoutInitializationFailed = Boolean(error && !paymentReady);
  const normalizedEmail = normalizeCheckoutEmail({ stateEmail: email });
  const emailIsValid = isCheckoutEmailValid(normalizedEmail);
  const reviewPaymentDisabledReason = (() => {
    if (creatingIntent) return 'Preparing secure payment form...';
    if (!items.length) return 'Your cart is empty.';
    if (!normalizedEmail) return 'Enter your email before continuing.';
    if (!emailIsValid) return 'Enter a valid email address before continuing.';
    if (!shippingAddressValid || !billingAddressValid) {
      return 'Enter a valid shipping and billing address before continuing.';
    }
    if (!selectedShippingQuoteId) return 'Select a shipping method before continuing.';
    if (checkoutInitializationFailed) return 'Checkout initialization failed. Fix the error above and try again.';
    if (checkout && !paymentReady) return 'Payment form is still loading. Please wait a moment.';
    return '';
  })();
  const reviewButtonState =
    creatingIntent
      ? 'loading'
      : reviewPaymentDisabledReason
        ? checkoutInitializationFailed
          ? 'error-blocked'
          : 'disabled'
        : 'ready';
  const orderEditingLocked = creatingIntent || confirmingPayment;

  useEffect(() => {
    if (!recoveryToken || recoveryToken === lastRecoveredTokenRef.current) return;

    let isCancelled = false;

    async function loadRecoveryCheckout() {
      setRecoveryNotice('');
      setError('');
      setDiscountError('');
      setShippingRatesError('');
      resetShippingSelection();
      if (checkout) {
        resetPaymentStep();
      }

      try {
        const response = await fetch(`/api/checkout/recover?token=${encodeURIComponent(recoveryToken)}`, {
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as ApiResponse<RecoverCheckoutData> | null;
        if (!response.ok || !payload?.success) {
          throw new Error(getApiErrorMessage(payload, 'Checkout recovery link is invalid or expired'));
        }

        if (isCancelled) return;

        const recoveredCheckout = payload.data;
        setEmail(recoveredCheckout.email || '');
        setShippingAddress((current) => ({ ...current, ...(recoveredCheckout.shippingAddress || {}) }));
        setBillingAddress((current) => ({ ...current, ...(recoveredCheckout.billingAddress || recoveredCheckout.shippingAddress || {}) }));
        setBillingSameAsShipping(false);
        replaceItems(
          (recoveredCheckout.items || []).map((item) => ({
            variantId: item.variantId,
            productId: item.productId,
            title: item.title,
            variantTitle: item.variantTitle,
            quantity: item.quantity,
            price: item.price,
          }))
        );
        setRecoveryNotice('Your abandoned checkout has been restored. Review details and continue to payment.');
        lastRecoveredTokenRef.current = recoveryToken;
      } catch (recoveryError) {
        if (isCancelled) return;
        const message = recoveryError instanceof Error ? recoveryError.message : 'Checkout recovery failed';
        setError(message);
        lastRecoveredTokenRef.current = recoveryToken;
      }
    }

    void loadRecoveryCheckout();

    return () => {
      isCancelled = true;
    };
  }, [recoveryToken, replaceItems]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!checkout) {
      lastCartSignatureRef.current = cartSignature;
      return;
    }

    if (lastCartSignatureRef.current && lastCartSignatureRef.current !== cartSignature) {
      resetPaymentStep();
    }
    lastCartSignatureRef.current = cartSignature;
  }, [cartSignature, checkout]);

  useEffect(() => {
    if (!checkout) {
      lastAddressSignatureRef.current = addressSignature;
      return;
    }

    if (lastAddressSignatureRef.current && lastAddressSignatureRef.current !== addressSignature) {
      resetPaymentStep();
    }
    lastAddressSignatureRef.current = addressSignature;
  }, [addressSignature, checkout]);

  useEffect(() => {
    if (!checkout) {
      lastShippingSelectionRef.current = selectedShippingQuoteId;
      return;
    }

    if (lastShippingSelectionRef.current && lastShippingSelectionRef.current !== selectedShippingQuoteId) {
      resetPaymentStep();
    }
    lastShippingSelectionRef.current = selectedShippingQuoteId;
  }, [checkout, selectedShippingQuoteId]);

  function resetPaymentStep() {
    if (paymentElementRef.current) {
      paymentElementRef.current.unmount();
      paymentElementRef.current = null;
    }

    stripeRef.current = null;
    elementsRef.current = null;
    mountedClientSecretRef.current = null;
    setCheckout(null);
    setPaymentReady(false);
  }

  function resetShippingSelection() {
    setShippingQuotes([]);
    setSelectedShippingQuoteId('');
    setShippingRatesError('');
  }

  function updateShippingField(field: keyof AddressForm, value: string) {
    if (checkout) resetPaymentStep();
    if (shippingQuotes.length || selectedShippingQuoteId || shippingRatesError) {
      resetShippingSelection();
    }
    setShippingAddress((current) => ({ ...current, [field]: value }));
  }

  function updateBillingField(field: keyof AddressForm, value: string) {
    if (checkout) resetPaymentStep();
    setBillingAddress((current) => ({ ...current, [field]: value }));
  }

  function handleOrderQuantityChange(variantId: string, nextQuantity: number) {
    if (checkout) resetPaymentStep();
    if (shippingQuotes.length || selectedShippingQuoteId || shippingRatesError) {
      resetShippingSelection();
    }
    setError('');
    setDiscountError('');
    updateQuantity(variantId, nextQuantity);
  }

  function handleOrderItemRemove(variantId: string) {
    if (checkout) resetPaymentStep();
    if (shippingQuotes.length || selectedShippingQuoteId || shippingRatesError) {
      resetShippingSelection();
    }
    setError('');
    setDiscountError('');
    removeItem(variantId);
  }

  async function loadShippingRates() {
    setShippingRatesError('');
    setDiscountError('');
    setError('');

    if (!items.length) {
      setShippingRatesError('Your cart is empty.');
      return;
    }

    if (!isAddressComplete(shippingAddress)) {
      setShippingRatesError('Complete the shipping address to load shipping options.');
      return;
    }

    setShippingRatesLoading(true);
    try {
      const response = await fetch('/api/checkout/shipping-rates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: buildCheckoutItemsPayload(items),
          shippingAddress: buildAddressPayload(shippingAddress),
        }),
      });

      const payload = (await response.json().catch(() => null)) as ApiResponse<{ quotes?: ShippingQuote[] }> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Failed to load shipping options'));
      }

      const quotes = Array.isArray(payload?.data?.quotes) ? payload.data.quotes : [];
      if (!quotes.length) {
        throw new Error('No shipping options are available for this address');
      }

      setShippingQuotes(quotes);
      setSelectedShippingQuoteId((current) => {
        if (current && quotes.some((quote) => (quote.selectedShippingQuoteId || quote.id) === current)) {
          return current;
        }
        return quotes[0].selectedShippingQuoteId || quotes[0].id;
      });
    } catch (shippingError) {
      resetShippingSelection();
      const message = shippingError instanceof Error ? shippingError.message : 'Failed to load shipping options';
      setShippingRatesError(message);
    } finally {
      setShippingRatesLoading(false);
    }
  }

  async function initializePaymentElement(clientSecret: string) {
    const StripeConstructor = await loadStripeJs();
    if (!StripeConstructor) {
      throw new Error('Stripe.js was not available after loading')
    }

    const stripe = StripeConstructor(publishableKey);
    if (!stripe) {
      throw new Error('Stripe could not be initialized with the publishable key')
    }

    const elements = stripe.elements({
      clientSecret,
      appearance: STRIPE_BETA_APPEARANCE,
    });

    const paymentContainer = document.getElementById('payment-element');
    if (!paymentContainer) {
      throw new Error('Payment form container was not available. Please try again.');
    }

    if (paymentElementRef.current) {
      paymentElementRef.current.unmount();
      paymentElementRef.current = null;
    }

    const paymentElement = elements.create('payment', {
      layout: 'accordion',
    });

    paymentElement.mount(paymentContainer);
    stripeRef.current = stripe;
    elementsRef.current = elements;
    paymentElementRef.current = paymentElement;
    mountedClientSecretRef.current = clientSecret;
    setPaymentReady(true);
  }

  useEffect(() => {
    const clientSecret = checkout?.clientSecret;
    if (typeof clientSecret !== 'string' || !clientSecret || !publishableKey) return;
    const clientSecretToMount: string = clientSecret;
    if (mountedClientSecretRef.current === clientSecretToMount && paymentElementRef.current) return;

    let cancelled = false;

    async function mountPaymentElementWhenReady() {
      if (!document.getElementById('payment-element')) {
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          void mountPaymentElementWhenReady();
        });
        return;
      }

      try {
        await initializePaymentElement(clientSecretToMount);
      } catch (mountError) {
        if (cancelled) return;
        const message = mountError instanceof Error ? mountError.message : 'Failed to load payment form';
        setError(message);
      }
    }

    void mountPaymentElementWhenReady();

    return () => {
      cancelled = true;
    };
  }, [checkout?.clientSecret, publishableKey]);

  async function handleCreateIntent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setDiscountError('');
    const formEmail = new FormData(event.currentTarget).get('email');
    const resolvedEmail = normalizeCheckoutEmail({
      stateEmail: email,
      formEmail,
    });

    if (!publishableKey) {
      setError('Stripe is not configured yet. Verify Stripe in Settings -> Payments or set env fallback keys.');
      return;
    }

    if (!items.length) {
      setError('Your cart is empty.');
      return;
    }

    if (!resolvedEmail) {
      setError('Email is required.');
      return;
    }

    if (!isCheckoutEmailValid(resolvedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (resolvedEmail !== email.trim()) {
      setEmail(resolvedEmail);
    }

    if (!isAddressComplete(shippingAddress)) {
      setError('Please complete the shipping address before continuing.');
      return;
    }

    if (!billingSameAsShipping && !isAddressComplete(billingAddress)) {
      setError('Please complete the billing address before continuing.');
      return;
    }

    if (!selectedShippingQuoteId) {
      setError('Select a shipping option before continuing to payment.');
      return;
    }

    setCreatingIntent(true);

    try {
      const response = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: resolvedEmail,
          items: buildCheckoutItemsPayload(items),
          shippingAddress: buildAddressPayload(shippingAddress),
          billingAddress: billingSameAsShipping ? buildAddressPayload(shippingAddress) : buildAddressPayload(billingAddress),
          ...(showDiscount && discountCode.trim() ? { discountCode: discountCode.trim() } : {}),
          selectedShippingQuoteId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ApiResponse<CheckoutData> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Failed to start checkout'));
      }

      setCheckout(payload.data);
      if (payload.data?.selectedShippingRate?.id) {
        setSelectedShippingQuoteId(payload.data.selectedShippingRate.id);
      }
      if (Array.isArray(payload.data?.availableShippingRates) && payload.data.availableShippingRates.length) {
        setShippingQuotes(payload.data.availableShippingRates.map((quote) => ({
          ...quote,
          selectedShippingQuoteId: quote.selectedShippingQuoteId || quote.id,
          amount:
            typeof quote.amount === 'number'
              ? quote.amount
              : Number((Number(quote.amountCents || 0) / 100).toFixed(2)),
        })));
      }
    } catch (checkoutError) {
      const message = checkoutError instanceof Error ? checkoutError.message : 'Failed to start checkout';
      if (message === 'Shipping rates expired. Please refresh shipping options and select a rate again.') {
        setShippingRatesError(message);
        setSelectedShippingQuoteId('');
        setError('');
        return;
      }
      if (message.toLowerCase().includes('discount')) {
        setDiscountError(message);
      } else {
        setError(message);
      }
    } finally {
      setCreatingIntent(false);
    }
  }

  async function handlePlaceOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!checkout?.clientSecret || !stripeRef.current || !elementsRef.current) {
      setError('Review payment first so we can load the secure payment form.');
      return;
    }

    setConfirmingPayment(true);

    try {
      // Stripe deferred intent flow: elements.submit() must be called before
      // any async work and before confirmPayment(). It validates the payment
      // element and prepares the collected payment method data.
      const submitResult = await elementsRef.current.submit();
      if (submitResult.error) {
        throw new Error(submitResult.error.message || 'Please check your payment details and try again.');
      }

      const result = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        clientSecret: checkout.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/success`,
        },
        redirect: 'if_required',
      });

      if (result.error) {
        throw new Error(result.error.message || 'Payment confirmation failed');
      }

      if (result.paymentIntent?.id) {
        router.push(`/checkout/success?payment_intent=${encodeURIComponent(result.paymentIntent.id)}`);
      } else {
        router.push('/checkout/success');
      }
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Payment confirmation failed');
    } finally {
      setConfirmingPayment(false);
    }
  }

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box}
        .checkout-root{min-height:100vh;background:var(--checkout-bg);color:var(--checkout-text);font-family:var(--font-body),sans-serif}
        .checkout-nav{display:flex;align-items:center;justify-content:space-between;padding:24px 32px;border-bottom:1px solid color-mix(in srgb, var(--checkout-text) 8%, transparent)}
        .checkout-logo{color:var(--checkout-text);text-decoration:none;font-family:var(--font-headline),sans-serif;font-size:20px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase}
        .checkout-shell{max-width:1280px;margin:0 auto;padding:40px 32px 80px;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,0.75fr);gap:32px}
        .checkout-card{padding:28px;border-radius:28px;border:1px solid var(--checkout-border);background:linear-gradient(180deg,color-mix(in srgb, var(--checkout-surface) 84%, #ffffff 16%),var(--checkout-surface));box-shadow:inset 0 1px 0 color-mix(in srgb, var(--checkout-text) 8%, transparent),0 22px 46px rgba(0,0,0,0.22)}
        .eyebrow{font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:var(--checkout-muted);margin-bottom:10px}
        .title{font-family:var(--font-headline),sans-serif;font-size:46px;line-height:0.96;letter-spacing:-0.05em;margin:0 0 14px}
        .lede{font-size:15px;line-height:1.7;color:var(--checkout-muted);margin:0 0 32px}
        .section{margin-top:28px}
        .section-title{font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:var(--checkout-muted);margin-bottom:16px}
        .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
        .field{display:flex;flex-direction:column;gap:8px}
        .field span{font-size:12px;color:var(--checkout-muted)}
        .field input{width:100%;padding:14px 16px;border-radius:16px;border:1px solid var(--checkout-input-border);background:var(--checkout-input-bg);color:var(--checkout-text);font:inherit}
        .field input:focus{outline:none;border-color:var(--checkout-accent);box-shadow:0 0 0 1px color-mix(in srgb, var(--checkout-accent) 48%, transparent)}
        .full{grid-column:1 / -1}
        .checkbox{display:flex;align-items:center;gap:12px;margin-top:18px;font-size:14px;color:var(--checkout-muted)}
        .checkbox input{accent-color:var(--checkout-accent)}
        .cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
        .primary-btn,.secondary-btn{min-height:48px;padding:0 20px;border-radius:999px;border:none;font:inherit;font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;cursor:pointer}
        .primary-btn{background:var(--checkout-button-bg);color:var(--checkout-button-text);border:1px solid var(--checkout-button-border)}
        .primary-btn[data-state='ready']{box-shadow:0 0 0 1px color-mix(in srgb, var(--checkout-button-bg) 12%, transparent) inset}
        .primary-btn[data-state='loading']{background:color-mix(in srgb, var(--checkout-button-bg) 16%, transparent)!important;color:var(--checkout-text)!important;border:1px solid color-mix(in srgb, var(--checkout-button-bg) 22%, transparent)!important}
        .primary-btn[data-state='error-blocked']{background:rgba(127,29,29,0.28)!important;color:#fecaca!important;border:1px solid rgba(239,68,68,0.52)!important}
        .secondary-btn{background:transparent;border:1px solid color-mix(in srgb, var(--checkout-text) 16%, transparent);color:var(--checkout-text)}
        .primary-btn:disabled{background:color-mix(in srgb, var(--checkout-button-bg) 10%, transparent)!important;color:color-mix(in srgb, var(--checkout-text) 72%, transparent)!important;border:1px solid color-mix(in srgb, var(--checkout-button-bg) 22%, transparent)!important;opacity:1;cursor:not-allowed}
        .secondary-btn:disabled{opacity:0.42;cursor:not-allowed}
        .error{margin-top:18px;padding:14px 16px;border-radius:16px;border:1px solid rgba(239,68,68,0.4);background:rgba(127,29,29,0.25);color:#fecaca;font-size:14px}
        .payment-shell{margin-top:24px;padding:20px;border-radius:22px;border:1px solid var(--checkout-border);background:color-mix(in srgb, var(--checkout-surface-strong) 88%, #ffffff 12%)}
        #payment-element{color-scheme:dark}
        .summary-list{display:flex;flex-direction:column;gap:18px}
        .summary-item{display:flex;gap:14px}
        .summary-thumb{width:76px;height:76px;border-radius:18px;background:color-mix(in srgb, var(--checkout-text) 6%, transparent);overflow:hidden;display:flex;align-items:center;justify-content:center;color:color-mix(in srgb, var(--checkout-text) 22%, transparent)}
        .summary-thumb img{width:100%;height:100%;object-fit:cover}
        .summary-meta{flex:1;min-width:0}
        .summary-title{font-size:15px;color:var(--checkout-text);margin:0 0 6px}
        .summary-variant{font-size:12px;color:color-mix(in srgb, var(--checkout-text) 44%, transparent);margin:0 0 6px}
        .summary-qty{font-size:12px;color:var(--checkout-muted)}
        .summary-price{font-size:14px;color:var(--checkout-text);white-space:nowrap}
        .summary-edit-row{display:flex;align-items:center;gap:8px;margin-top:8px}
        .summary-edit-btn{min-width:30px;height:30px;border-radius:999px;border:1px solid color-mix(in srgb, var(--checkout-text) 24%, transparent);background:color-mix(in srgb, var(--checkout-text) 8%, transparent);color:var(--checkout-text);font-size:15px;line-height:1;cursor:pointer}
        .summary-edit-btn:disabled{opacity:0.45;cursor:not-allowed}
        .summary-remove-btn{height:30px;padding:0 10px;border-radius:999px;border:1px solid color-mix(in srgb, var(--checkout-text) 20%, transparent);background:transparent;color:color-mix(in srgb, var(--checkout-text) 86%, transparent);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer}
        .summary-remove-btn:disabled{opacity:0.45;cursor:not-allowed}
        .summary-divider{height:1px;background:color-mix(in srgb, var(--checkout-text) 8%, transparent);margin:22px 0}
        .summary-row{display:flex;align-items:center;justify-content:space-between;font-size:14px;color:var(--checkout-muted);margin-bottom:12px}
        .summary-row.total{font-size:18px;color:var(--checkout-text);font-weight:600;margin-top:12px}
        .empty-state{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:18px;border-radius:18px;border:1px solid color-mix(in srgb, var(--checkout-text) 12%, transparent);background:color-mix(in srgb, var(--checkout-surface-strong) 68%, transparent)}
        .empty-title{margin:0;font-size:28px;line-height:1;font-family:var(--font-headline),sans-serif;letter-spacing:-0.03em;color:var(--checkout-text)}
        .empty-copy{margin:0;font-size:14px;line-height:1.65;color:var(--checkout-muted)}
        .empty-cta{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:999px;border:1px solid var(--checkout-button-border);background:var(--checkout-button-bg);color:var(--checkout-button-text);font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none}
        .empty-cta:hover{filter:brightness(1.05)}
        @media (max-width:960px){.checkout-shell{grid-template-columns:1fr}.checkout-card.summary{order:-1}}
        @media (max-width:640px){.checkout-shell{padding:28px 18px 64px;gap:18px}.checkout-nav{padding:20px 18px}.checkout-card{padding:22px;border-radius:22px}.grid{grid-template-columns:1fr;gap:14px}.title{font-size:36px}.lede{margin-bottom:24px;line-height:1.62}.section{margin-top:22px}.summary-list{gap:14px}.summary-item{gap:10px}.empty-state{padding:14px;gap:10px}.empty-title{font-size:24px}.empty-cta{width:100%}.cta-row{flex-direction:column}.cta-row .primary-btn,.cta-row .secondary-btn{width:100%}}
      `}</style>

      <div className="checkout-root">
        <nav className="checkout-nav">
          <Link className="checkout-logo" href="/">
            {checkoutLogo ? (
              <img
                alt={store?.name || 'Doopify'}
                src={checkoutLogo}
                style={{ display: 'block', maxHeight: 36, width: 'auto' }}
              />
            ) : (
              store?.name || 'Doopify'
            )}
          </Link>
          <Link style={{ color: 'rgba(255,255,255,0.58)', textDecoration: 'none', fontSize: 13 }} href="/shop">
            Continue shopping
          </Link>
        </nav>

        <div className="checkout-shell">
          <form className="checkout-card" onSubmit={paymentReady ? handlePlaceOrder : handleCreateIntent}>
            <p className="eyebrow">Secure checkout</p>
            <h1 className="title">Finish the purchase flow.</h1>
            <p className="lede">
              Your cart is reviewed in real time so totals, shipping, and payment details stay accurate.
            </p>

            {!items.length ? (
              <div className="empty-state">
                <h2 className="empty-title">Your cart is empty.</h2>
                <p className="empty-copy">Add at least one item to continue through secure checkout.</p>
                <Link className="empty-cta" href="/shop">Return to shop</Link>
              </div>
            ) : (
              <>
                <div className="section">
                  <div className="section-title">Contact</div>
                  {recoveryNotice ? (
                    <div style={{ marginBottom: 14, padding: '10px 12px', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 12, background: 'rgba(6,78,59,0.25)', color: '#6ee7b7', fontSize: 13 }}>
                      {recoveryNotice}
                    </div>
                  ) : null}
                  <div className="grid">
                    <label className="field full">
                      <span>Email</span>
                      <input
                        autoComplete="email"
                        name="email"
                        onChange={(event) => {
                          if (checkout) resetPaymentStep();
                          setEmail(event.target.value);
                        }}
                        onInput={(event) => {
                          const target = event.currentTarget;
                          if (checkout) resetPaymentStep();
                          setEmail(target.value);
                        }}
                        placeholder="you@example.com"
                        type="email"
                        value={email}
                      />
                    </label>
                  </div>
                </div>

                <div className="section">
                  <div className="section-title">Shipping address</div>
                  <div className="grid">
                    <label className="field">
                      <span>First name</span>
                      <input value={shippingAddress.firstName} onChange={(event) => updateShippingField('firstName', event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Last name</span>
                      <input value={shippingAddress.lastName} onChange={(event) => updateShippingField('lastName', event.target.value)} />
                    </label>
                    <label className="field full">
                      <span>Company</span>
                      <input value={shippingAddress.company} onChange={(event) => updateShippingField('company', event.target.value)} />
                    </label>
                    <label className="field full">
                      <span>Address line 1</span>
                      <input value={shippingAddress.address1} onChange={(event) => updateShippingField('address1', event.target.value)} />
                    </label>
                    <label className="field full">
                      <span>Address line 2</span>
                      <input value={shippingAddress.address2} onChange={(event) => updateShippingField('address2', event.target.value)} />
                    </label>
                    <label className="field">
                      <span>City</span>
                      <input value={shippingAddress.city} onChange={(event) => updateShippingField('city', event.target.value)} />
                    </label>
                    <label className="field">
                      <span>State / Province</span>
                      <input value={shippingAddress.province} onChange={(event) => updateShippingField('province', event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Postal code</span>
                      <input value={shippingAddress.postalCode} onChange={(event) => updateShippingField('postalCode', event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Country</span>
                      <input value={shippingAddress.country} onChange={(event) => updateShippingField('country', event.target.value)} />
                    </label>
                    <label className="field full">
                      <span>Phone</span>
                      <input value={shippingAddress.phone} onChange={(event) => updateShippingField('phone', event.target.value)} />
                    </label>
                  </div>

                  <label className="checkbox">
                    <input
                      checked={billingSameAsShipping}
                      onChange={(event) => {
                        if (checkout) resetPaymentStep();
                        setBillingSameAsShipping(event.target.checked);
                      }}
                      type="checkbox"
                    />
                    Billing address is the same as shipping
                  </label>
                </div>

                <div className="section">
                  <div className="section-title">Shipping method</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      className="secondary-btn"
                      disabled={shippingRatesLoading || !isAddressComplete(shippingAddress)}
                      onClick={loadShippingRates}
                      style={{ ...brandButtonBaseStyle, alignSelf: 'flex-start', minHeight: 40, padding: '0 16px' }}
                      type="button"
                    >
                      {shippingRatesLoading ? 'Loading shipping options...' : shippingQuotes.length ? 'Refresh shipping options' : 'Load shipping options'}
                    </button>
                    {shippingRatesError ? (
                      <div style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(127,29,29,0.2)', color: '#fca5a5', fontSize: 13 }}>
                        {shippingRatesError}
                      </div>
                    ) : null}
                    {shippingQuotes.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {shippingQuotes.map((quote) => {
                          const quoteSelectionId = quote.selectedShippingQuoteId || quote.id;
                          return (
                            <label
                              key={quote.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                border: quoteSelectionId === selectedShippingQuoteId ? '1px solid rgba(110,231,183,0.75)' : '1px solid rgba(255,255,255,0.12)',
                                borderRadius: 14,
                                padding: '10px 12px',
                                background: quoteSelectionId === selectedShippingQuoteId ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.02)',
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input
                                  checked={quoteSelectionId === selectedShippingQuoteId}
                                  name="shipping-rate"
                                  onChange={() => {
                                    if (checkout) resetPaymentStep();
                                    setSelectedShippingQuoteId(quoteSelectionId);
                                  }}
                                  type="radio"
                                  value={quoteSelectionId}
                                />
                                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  <span style={{ fontSize: 14, color: '#f3efe7' }}>{quote.displayName}</span>
                                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                                    {quote.carrier || quote.source}{quote.service ? ` - ${quote.service}` : ''}
                                    {Number.isFinite(quote.estimatedDays) ? ` - ${quote.estimatedDays} day${quote.estimatedDays === 1 ? '' : 's'}` : ''}
                                  </span>
                                </span>
                              </span>
                              <strong style={{ fontSize: 14, color: '#f3efe7' }}>{formatMoney(quote.amount, quote.currency || currency)}</strong>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.52)' }}>
                        Load shipping options after entering the address.
                      </p>
                    )}
                  </div>
                </div>

                {!billingSameAsShipping && (
                  <div className="section">
                    <div className="section-title">Billing address</div>
                    <div className="grid">
                      <label className="field">
                        <span>First name</span>
                        <input value={billingAddress.firstName} onChange={(event) => updateBillingField('firstName', event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Last name</span>
                        <input value={billingAddress.lastName} onChange={(event) => updateBillingField('lastName', event.target.value)} />
                      </label>
                      <label className="field full">
                        <span>Address line 1</span>
                        <input value={billingAddress.address1} onChange={(event) => updateBillingField('address1', event.target.value)} />
                      </label>
                      <label className="field">
                        <span>City</span>
                        <input value={billingAddress.city} onChange={(event) => updateBillingField('city', event.target.value)} />
                      </label>
                      <label className="field">
                        <span>State / Province</span>
                        <input value={billingAddress.province} onChange={(event) => updateBillingField('province', event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Postal code</span>
                        <input value={billingAddress.postalCode} onChange={(event) => updateBillingField('postalCode', event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Country</span>
                        <input value={billingAddress.country} onChange={(event) => updateBillingField('country', event.target.value)} />
                      </label>
                    </div>
                  </div>
                )}

                <div className="section">
                  {showDiscount ? (
                    <>
                      <div className="section-title">Promo code</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                          className="field"
                          onChange={e => {
                            if (checkout) resetPaymentStep();
                            setDiscountCode(e.target.value.toUpperCase());
                            setDiscountError('');
                          }}
                          placeholder="ENTER CODE"
                          style={{ flex: 1, padding: '13px 16px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#f3efe7', fontFamily: 'inherit', fontSize: 13, letterSpacing: '0.08em' }}
                          type="text"
                          value={discountCode}
                        />
                        <button
                          className="secondary-btn"
                          onClick={() => { setShowDiscount(false); setDiscountCode(''); setDiscountError(''); if (checkout) resetPaymentStep(); }}
                          style={{ ...brandButtonBaseStyle, padding: '0 16px', minHeight: 44, flexShrink: 0 }}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                      {discountError ? (
                        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: 13 }}>
                          {discountError}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <button
                      className="secondary-btn"
                      onClick={() => setShowDiscount(true)}
                      style={{ ...brandButtonBaseStyle, fontSize: 12, minHeight: 38, padding: '0 14px' }}
                      type="button"
                    >
                      + Add promo code
                    </button>
                  )}
                </div>

                {checkout && (
                  <div className="payment-shell">
                    <div className="section-title" style={{ marginBottom: 12 }}>Payment</div>
                    <div id="payment-element" />
                  </div>
                )}

                <div className="cta-row">
                  {!paymentReady ? (
                    <button
                      className="primary-btn"
                      data-state={reviewButtonState}
                      disabled={Boolean(reviewPaymentDisabledReason)}
                      style={
                        reviewButtonState !== 'ready'
                          ? brandButtonBaseStyle
                          : { ...brandButtonBaseStyle, ...CHECKOUT_BUTTON_READY_STYLE }
                      }
                      type="submit"
                    >
                      {reviewButtonState === 'loading' ? 'Loading payment form...' : 'Review payment'}
                    </button>
                  ) : (
                    <>
                      <button
                        className="primary-btn"
                        data-state={confirmingPayment ? 'loading' : 'ready'}
                        disabled={confirmingPayment}
                        style={
                          confirmingPayment
                            ? brandButtonBaseStyle
                            : { ...brandButtonBaseStyle, ...CHECKOUT_BUTTON_READY_STYLE }
                        }
                        type="submit"
                      >
                        {confirmingPayment ? 'Placing order...' : 'Place order'}
                      </button>
                      <button
                        className="secondary-btn"
                        disabled={confirmingPayment}
                        onClick={(event) => {
                          event.preventDefault();
                          resetPaymentStep();
                        }}
                        style={brandButtonBaseStyle}
                        type="button"
                      >
                        Edit details
                      </button>
                    </>
                  )}
                </div>
                {!paymentReady && reviewPaymentDisabledReason ? (
                  <p
                    style={{
                      marginTop: 8,
                      marginBottom: 0,
                      fontSize: 12,
                      color: checkoutInitializationFailed ? '#fca5a5' : 'rgba(255,255,255,0.56)',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {reviewPaymentDisabledReason}
                  </p>
                ) : null}
              </>
            )}

            {error ? (
              <div className="error" role="alert">
                <strong style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                  {error.toLowerCase().includes('units left') ? 'Stock issue' :
                   error.toLowerCase().includes('variant') ? 'Item unavailable' :
                   paymentReady ? 'Payment failed' :
                   'Could not start checkout'}
                </strong>
                {error}
              </div>
            ) : null}
          </form>

          <aside className="checkout-card summary">
            <p className="eyebrow">Order summary</p>
            <h2 style={{ margin: '0 0 6px', fontSize: 26, fontFamily: 'var(--brand-heading-font, var(--font-headline), sans-serif)' }}>
              {lineCount} item{lineCount === 1 ? '' : 's'} ready to go
            </h2>
            <p style={{ margin: '0 0 28px', color: 'rgba(255,255,255,0.56)', lineHeight: 1.7 }}>
              Prices are validated against live product data when you create the payment intent.
            </p>

            <div className="summary-list">
              {items.map((item) => (
                <div className="summary-item" key={item.variantId}>
                  <div className="summary-thumb">
                    {item.image ? <img alt={item.title} src={item.image} /> : <span>+</span>}
                  </div>
                  <div className="summary-meta">
                    <p className="summary-title">{item.title}</p>
                    {item.variantTitle ? <p className="summary-variant">{item.variantTitle}</p> : null}
                    <p className="summary-qty">Qty {item.quantity}</p>
                    <div className="summary-edit-row">
                      <button
                        className="summary-edit-btn"
                        disabled={orderEditingLocked}
                        onClick={() => handleOrderQuantityChange(item.variantId, item.quantity - 1)}
                        type="button"
                        aria-label={`Decrease quantity for ${item.title}`}
                      >
                        -
                      </button>
                      <button
                        className="summary-edit-btn"
                        disabled={orderEditingLocked}
                        onClick={() => handleOrderQuantityChange(item.variantId, item.quantity + 1)}
                        type="button"
                        aria-label={`Increase quantity for ${item.title}`}
                      >
                        +
                      </button>
                      <button
                        className="summary-remove-btn"
                        disabled={orderEditingLocked}
                        onClick={() => handleOrderItemRemove(item.variantId)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="summary-price">{formatMoney(item.price * item.quantity, currency)}</div>
                </div>
              ))}
            </div>

            <div className="summary-divider" />

            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatMoney(previewSubtotal, currency)}</span>
            </div>
            <div className="summary-row">
              <span>Shipping</span>
              <span>
                {previewShipping == null
                  ? 'Select shipping option'
                  : formatMoney(previewShipping, checkout?.selectedShippingRate?.currency || selectedShippingQuote?.currency || currency)}
              </span>
            </div>
            <div className="summary-row">
              <span>Tax</span>
              <span>{checkout ? formatMoney(checkout.taxAmount, currency) : 'Calculated at payment step'}</span>
            </div>
            {checkout && checkout.discountAmount > 0 ? (
              <div className="summary-row" style={{ color: '#86efac' }}>
                <span>Discount{checkout.discountApplications?.[0]?.code ? ` (${checkout.discountApplications[0].code})` : ''}</span>
                <span>-{formatMoney(checkout.discountAmount, currency)}</span>
              </div>
            ) : null}
            <div className="summary-row total">
              <span>Total</span>
              <span>{formatMoney(previewTotal, currency)}</span>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}


