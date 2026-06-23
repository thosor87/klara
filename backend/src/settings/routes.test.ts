import { describe, it, expect } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { DomainsRepo, ClassOptionsRepo, ClassOption } from "./repo.js";
import { registerSettingsRoutes } from "./routes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEMBER: User = {
  id: "u-member",
  email: "member@grundschule.de",
  role: "member",
  status: "active",
  classId: null,
  createdAt: "2024-01-01",
};

const ADMIN: User = {
  id: "u-admin",
  email: "admin@grundschule.de",
  role: "admin",
  status: "active",
  classId: null,
  createdAt: "2024-01-01",
};

function fakeDomainsRepo(over: Partial<DomainsRepo> = {}): DomainsRepo {
  const store: string[] = ["gs-alexandersfeld.de"];
  return {
    list: async () => [...store],
    add: async (d) => { const n = d.trim().toLowerCase(); if (!store.includes(n)) store.push(n); },
    remove: async (d) => { const i = store.indexOf(d.trim().toLowerCase()); if (i >= 0) store.splice(i, 1); },
    ...over,
  };
}

function fakeClassOptionsRepo(over: Partial<ClassOptionsRepo> = {}): ClassOptionsRepo {
  let seq = 1;
  const store: ClassOption[] = [
    { id: "co1", label: "1. Klasse", sortOrder: 1, createdAt: "x" },
    { id: "co2", label: "2. Klasse", sortOrder: 2, createdAt: "x" },
  ];
  return {
    list: async () => [...store],
    add: async (label) => {
      const opt: ClassOption = { id: `co${++seq}`, label, sortOrder: 99, createdAt: "x" };
      store.push(opt); return opt;
    },
    remove: async (id) => { const i = store.findIndex((o) => o.id === id); if (i >= 0) store.splice(i, 1); },
    ...over,
  };
}

async function makeApp(user: User | null, domainsRepo?: DomainsRepo, classOptionsRepo?: ClassOptionsRepo) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });

  const requireUser = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!user) { await reply.code(401).send({ error: "unauthenticated" }); return; }
    req.user = user;
  };
  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!user) { await reply.code(401).send({ error: "unauthenticated" }); return; }
    if (user.role !== "admin") { await reply.code(403).send({ error: "forbidden" }); return; }
    req.user = user;
  };

  registerSettingsRoutes(app, {
    domainsRepo: domainsRepo ?? fakeDomainsRepo(),
    classOptionsRepo: classOptionsRepo ?? fakeClassOptionsRepo(),
    requireUser,
    requireAdmin,
  });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

describe("GET /api/admin/domains", () => {
  it("admin gets list", async () => {
    const app = await makeApp(ADMIN);
    const res = await app.inject({ method: "GET", url: "/api/admin/domains" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toContain("gs-alexandersfeld.de");
  });

  it("member → 403", async () => {
    const app = await makeApp(MEMBER);
    const res = await app.inject({ method: "GET", url: "/api/admin/domains" });
    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated → 401", async () => {
    const app = await makeApp(null);
    const res = await app.inject({ method: "GET", url: "/api/admin/domains" });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/admin/domains", () => {
  it("admin adds domain → 201", async () => {
    const repo = fakeDomainsRepo();
    const app = await makeApp(ADMIN, repo);
    const res = await app.inject({
      method: "POST", url: "/api/admin/domains",
      payload: { domain: "  NEW-SCHOOL.DE  " },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ domain: "new-school.de" });
    // confirm in list
    const list = await repo.list();
    expect(list).toContain("new-school.de");
  });

  it("missing domain → 400", async () => {
    const app = await makeApp(ADMIN);
    const res = await app.inject({ method: "POST", url: "/api/admin/domains", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("member → 403", async () => {
    const app = await makeApp(MEMBER);
    const res = await app.inject({
      method: "POST", url: "/api/admin/domains",
      payload: { domain: "x.de" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("DELETE /api/admin/domains/:domain", () => {
  it("admin removes domain → 204", async () => {
    const repo = fakeDomainsRepo();
    const app = await makeApp(ADMIN, repo);
    const res = await app.inject({ method: "DELETE", url: "/api/admin/domains/gs-alexandersfeld.de" });
    expect(res.statusCode).toBe(204);
    const list = await repo.list();
    expect(list).not.toContain("gs-alexandersfeld.de");
  });

  it("member → 403", async () => {
    const app = await makeApp(MEMBER);
    const res = await app.inject({ method: "DELETE", url: "/api/admin/domains/gs-alexandersfeld.de" });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Class Options (admin)
// ---------------------------------------------------------------------------

describe("GET /api/admin/class-options", () => {
  it("admin gets list ordered", async () => {
    const app = await makeApp(ADMIN);
    const res = await app.inject({ method: "GET", url: "/api/admin/class-options" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ClassOption[];
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toMatchObject({ id: expect.any(String), label: expect.any(String) });
  });

  it("member → 403", async () => {
    const app = await makeApp(MEMBER);
    const res = await app.inject({ method: "GET", url: "/api/admin/class-options" });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /api/admin/class-options", () => {
  it("admin adds option → 201", async () => {
    const repo = fakeClassOptionsRepo();
    const app = await makeApp(ADMIN, undefined, repo);
    const res = await app.inject({
      method: "POST", url: "/api/admin/class-options",
      payload: { label: "5. Klasse" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ label: "5. Klasse" });
    const list = await repo.list();
    expect(list.some((o) => o.label === "5. Klasse")).toBe(true);
  });

  it("missing label → 400", async () => {
    const app = await makeApp(ADMIN);
    const res = await app.inject({ method: "POST", url: "/api/admin/class-options", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("member → 403", async () => {
    const app = await makeApp(MEMBER);
    const res = await app.inject({
      method: "POST", url: "/api/admin/class-options",
      payload: { label: "5. Klasse" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("DELETE /api/admin/class-options/:id", () => {
  it("admin removes option → 204", async () => {
    const repo = fakeClassOptionsRepo();
    const app = await makeApp(ADMIN, undefined, repo);
    const res = await app.inject({ method: "DELETE", url: "/api/admin/class-options/co1" });
    expect(res.statusCode).toBe(204);
    const list = await repo.list();
    expect(list.some((o) => o.id === "co1")).toBe(false);
  });

  it("member → 403", async () => {
    const app = await makeApp(MEMBER);
    const res = await app.inject({ method: "DELETE", url: "/api/admin/class-options/co1" });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/class-options (requireUser — for folder form dropdown)
// ---------------------------------------------------------------------------

describe("GET /api/class-options", () => {
  it("member (user) can access class options list", async () => {
    const app = await makeApp(MEMBER);
    const res = await app.inject({ method: "GET", url: "/api/class-options" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ClassOption[];
    expect(body.length).toBeGreaterThan(0);
  });

  it("admin can also access", async () => {
    const app = await makeApp(ADMIN);
    const res = await app.inject({ method: "GET", url: "/api/class-options" });
    expect(res.statusCode).toBe(200);
  });

  it("unauthenticated → 401", async () => {
    const app = await makeApp(null);
    const res = await app.inject({ method: "GET", url: "/api/class-options" });
    expect(res.statusCode).toBe(401);
  });
});
