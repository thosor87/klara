import type { UserStatus } from "../types.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

export function isDomainAllowed(email: string, allowedDomains: string[]): boolean {
  return allowedDomains.includes(emailDomain(email));
}

export type LoginAction = "send_login" | "create_pending" | "noop" | "deny";

export interface EligibilityInput {
  email: string;
  allowedDomains: string[];
  existingUser: { status: UserStatus } | null;
}

/**
 * Entscheidet, was beim Login-Request passiert. Rein, ohne Seiteneffekte.
 * - active  → send_login (Mail mit Code/Link)
 * - pending → noop (wartet auf Admin, keine Mail)
 * - disabled→ deny
 * - kein Account, aber Domain erlaubt → create_pending
 * - kein Account, Domain nicht erlaubt → deny
 */
export function decideLoginAction(input: EligibilityInput): { action: LoginAction } {
  const { existingUser } = input;
  if (existingUser) {
    if (existingUser.status === "active") return { action: "send_login" };
    if (existingUser.status === "pending") return { action: "noop" };
    return { action: "deny" };
  }
  if (isDomainAllowed(input.email, input.allowedDomains)) return { action: "create_pending" };
  return { action: "deny" };
}
