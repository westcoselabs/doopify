"use client";

import { createElement } from 'react';
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

  if (customers) content = createElement(CustomersProvider, null, content);
  if (discounts) content = createElement(DiscountsProvider, null, content);
  if (orders) content = createElement(OrdersProvider, null, content);
  if (products) content = createElement(ProductsProvider, null, content);
  if (settings) content = createElement(SettingsProvider, null, content);

  return content;
}
