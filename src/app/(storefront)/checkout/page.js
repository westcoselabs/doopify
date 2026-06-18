import CheckoutClientPage from './CheckoutClientPage';
import { getPublicStorefrontSettings } from '@/server/services/settings.service';
import { getStripeRuntimeConnection } from '@/server/payments/stripe-runtime.service';

export const metadata = {
  title: 'Checkout - Doopify',
  description: 'Secure checkout',
};

// Checkout resolves live Stripe runtime/env-fallback credentials per request and
// must never be statically cached, so the publishable key is always current.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CheckoutPage({ searchParams }) {
  let store = null;
  let publishableKey = '';
  const params = await searchParams;
  const recoveryToken = typeof params?.recovery_token === 'string' ? params.recovery_token : '';

  try {
    store = await getPublicStorefrontSettings();
  } catch (error) {
    console.error('[CheckoutPage]', error);
  }

  try {
    const stripeRuntime = await getStripeRuntimeConnection();
    publishableKey = stripeRuntime.publishableKey || '';
  } catch (error) {
    console.error('[CheckoutPage Stripe runtime]', error);
  }

  return (
    <CheckoutClientPage
      publishableKey={publishableKey}
      recoveryToken={recoveryToken}
      store={store}
    />
  );
}
