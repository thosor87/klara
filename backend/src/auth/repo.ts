import type { User, LoginTokenRow } from "../types.js";

export interface NewLoginToken {
  email: string;
  codeHash: string;
  linkTokenHash: string;
  expiresAt: Date;
}

export interface AuthRepo {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createPendingUser(email: string): Promise<User>;
  insertLoginToken(t: NewLoginToken): Promise<void>;
  /** Neuester, nicht verbrauchter, nicht abgelaufener Token für die E-Mail. */
  findLatestActiveToken(email: string): Promise<LoginTokenRow | null>;
  /** Token über den Link-Hash finden (der Link trägt keine E-Mail). */
  findActiveTokenByLinkHash(linkHash: string): Promise<LoginTokenRow | null>;
  markTokenUsed(id: string): Promise<void>;
}
