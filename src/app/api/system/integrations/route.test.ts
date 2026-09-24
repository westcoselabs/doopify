import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  getIntegrationStatuses: vi.fn(),
  testIntegration: vi.fn(),
  recordAuditLogBestEffort: vi.fn(),
}));
vi.mock("@/server/auth/require-auth", () => ({
  requireOwner: mocks.requireOwner,
}));
vi.mock("@/server/config/integration-status", () => ({
  getIntegrationStatuses: mocks.getIntegrationStatuses,
  testIntegration: mocks.testIntegration,
}));
vi.mock("@/server/services/audit-log.service", () => ({
  auditActorFromUser: (user: unknown) => user,
  recordAuditLogBestEffort: mocks.recordAuditLogBestEffort,
}));
import { GET } from "./route";
import { POST } from "./[provider]/test/route";
const request = () =>
  new Request("http://localhost/api/system/integrations", { method: "POST" });
describe("owner environment diagnostics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: "owner", role: "OWNER" },
    });
    mocks.getIntegrationStatuses.mockReturnValue([
      {
        id: "stripe",
        configured: true,
        missing: [],
        mode: "test",
        webhookReady: true,
      },
    ]);
  });
  it("lists safe presence status without performing live checks", async () => {
    const response = await GET(request());
    expect((await response.json()).data.integrations[0]).toEqual({
      id: "stripe",
      configured: true,
      missing: [],
      mode: "test",
      webhookReady: true,
    });
    expect(mocks.testIntegration).not.toHaveBeenCalled();
  });
  it("blocks unauthorized reads and tests before consulting config or providers", async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: false,
      response: new Response("Forbidden", { status: 403 }),
    });
    expect((await GET(request())).status).toBe(403);
    expect(
      (
        await POST(request(), {
          params: Promise.resolve({ provider: "stripe" }),
        })
      ).status,
    ).toBe(403);
    expect(mocks.getIntegrationStatuses).not.toHaveBeenCalled();
    expect(mocks.testIntegration).not.toHaveBeenCalled();
  });
  it("rejects unknown integrations without invoking providers", async () => {
    expect(
      (
        await POST(request(), {
          params: Promise.resolve({ provider: "unknown" }),
        })
      ).status,
    ).toBe(404);
    expect(mocks.testIntegration).not.toHaveBeenCalled();
  });
  it("runs one requested diagnostic and records a safe outcome", async () => {
    const result = {
      id: "stripe",
      ok: true,
      checkedAt: "2026-09-24T00:00:00.000Z",
      error: null,
    };
    mocks.testIntegration.mockResolvedValue(result);
    const response = await POST(request(), {
      params: Promise.resolve({ provider: "stripe" }),
    });
    expect((await response.json()).data).toEqual(result);
    expect(mocks.testIntegration).toHaveBeenCalledExactlyOnceWith("stripe");
    expect(mocks.recordAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: { provider: "stripe", ok: true, checkedAt: result.checkedAt },
      }),
    );
  });
});
