import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    product: { findMany: vi.fn() },
    webhookDelivery: { findFirst: vi.fn() },
    order: { findFirst: vi.fn() },
    taxRule: { findFirst: vi.fn() },
  },
  findPrimaryStore: vi.fn(),
  getIntegrationStatuses: vi.fn(),
  getShippingSetupStore: vi.fn(),
  buildShippingSetupStatus: vi.fn(),
  getEmailJobHealthSnapshot: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: {
    EMAIL_PROVIDER: "resend",
    NEXT_PUBLIC_STORE_URL: "https://store.example.org",
    NODE_ENV: "production",
    WEBHOOK_RETRY_SECRET: "test-runner",
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./primary-store.service", () => ({
  findPrimaryStore: mocks.findPrimaryStore,
}));
vi.mock("@/server/config/integration-status", () => ({
  getIntegrationStatuses: mocks.getIntegrationStatuses,
}));
vi.mock("@/server/shipping/shipping-setup.service", () => ({
  getShippingSetupStore: mocks.getShippingSetupStore,
  buildShippingSetupStatus: mocks.buildShippingSetupStatus,
}));
vi.mock("@/server/jobs/email-job-health.service", () => ({
  getEmailJobHealthSnapshot: mocks.getEmailJobHealthSnapshot,
}));

import { runLaunchReadinessCheck } from "./launch-readiness-runner.service";
const product = {
  id: "prod_1",
  title: "Product",
  salesMode: "STANDARD",
  fulfillmentType: "PHYSICAL",
  media: [{ id: "media_1" }],
  variants: [
    {
      priceCents: 1200,
      inventory: 10,
      continueSellingWhenOutOfStock: false,
      weight: 1,
    },
  ],
};

describe("explicit launch checks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findPrimaryStore.mockResolvedValue({
      name: "Store",
      email: "store@example.org",
      taxEnabled: true,
      defaultTaxRateBps: 750,
    });
    mocks.prisma.product.findMany.mockResolvedValue([product]);
    mocks.prisma.webhookDelivery.findFirst.mockResolvedValue({
      id: "delivery_1",
    });
    mocks.prisma.order.findFirst.mockResolvedValue({ id: "order_1" });
    mocks.prisma.taxRule.findFirst.mockResolvedValue(null);
    mocks.getIntegrationStatuses.mockReturnValue([
      { id: "stripe", configured: true, webhookReady: true },
      { id: "resend", configured: true },
    ]);
    mocks.getShippingSetupStore.mockResolvedValue({ id: "store_1" });
    mocks.buildShippingSetupStatus.mockResolvedValue({
      mode: "MANUAL",
      canUseManualRates: true,
      canUseLiveRates: false,
    });
    mocks.getEmailJobHealthSnapshot.mockResolvedValue({
      level: "healthy",
      runner: { health: "healthy" },
    });
  });

  it("checks configured infrastructure without live provider diagnostics and uses existence queries", async () => {
    const report = await runLaunchReadinessCheck();
    expect(report.launchReady).toBe(true);
    expect(mocks.getIntegrationStatuses).toHaveBeenCalledOnce();
    expect(mocks.prisma.webhookDelivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: "stripe",
          eventType: "payment_intent.succeeded",
          status: "PROCESSED",
        },
        select: { id: true },
      }),
    );
    expect(mocks.prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true } }),
    );
  });

  it("keeps the catalog scan bounded and includes products after the first page", async () => {
    mocks.prisma.product.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 250 }, (_, i) => ({
          ...product,
          id: `product_${i}`,
        })),
      )
      .mockResolvedValueOnce([
        {
          ...product,
          id: "last",
          variants: [{ ...product.variants[0], priceCents: 0 }],
        },
      ]);
    const report = await runLaunchReadinessCheck();
    expect(mocks.prisma.product.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.product.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 250,
        skip: 1,
        cursor: { id: "product_249" },
      }),
    );
    expect(
      report.checks.find((check) => check.id === "products-price")?.metadata,
    ).toMatchObject({ affectedCount: 1 });
  });

  it("uses active jurisdiction rules when no default tax rate exists", async () => {
    mocks.findPrimaryStore.mockResolvedValue({
      name: "Store",
      email: "store@example.org",
      taxEnabled: true,
      defaultTaxRateBps: 0,
    });
    mocks.prisma.taxRule.findFirst.mockResolvedValue({ id: "tax_1" });
    expect(
      (await runLaunchReadinessCheck()).checks.find(
        (check) => check.id === "tax",
      )?.status,
    ).toBe("ready");
  });

  it("reports unavailable optional operational snapshots without claiming they are healthy", async () => {
    mocks.buildShippingSetupStatus.mockRejectedValue(new Error("unavailable"));
    mocks.getEmailJobHealthSnapshot.mockRejectedValue(new Error("unavailable"));
    const report = await runLaunchReadinessCheck();
    expect(report.checks.find((check) => check.id === "shipping")?.status).toBe(
      "warning",
    );
    expect(report.signals?.emailJobHealthLevel).toBe("unknown");
    expect(report.signals?.runnerHealth).toBe("unknown");
  });
});
