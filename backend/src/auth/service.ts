import type { User } from "../types.js";
import type { AuthRepo } from "./repo.js";
import type { Mailer } from "./mailer.js";
import { normalizeEmail, decideLoginAction } from "./eligibility.js";
import { generateCode, generateLinkToken, hashSecret, verifySecret } from "./tokens.js";

export interface AuthServiceDeps {
  repo: AuthRepo;
  mailer: Mailer;
  /** Returns the current list of allowed domains (fetched at request time from DB or config). */
  getAllowedDomains: () => Promise<string[]>;
  tokenTtlMinutes: number;
  appBaseUrl: string;
}

/** Was dem Nutzer nach einem Login-Request zurückgemeldet wird. */
export type RequestLoginOutcome = "code_sent" | "pending" | "denied";

export interface AuthService {
  requestLogin(rawEmail: string): Promise<RequestLoginOutcome>;
  verifyCode(rawEmail: string, code: string): Promise<User | null>;
  verifyLink(linkToken: string): Promise<User | null>;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { repo, mailer, getAllowedDomains, tokenTtlMinutes, appBaseUrl } = deps;

  async function issueToken(email: string): Promise<void> {
    const code = generateCode();
    const linkToken = generateLinkToken();
    const expiresAt = new Date(Date.now() + tokenTtlMinutes * 60_000);
    await repo.insertLoginToken({
      email, codeHash: hashSecret(code), linkTokenHash: hashSecret(linkToken), expiresAt,
    });
    const link = `${appBaseUrl}/api/auth/link?token=${linkToken}`;
    await mailer.sendLoginEmail(email, code, link);
  }

  async function resolveActiveByToken(email: string, secret: string, field: "codeHash" | "linkTokenHash"): Promise<User | null> {
    const tok = await repo.findLatestActiveToken(email);
    if (!tok) return null;
    if (!verifySecret(secret, tok[field])) {
      await repo.incrementCodeAttempts(tok.id);
      return null;
    }
    await repo.markTokenUsed(tok.id);
    const user = await repo.findUserByEmail(email);
    if (!user || user.status !== "active") return null;
    return user;
  }

  return {
    async requestLogin(rawEmail) {
      const email = normalizeEmail(rawEmail);
      const [existing, allowedDomains] = await Promise.all([
        repo.findUserByEmail(email),
        getAllowedDomains(),
      ]);
      const { action } = decideLoginAction({
        email, allowedDomains, existingUser: existing ? { status: existing.status } : null,
      });
      if (action === "send_login") {
        await issueToken(email);
        return "code_sent";
      }
      if (action === "create_pending") {
        await repo.createPendingUser(email);
        return "pending";
      }
      if (action === "noop") return "pending"; // existierender pending-Nutzer, keine Mail
      return "denied"; // deny: keine Mail, kein Nutzer
    },

    async verifyCode(rawEmail, code) {
      return resolveActiveByToken(normalizeEmail(rawEmail), code, "codeHash");
    },

    async verifyLink(linkToken) {
      const tok = await repo.findActiveTokenByLinkHash(hashSecret(linkToken));
      if (!tok) return null;
      await repo.markTokenUsed(tok.id);
      const user = await repo.findUserByEmail(tok.email);
      if (!user || user.status !== "active") return null;
      return user;
    },
  };
}
