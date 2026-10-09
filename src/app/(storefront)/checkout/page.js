import CheckoutClientPage from './CheckoutClientPage';
import { getPublicStorefrontSettings } from '@/server/services/settings.service';
import { getStripePublicConfig } from '@/lib/stripe-client';

export const metadata = {
  title: 'Checkout - Doopify',
  description: 'Secure checkout',
};

// Checkout reads deployment configuration and live store settings per request.
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
    const stripeConfig = getStripePublicConfig();
    publishableKey = stripeConfig.publishableKey || '';
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
