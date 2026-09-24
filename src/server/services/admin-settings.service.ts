import "server-only";
import { cache } from "react";
import { findPrimaryStore } from "./primary-store.service";

// Only business identity is serialized into the shared admin shell.
export const getAdminSettings = cache(async () => {
  const store = await findPrimaryStore({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      domain: true,
      currency: true,
      timezone: true,
      logoUrl: true,
      address1: true,
      city: true,
      province: true,
      postalCode: true,
      country: true,
    },
  });
  if (!store) throw new Error("Store not configured");
  return store;
});
