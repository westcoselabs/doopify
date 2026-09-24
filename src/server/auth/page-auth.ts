import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { AUTH_COOKIE, getSessionUser } from "@/lib/auth";
import type { RouteAuthUser } from "./require-auth";

// React cache is scoped to this server render, never shared between sessions.
export const getPageUser = cache(async (): Promise<RouteAuthUser> => {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const user = token ? await getSessionUser(token) : null;
  if (!user) redirect("/login");
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
});

export async function requirePageRole(
  roles: readonly UserRole[] = ["OWNER", "ADMIN", "STAFF"],
) {
  const user = await getPageUser();
  if (!roles.includes(user.role)) notFound();
  return user;
}
