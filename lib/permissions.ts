import type { Role } from "@/db/schema/auth";

export const ROLE_RANK: Record<Role, number> = {
  admin: 3,
  manager: 2,
  viewer: 1,
};

export function hasRole(userRole: string | null | undefined, min: Role) {
  const r = (userRole as Role) ?? "viewer";
  return (ROLE_RANK[r] ?? 0) >= ROLE_RANK[min];
}

export function isRole(userRole: string | null | undefined, ...roles: Role[]) {
  return roles.includes((userRole as Role) ?? "viewer");
}
