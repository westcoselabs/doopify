"use client";

import { CustomersProvider } from "@/context/CustomersContext";
import { DiscountsProvider } from "@/context/DiscountsContext";
import { OrdersProvider } from "@/context/OrdersContext";
import { ProductsProvider } from "@/context/ProductsContext";
import { SettingsProvider } from "@/context/SettingsContext";

/**
 * Data contexts are intentionally scoped to routes that consume them. The
 * dashboard layout only owns global UI, so unrelated APIs are not fetched
 * when navigating between operational surfaces.
 */
export default function DashboardRouteProviders({
  children,
  customers = false,
  discounts = false,
  orders = false,
  products = false,
  settings = true,
}) {
  let content = children;

  if (customers) content = <CustomersProvider>{content}</CustomersProvider>;
  if (discounts) content = <DiscountsProvider>{content}</DiscountsProvider>;
  if (orders) content = <OrdersProvider>{content}</OrdersProvider>;
  if (products) content = <ProductsProvider>{content}</ProductsProvider>;
  if (settings) content = <SettingsProvider>{content}</SettingsProvider>;

  return content;
}
