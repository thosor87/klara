import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { AuthService } from "./service.js";
import { registerAuthRoutes } from "./routes.js";

function fakeService(over: Partial<AuthService> = {}): AuthService {
  return {
    requestLogin: async () => "denied",
    verifyCode: async () => null,
    verifyLink: async () => null,
    ...over,
  };
}
const ACTIVE: User = { id: "u1", email: "a@grundschule-xy.de", role: "admin",
  status: "active", createdAt: "x" };

async function makeApp(svc: AuthService, lookup: (id: string) => Promise<User | null>) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });
  registerAuthRoutes(app, { service: svc, findUserById: lookup,
    sessionMaxDays: 30, isProd: false });
  await app.ready();
  return app;
}

describe("POST /api/auth/request", () => {
  it("gibt das Outcome des Service zurück (code_sent)", async () => {
    const app = await makeApp(fakeService({ requestLogin: async () => "code_sent" }), async () => null);
    const res = await app.inject({ method: "POST", url: "/api/auth/request",
      payload: { email: "a@grundschule-xy.de" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: "code_sent" });
  });

  it("gibt pending zurück", async () => {
    const app = await makeApp(fakeService({ requestLogin: async () => "pending" }), async () => null);
    const res = await app.inject({ method: "POST", url: "/api/auth/request",
      payload: { email: "neu@grundschule-xy.de" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: "pending" });
  });

  it("gibt denied zurück", async () => {
    const app = await makeApp(fakeService({ requestLogin: async () => "denied" }), async () => null);
    const res = await app.inject({ method: "POST", url: "/api/auth/request",
      payload: { email: "x@gmail.com" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: "denied" });
  });

  it("ohne E-Mail im Body → denied, Service wird nicht aufgerufen", async () => {
    let called = false;
    const app = await makeApp(fakeService({ requestLogin: async () => { called = true; return "code_sent"; } }), async () => null);
    const res = await app.inject({ method: "POST", url: "/api/auth/request", payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: "denied" });
    expect(called).toBe(false);
  });
});

describe("POST /api/auth/verify", () => {
  it("falscher Code → 401, kein Cookie", async () => {
    const app = await makeApp(fakeService({ verifyCode: async () => null }), async () => null);
    const res = await app.inject({ method: "POST", url: "/api/auth/verify",
      payload: { email: "a@grundschule-xy.de", code: "000000" } });
    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("korrekter Code → 200 + Session-Cookie", async () => {
    const app = await makeApp(fakeService({ verifyCode: async () => ACTIVE }), async () => ACTIVE);
    const res = await app.inject({ method: "POST", url: "/api/auth/verify",
      payload: { email: "a@grundschule-xy.de", code: "123456" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("a@grundschule-xy.de");
    expect(String(res.headers["set-cookie"])).toContain("klara_session=");
  });
});

describe("GET /api/me", () => {
  it("ohne Cookie → 401", async () => {
    const app = await makeApp(fakeService(), async () => null);
    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
  });

  it("mit gültiger Session → aktueller User", async () => {
    const app = await makeApp(fakeService({ verifyCode: async () => ACTIVE }), async () => ACTIVE);
    const login = await app.inject({ method: "POST", url: "/api/auth/verify",
      payload: { email: "a@grundschule-xy.de", code: "123456" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const res = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe("u1");
  });
});
