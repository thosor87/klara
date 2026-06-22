import { describe, it, expect, beforeEach } from "vitest";
import type { User, LoginTokenRow } from "../types.js";
import type { AuthRepo, NewLoginToken } from "./repo.js";
import type { Mailer } from "./mailer.js";
import { createAuthService } from "./service.js";

// --- In-Memory-Fakes ---
class FakeRepo implements AuthRepo {
  users: User[] = [];
  tokens: (LoginTokenRow & { _expires: Date })[] = [];
  seq = 0;
  async findUserByEmail(email: string) { return this.users.find((u) => u.email === email) ?? null; }
  async findUserById(id: string) { return this.users.find((u) => u.id === id) ?? null; }
  async createPendingUser(email: string) {
    const u: User = { id: `u${++this.seq}`, email, role: "member", status: "pending",
      createdAt: new Date(0).toISOString() };
    this.users.push(u); return u;
  }
  async insertLoginToken(t: NewLoginToken) {
    this.tokens.push({ id: `t${++this.seq}`, email: t.email, codeHash: t.codeHash,
      linkTokenHash: t.linkTokenHash, expiresAt: t.expiresAt.toISOString(), usedAt: null,
      _expires: t.expiresAt });
  }
  async findLatestActiveToken(email: string) {
    const now = Date.now();
    const list = this.tokens.filter((t) => t.email === email && !t.usedAt && t._expires.getTime() > now);
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
}
class FakeMailer implements Mailer {
  sent: { to: string; code: string; link: string }[] = [];
  async sendLoginEmail(to: string, code: string, link: string) { this.sent.push({ to, code, link }); }
}

const DOMAINS = ["grundschule-xy.de"];
function makeService(repo: AuthRepo, mailer: Mailer) {
  return createAuthService({ repo, mailer, allowedDomains: DOMAINS,
    tokenTtlMinutes: 15, appBaseUrl: "https://klara.test" });
}

describe("requestLogin", () => {
  let repo: FakeRepo; let mailer: FakeMailer;
  beforeEach(() => { repo = new FakeRepo(); mailer = new FakeMailer(); });

  it("aktiver Nutzer bekommt Mail mit 6-stelligem Code und Link", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    await makeService(repo, mailer).requestLogin("  A@Grundschule-XY.de ");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("a@grundschule-xy.de");
    expect(mailer.sent[0].code).toMatch(/^\d{6}$/);
    expect(mailer.sent[0].link).toContain("https://klara.test/api/auth/link?token=");
    expect(repo.tokens).toHaveLength(1);
  });

  it("neuer Domain-Nutzer wird pending angelegt, KEINE Mail", async () => {
    await makeService(repo, mailer).requestLogin("neu@grundschule-xy.de");
    expect(repo.users).toHaveLength(1);
    expect(repo.users[0].status).toBe("pending");
    expect(mailer.sent).toHaveLength(0);
  });

  it("fremde Domain: keine Mail, kein Nutzer", async () => {
    await makeService(repo, mailer).requestLogin("x@gmail.com");
    expect(repo.users).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("verifyCode", () => {
  let repo: FakeRepo; let mailer: FakeMailer;
  beforeEach(() => { repo = new FakeRepo(); mailer = new FakeMailer(); });

  it("korrekter Code eines aktiven Nutzers → User zurück, Token verbraucht", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const code = mailer.sent[0].code;
    const user = await svc.verifyCode("a@grundschule-xy.de", code);
    expect(user?.id).toBe("u1");
    expect(repo.tokens[0].usedAt).not.toBeNull();
  });

  it("falscher Code → null", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    expect(await svc.verifyCode("a@grundschule-xy.de", "000000")).toBeNull();
  });

  it("verbrauchter Token kann nicht erneut genutzt werden", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const code = mailer.sent[0].code;
    await svc.verifyCode("a@grundschule-xy.de", code);
    expect(await svc.verifyCode("a@grundschule-xy.de", code)).toBeNull();
  });
});

describe("verifyLink", () => {
  it("gültiger Link-Token → User", async () => {
    const repo = new FakeRepo(); const mailer = new FakeMailer();
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const token = new URL(mailer.sent[0].link).searchParams.get("token")!;
    const user = await svc.verifyLink(token);
    expect(user?.id).toBe("u1");
  });
});
