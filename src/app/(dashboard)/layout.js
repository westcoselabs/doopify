import '../_styles/shared-base.css';
import '../_styles/dashboard-theme.css';
import { inter, manrope } from '../_shared/fonts';
import { OrdersProvider } from '@/context/OrdersContext';
import { CustomersProvider } from '@/context/CustomersContext';
import { DiscountsProvider } from '@/context/DiscountsContext';
import { ProductsProvider } from '@/context/ProductsContext';
import { SettingsProvider } from '@/context/SettingsContext';
import AdminThemeProvider from '@/components/admin/ui/AdminThemeProvider';
import AdminCommandPalette from '@/components/admin/ui/AdminCommandPalette';
import AdminSpotlightRuntime from '@/components/admin/ui/AdminSpotlightRuntime';

export const metadata = {
  title: 'Doopify | Commerce OS',
  description: 'Doopify Commerce OS',
};

const themeBootScript = `(() => {
  const storageKey = 'doopify.dashboard.theme';
  const valid = new Set(['light', 'dark', 'system']);
  let preference = 'system';

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (valid.has(saved)) preference = saved;
  } catch {}

  const resolved = preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : preference;

  document.documentElement.setAttribute('data-dashboard-theme-preference', preference);
  document.documentElement.setAttribute('data-dashboard-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
})();`;

export default function DashboardLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-dashboard-theme="dark"
      data-dashboard-theme-preference="system"
    >
      <head>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');`}</style>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={`${inter.variable} ${manrope.variable} dashboard-body`} suppressHydrationWarning>
        <AdminThemeProvider>
          <SettingsProvider>
            <ProductsProvider>
              <OrdersProvider>
                <CustomersProvider>
                  <DiscountsProvider>
                    {children}
                    <AdminSpotlightRuntime />
                    <AdminCommandPalette />
                  </DiscountsProvider>
                </CustomersProvider>
              </OrdersProvider>
            </ProductsProvider>
          </SettingsProvider>
        </AdminThemeProvider>
      </body>
    </html>
  );
}
