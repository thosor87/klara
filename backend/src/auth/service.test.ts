import { describe, it, expect, beforeEach } from "vitest";
import type { User, UserRole, UserStatus, LoginTokenRow } from "../types.js";
import type { AuthRepo, NewLoginToken } from "./repo.js";
import type { Mailer } from "./mailer.js";
import { createAuthService } from "./service.js";
import { MAX_CODE_ATTEMPTS } from "./tokens.js";

// --- In-Memory-Fakes ---
class FakeRepo implements AuthRepo {
  users: User[] = [];
  tokens: (LoginTokenRow & { _expires: Date })[] = [];
  seq = 0;
  async findUserByEmail(email: string) { return this.users.find((u) => u.email === email) ?? null; }
  async findUserById(id: string) { return this.users.find((u) => u.id === id) ?? null; }
  async createPendingUser(email: string) {
    const u: User = { id: `u${++this.seq}`, email, role: "member", status: "pending",
      classId: null, createdAt: new Date(0).toISOString() };
    this.users.push(u); return u;
  }
  async insertLoginToken(t: NewLoginToken) {
    this.tokens.push({ id: `t${++this.seq}`, email: t.email, codeHash: t.codeHash,
      linkTokenHash: t.linkTokenHash, expiresAt: t.expiresAt.toISOString(), usedAt: null,
      attempts: 0, _expires: t.expiresAt });
  }
  async findLatestActiveToken(email: string) {
    const now = Date.now();
    const list = this.tokens.filter((t) => t.email === email && !t.usedAt && t._expires.getTime() > now && t.attempts < MAX_CODE_ATTEMPTS);
    return list.length ? list[list.length - 1] : null;
  }
  async findActiveTokenByLinkHash(linkHash: string) {
    const now = Date.now();
    const list = this.tokens.filter((t) => t.linkTokenHash === linkHash && !t.usedAt && t._expires.getTime() > now);
    return list.length ? list[list.length - 1] : null;
  }
  async markTokenUsed(id: string) {
    const t = this.tokens.find((x) => x.id === id); if (t) t.usedAt = new Date().toISOString();
  }
  async incrementCodeAttempts(id: string) {
    const t = this.tokens.find((x) => x.id === id); if (t) t.attempts++;
  }
  async listUsers() { return [...this.users]; }
  async upsertActiveUser(email: string, role: UserRole): Promise<User> {
    const existing = this.users.find((u) => u.email === email);
    if (existing) { existing.status = "active"; existing.role = role; return existing; }
    const u: User = { id: `u${++this.seq}`, email, role, status: "active", classId: null, createdAt: new Date(0).toISOString() };
    this.users.push(u); return u;
  }
  async updateUser(
    id: string,
    data: { status?: UserStatus; role?: UserRole; classId?: string | null },
  ): Promise<User | null> {
    const u = this.users.find((x) => x.id === id);
    if (!u) return null;
    if (data.status !== undefined) u.status = data.status;
    if (data.role !== undefined) u.role = data.role;
    if (data.classId !== undefined) u.classId = data.classId;
    return u;
  }
  async listAdminEmails(): Promise<string[]> {
    return this.users.filter((u) => u.role === "admin" && u.status === "active").map((u) => u.email);
  }
}
class FakeMailer implements Mailer {
  sent: { to: string; code: string; link: string }[] = [];
  digests: { to: string; pendingCount: number; openReports: number }[] = [];
  async sendLoginEmail(to: string, code: string, link: string) { this.sent.push({ to, code, link }); }
  async sendDigest(to: string, data: { pendingCount: number; openReports: number }) {
    this.digests.push({ to, ...data });
  }
}

const DOMAINS = ["grundschule-xy.de"];
function makeService(repo: AuthRepo, mailer: Mailer, domains: string[] = DOMAINS) {
  return createAuthService({ repo, mailer, getAllowedDomains: async () => domains,
    tokenTtlMinutes: 15, appBaseUrl: "https://klara.test" });
}

describe("requestLogin", () => {
  let repo: FakeRepo; let mailer: FakeMailer;
  beforeEach(() => { repo = new FakeRepo(); mailer = new FakeMailer(); });

  it("aktiver Nutzer bekommt Mail mit 6-stelligem Code und Link → code_sent", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", classId: null, createdAt: "x" });
    const outcome = await makeService(repo, mailer).requestLogin("  A@Grundschule-XY.de ");
    expect(outcome).toBe("code_sent");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("a@grundschule-xy.de");
    expect(mailer.sent[0].code).toMatch(/^\d{6}$/);
    expect(mailer.sent[0].link).toContain("https://klara.test/api/auth/link?token=");
    expect(repo.tokens).toHaveLength(1);
  });

  it("neuer Domain-Nutzer wird pending angelegt, KEINE Mail → pending", async () => {
    const outcome = await makeService(repo, mailer).requestLogin("neu@grundschule-xy.de");
    expect(outcome).toBe("pending");
    expect(repo.users).toHaveLength(1);
    expect(repo.users[0].status).toBe("pending");
    expect(mailer.sent).toHaveLength(0);
  });

  it("bereits pending angelegter Nutzer → pending, KEINE Mail, kein zweiter Nutzer", async () => {
    repo.users.push({ id: "u1", email: "wartet@grundschule-xy.de", role: "member",
      status: "pending", classId: null, createdAt: "x" });
    const outcome = await makeService(repo, mailer).requestLogin("wartet@grundschule-xy.de");
    expect(outcome).toBe("pending");
    expect(repo.users).toHaveLength(1);
    expect(mailer.sent).toHaveLength(0);
  });

  it("fremde Domain: keine Mail, kein Nutzer → denied", async () => {
    const outcome = await makeService(repo, mailer).requestLogin("x@gmail.com");
    expect(outcome).toBe("denied");
    expect(repo.users).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("deaktivierter Nutzer → denied, KEINE Mail", async () => {
    repo.users.push({ id: "u1", email: "weg@grundschule-xy.de", role: "member",
      status: "disabled", classId: null, createdAt: "x" });
    const outcome = await makeService(repo, mailer).requestLogin("weg@grundschule-xy.de");
    expect(outcome).toBe("denied");
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("verifyCode", () => {
  let repo: FakeRepo; let mailer: FakeMailer;
  beforeEach(() => { repo = new FakeRepo(); mailer = new FakeMailer(); });

  it("korrekter Code eines aktiven Nutzers → User zurück, Token verbraucht", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", classId: null, createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const code = mailer.sent[0].code;
    const user = await svc.verifyCode("a@grundschule-xy.de", code);
    expect(user?.id).toBe("u1");
    expect(repo.tokens[0].usedAt).not.toBeNull();
  });

  it("falscher Code → null", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", classId: null, createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    expect(await svc.verifyCode("a@grundschule-xy.de", "000000")).toBeNull();
  });

  it("verbrauchter Token kann nicht erneut genutzt werden", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", classId: null, createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const code = mailer.sent[0].code;
    await svc.verifyCode("a@grundschule-xy.de", code);
    expect(await svc.verifyCode("a@grundschule-xy.de", code)).toBeNull();
  });

  it("nach 5 falschen Versuchen wird auch der korrekte Code abgelehnt (Token gesperrt)", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", classId: null, createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const correctCode = mailer.sent[0].code;
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await svc.verifyCode("a@grundschule-xy.de", "000000");
    }
    expect(await svc.verifyCode("a@grundschule-xy.de", correctCode)).toBeNull();
  });
});

describe("verifyLink", () => {
  it("gültiger Link-Token → User", async () => {
    const repo = new FakeRepo(); const mailer = new FakeMailer();
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", classId: null, createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const token = new URL(mailer.sent[0].link).searchParams.get("token")!;
    const user = await svc.verifyLink(token);
    expect(user?.id).toBe("u1");
  });
});

describe("DB-driven domains (#6)", () => {
  it("domain not in DB list AND not on allowlist → no mail, no user created", async () => {
    const repo = new FakeRepo(); const mailer = new FakeMailer();
    // DB has only grundschule-xy.de; login from other-school.de is denied
    const svc = makeService(repo, mailer, ["grundschule-xy.de"]);
    await svc.requestLogin("neu@other-school.de");
    expect(repo.users).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("domain added to DB list → new user from that domain creates pending user", async () => {
    const repo = new FakeRepo(); const mailer = new FakeMailer();
    // Start with empty domain list (simulate freshly removed domain)
    let domains: string[] = [];
    const svc = createAuthService({
      repo, mailer,
      getAllowedDomains: async () => [...domains],
      tokenTtlMinutes: 15, appBaseUrl: "https://klara.test",
    });

    // Before adding domain: denied
    await svc.requestLogin("neu@new-school.de");
    expect(repo.users).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);

    // Add domain to "DB" list
    domains = ["new-school.de"];

    // Now: user from new-school.de gets pending (create_pending action)
    await svc.requestLogin("neu@new-school.de");
    expect(repo.users).toHaveLength(1);
    expect(repo.users[0].status).toBe("pending");
    expect(mailer.sent).toHaveLength(0); // pending → no mail
  });
});
