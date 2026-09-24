import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cookies: vi.fn(), getSessionUser: vi.fn() }));
vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("@/lib/auth", () => ({
  AUTH_COOKIE: "session",
  getSessionUser: mocks.getSessionUser,
}));
import { getPageUser, requirePageRole } from "./page-auth";
describe("server page authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "token" }) });
  });
  it("redirects before loading private page data without a session", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    await expect(getPageUser()).rejects.toThrow("redirect:/login");
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
  });
  it("serializes only safe identity fields", async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: "owner",
      email: "owner@example.org",
      firstName: "Store",
      lastName: "Owner",
      role: "OWNER",
      mfaSecretEncrypted: "private",
      passwordHash: "private",
    });
    expect(await getPageUser()).toEqual({
      id: "owner",
      email: "owner@example.org",
      firstName: "Store",
      lastName: "Owner",
      role: "OWNER",
    });
  });
  it.each(["ADMIN", "STAFF", "VIEWER"])(
    "blocks %s from owner pages",
    async (role) => {
      mocks.getSessionUser.mockResolvedValue({ id: "user", role });
      await expect(requirePageRole(["OWNER"])).rejects.toThrow("not-found");
    },
  );
  it("blocks viewers from merchant settings", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "user", role: "VIEWER" });
    await expect(requirePageRole()).rejects.toThrow("not-found");
  });
  it.each(["OWNER", "ADMIN", "STAFF"])(
    "allows %s to business settings",
    async (role) => {
      mocks.getSessionUser.mockResolvedValue({ id: "user", role });
      expect((await requirePageRole()).role).toBe(role);
    },
  );
});
