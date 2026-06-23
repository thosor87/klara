import { describe, it, expect } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { ItemsRepo, Item, ItemWithFolderName } from "../items/repo.js";
import type { Storage } from "../storage/s3.js";
import { registerTrashRoutes } from "./trash-routes.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN: User = {
  id: "u-admin",
  email: "admin@grundschule.de",
  role: "admin",
  status: "active",
  createdAt: "2024-01-01",
};

const MEMBER: User = {
  id: "u-member",
  email: "member@grundschule.de",
  role: "member",
  status: "active",
  createdAt: "2024-01-01",
};

const TRASHED_ITEM: ItemWithFolderName = {
  id: "item1",
  folderId: "f1",
  type: "photo",
  status: "trashed",
  s3Key: "items/item1/web.jpg",
  thumbKey: "items/item1/thumb.jpg",
  caption: "Ein Foto",
  uploadedBy: "u1",
  approvedBy: null,
  createdAt: "2024-01-01",
  trashedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(), // 5 days ago
  folderName: "Klasse 3b",
};

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeItemsRepo(overrides: Partial<ItemsRepo> = {}): ItemsRepo {
  return {
    insertPending: async () => null,
    listByFolder: async () => [],
    listForMember: async () => [],
    listPending: async () => [],
    setStatusApproved: async () => 0,
    setStatusTrashed: async () => 0,
    setStatusPending: async () => 0,
    findById: async () => null,
    deleteById: async () => null,
    listTrashed: async () => [],
    restore: async () => true,
    countPending: async () => 0,
    purgeTrashed: async () => [],
    trashItemById: async () => true,
    uploadCountsByUser: async () => ({}),
    ...overrides,
  };
}

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  return {
    presignPut: async (key) => `https://s3.example.com/put/${key}`,
    presignGet: async (key) => `https://s3.example.com/get/${key}`,
    headExists: async () => true,
    deleteObjects: async () => {},
    ...overrides,
  };
}

async function makeApp(repo: ItemsRepo, user: User | null) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!user) { await reply.code(401).send({ error: "unauthenticated" }); return; }
    if (user.role !== "admin") { await reply.code(403).send({ error: "forbidden" }); return; }
    req.user = user;
  };

  registerTrashRoutes(app, {
    itemsRepo: repo,
    storage: fakeStorage(),
    trashRetentionDays: 30,
    requireAdmin,
  });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/admin/trash
// ---------------------------------------------------------------------------

describe("GET /api/admin/trash", () => {
  it("admin → 200 + trashed items with daysLeft and thumbUrl", async () => {
    const repo = fakeItemsRepo({ listTrashed: async () => [TRASHED_ITEM] });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({ method: "GET", url: "/api/admin/trash" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{
      id: string; folderName: string; caption: string;
      trashedAt: string; daysLeft: number; thumbUrl: string;
    }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("item1");
    expect(body[0].folderName).toBe("Klasse 3b");
    expect(body[0].caption).toBe("Ein Foto");
    expect(body[0].daysLeft).toBe(25); // 30 - 5 = 25
    expect(body[0].thumbUrl).toBe("https://s3.example.com/get/items/item1/thumb.jpg");
  });

  it("returns empty array when no trashed items", async () => {
    const app = await makeApp(fakeItemsRepo(), ADMIN);

    const res = await app.inject({ method: "GET", url: "/api/admin/trash" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeItemsRepo(), MEMBER);

    const res = await app.inject({ method: "GET", url: "/api/admin/trash" });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/trash/:itemId/restore
// ---------------------------------------------------------------------------

describe("POST /api/admin/trash/:itemId/restore", () => {
  it("admin restores a trashed item → 200 { ok: true }", async () => {
    const repo = fakeItemsRepo({ restore: async () => true });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/trash/item1/restore",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("item not found or not trashed → 404", async () => {
    const repo = fakeItemsRepo({ restore: async () => false });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/trash/nonexistent/restore",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "item_not_found" });
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeItemsRepo(), MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/trash/item1/restore",
    });

    expect(res.statusCode).toBe(403);
  });
});
