import { describe, it, expect } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { FoldersRepo, Folder } from "./repo.js";
import { registerFolderRoutes } from "./routes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEMBER: User = {
  id: "u-member",
  email: "member@grundschule.de",
  role: "member",
  status: "active",
  createdAt: "2024-01-01",
};

const ADMIN: User = {
  id: "u-admin",
  email: "admin@grundschule.de",
  role: "admin",
  status: "active",
  createdAt: "2024-01-01",
};

const FOLDER_ENABLED: Folder = {
  id: "f-enabled",
  name: "Klassenfahrt 2024",
  schoolYear: "2023/24",
  classLabel: "4a",
  enabled: true,
  createdBy: "u-admin",
  createdAt: "2024-01-01",
};

const FOLDER_DISABLED: Folder = {
  id: "f-disabled",
  name: "Archiv",
  schoolYear: "2022/23",
  classLabel: "3b",
  enabled: false,
  createdBy: "u-admin",
  createdAt: "2023-01-01",
};

function fakeFoldersRepo(over: Partial<FoldersRepo> = {}): FoldersRepo {
  return {
    listAll: async () => [],
    listEnabled: async () => [],
    create: async (d) => ({
      id: "f1",
      name: d.name,
      schoolYear: d.schoolYear,
      classLabel: d.classLabel,
      enabled: true,
      createdBy: d.createdBy,
      createdAt: "2024-01-01",
    }),
    update: async () => null,
    findById: async () => null,
    itemCounts: async () => new Map(),
    ...over,
  };
}

async function makeApp(foldersRepo: FoldersRepo, user: User | null) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });

  // Fake guards inject req.user from test-controlled `user`
  const requireUser = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!user) {
      await reply.code(401).send({ error: "unauthenticated" });
      return;
    }
    req.user = user;
  };

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!user) {
      await reply.code(401).send({ error: "unauthenticated" });
      return;
    }
    if (user.role !== "admin") {
      await reply.code(403).send({ error: "forbidden" });
      return;
    }
    req.user = user;
  };

  registerFolderRoutes(app, { foldersRepo, requireUser, requireAdmin });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/folders
// ---------------------------------------------------------------------------

describe("GET /api/folders", () => {
  it("member sees only enabled folders, each with itemCount", async () => {
    const repo = fakeFoldersRepo({
      listEnabled: async () => [FOLDER_ENABLED],
      itemCounts: async () => new Map([["f-enabled", 5]]),
    });
    const app = await makeApp(repo, MEMBER);

    const res = await app.inject({ method: "GET", url: "/api/folders" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: string; itemCount: number; enabled: boolean }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("f-enabled");
    expect(body[0].itemCount).toBe(5);
    expect(body[0].enabled).toBe(true);
  });

  it("admin sees all folders (including disabled) with itemCount", async () => {
    const repo = fakeFoldersRepo({
      listAll: async () => [FOLDER_ENABLED, FOLDER_DISABLED],
      itemCounts: async () => new Map([["f-enabled", 3]]),
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({ method: "GET", url: "/api/folders" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: string; itemCount: number }>;
    expect(body).toHaveLength(2);
    expect(body.find((f) => f.id === "f-disabled")?.itemCount).toBe(0);
    expect(body.find((f) => f.id === "f-enabled")?.itemCount).toBe(3);
  });

  it("unauthenticated → 401", async () => {
    const app = await makeApp(fakeFoldersRepo(), null);
    const res = await app.inject({ method: "GET", url: "/api/folders" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthenticated" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/folders
// ---------------------------------------------------------------------------

describe("POST /api/admin/folders", () => {
  it("admin creates folder → 201 with folder data", async () => {
    const repo = fakeFoldersRepo({
      create: async (d) => ({
        id: "f-new",
        name: d.name,
        schoolYear: d.schoolYear,
        classLabel: d.classLabel,
        enabled: true,
        createdBy: d.createdBy,
        createdAt: "2024-06-01",
      }),
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders",
      payload: { name: "Ausflug Wald", schoolYear: "2024/25", classLabel: "2b" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as Folder;
    expect(body.id).toBe("f-new");
    expect(body.name).toBe("Ausflug Wald");
    expect(body.schoolYear).toBe("2024/25");
    expect(body.classLabel).toBe("2b");
    expect(body.createdBy).toBe(ADMIN.id);
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeFoldersRepo(), MEMBER);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders",
      payload: { name: "Test" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });

  it("missing name → 400", async () => {
    const app = await makeApp(fakeFoldersRepo(), ADMIN);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders",
      payload: { schoolYear: "2024/25" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: expect.stringContaining("name") });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/folders/:id
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/folders/:id", () => {
  it("admin updates folder → 200 with updated folder", async () => {
    const updated: Folder = { ...FOLDER_ENABLED, name: "Aktualisiert", enabled: false };
    const repo = fakeFoldersRepo({
      update: async (_id, _data) => updated,
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/folders/${FOLDER_ENABLED.id}`,
      payload: { name: "Aktualisiert", enabled: false },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Folder;
    expect(body.name).toBe("Aktualisiert");
    expect(body.enabled).toBe(false);
  });

  it("unknown id → 404", async () => {
    const repo = fakeFoldersRepo({ update: async () => null });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/folders/nonexistent",
      payload: { name: "X" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not found" });
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeFoldersRepo(), MEMBER);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/folders/f-enabled",
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });
});
