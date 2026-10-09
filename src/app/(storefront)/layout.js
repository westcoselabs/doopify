import '../_styles/shared-base.css';
import '../_styles/storefront-theme.css';
import { inter, manrope } from '../_shared/fonts';
import { CartProvider } from '@/context/CartContext';
import { getStorefrontDocumentSettings } from '@/server/services/settings.service';

export const metadata = {
  title: 'Doopify | Storefront',
  description: 'Doopify storefront experience',
};

export default async function StorefrontLayout({ children }) {
  let store = null;

  try {
    store = await getStorefrontDocumentSettings();
  } catch (error) {
    console.error('[StorefrontLayout]', error);
  }

  return (
    <html lang="en" style={{ colorScheme: 'dark' }} suppressHydrationWarning>
      <head>{store?.faviconUrl ? <link rel="icon" href={store.faviconUrl} /> : null}</head>
      <body className={`${inter.variable} ${manrope.variable} storefront-body`} suppressHydrationWarning>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
