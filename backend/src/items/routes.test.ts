import { describe, it, expect, vi } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { Item, ItemWithFolderName } from "./repo.js";
import type { ItemsService } from "./service.js";
import { AppError } from "./service.js";
import { registerItemRoutes } from "./routes.js";

// ---------------------------------------------------------------------------
// Fixtures
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

const ITEM: Item = {
  id: "item1",
  folderId: "f1",
  type: "photo",
  status: "pending",
  s3Key: "items/item1/web.jpg",
  thumbKey: "items/item1/thumb.jpg",
  caption: "",
  uploadedBy: "u1",
  approvedBy: null,
  createdAt: "2024-01-01",
  trashedAt: null,
};

// ---------------------------------------------------------------------------
// Fake service factory
// ---------------------------------------------------------------------------

function fakeService(over: Partial<ItemsService> = {}): ItemsService {
  return {
    presignUpload: async () => ({ itemId: "i1", webUploadUrl: "url-w", thumbUploadUrl: "url-t" }),
    confirmUpload: async () => ITEM,
    listFolderItems: async () => [],
    listPending: async () => [],
    approve: async (ids) => ({ approved: ids.length }),
    reject: async (ids) => ({ rejected: ids.length }),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function makeApp(service: ItemsService, user: User | null) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });

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

  registerItemRoutes(app, { itemsService: service, requireUser, requireAdmin });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// POST /api/folders/:folderId/uploads/presign
// ---------------------------------------------------------------------------

describe("POST /api/folders/:folderId/uploads/presign", () => {
  it("as user → 200 + { itemId, webUploadUrl, thumbUploadUrl }", async () => {
    const app = await makeApp(fakeService(), MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/folders/f1/uploads/presign",
      payload: { contentType: "image/jpeg" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ itemId: "i1", webUploadUrl: "url-w", thumbUploadUrl: "url-t" });
  });

  it("missing contentType → 400", async () => {
    const app = await makeApp(fakeService(), MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/folders/f1/uploads/presign",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("folder_not_found AppError → 404", async () => {
    const service = fakeService({
      presignUpload: async () => {
        throw new AppError("folder_not_found", "Folder not found or not enabled");
      },
    });
    const app = await makeApp(service, MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/folders/f-missing/uploads/presign",
      payload: { contentType: "image/jpeg" },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/folders/:folderId/items
// ---------------------------------------------------------------------------

describe("POST /api/folders/:folderId/items", () => {
  it("as user → 201 + item", async () => {
    const app = await makeApp(fakeService(), MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/folders/f1/items",
      payload: { itemId: "item1", caption: "A photo" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "item1" });
  });

  it("missing itemId → 400", async () => {
    const app = await makeApp(fakeService(), MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/folders/f1/items",
      payload: { caption: "no id" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("upload_incomplete AppError → 400 { error: 'upload_incomplete' }", async () => {
    const service = fakeService({
      confirmUpload: async () => {
        throw new AppError("upload_incomplete", "Both objects must be uploaded to S3 first");
      },
    });
    const app = await makeApp(service, MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/folders/f1/items",
      payload: { itemId: "item1" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "upload_incomplete" });
  });

  // Fix 2: already_confirmed → 409 { error: 'already_confirmed' }
  it("already_confirmed AppError → 409 { error: 'already_confirmed' }", async () => {
    const service = fakeService({
      confirmUpload: async () => {
        throw new AppError("already_confirmed", "Item already confirmed");
      },
    });
    const app = await makeApp(service, MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/folders/f1/items",
      payload: { itemId: "item1" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "already_confirmed" });
  });
});

// ---------------------------------------------------------------------------
// GET /api/folders/:folderId/items
// ---------------------------------------------------------------------------

describe("GET /api/folders/:folderId/items", () => {
  it("as member → 200 + array", async () => {
    const app = await makeApp(fakeService({ listFolderItems: async () => [] }), MEMBER);

    const res = await app.inject({ method: "GET", url: "/api/folders/f1/items" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("as admin → calls listFolderItems with { isAdmin: true }", async () => {
    const listFolderItems = vi.fn(async () => []);
    const app = await makeApp(fakeService({ listFolderItems }), ADMIN);

    await app.inject({ method: "GET", url: "/api/folders/f1/items" });

    expect(listFolderItems).toHaveBeenCalledWith("f1", { isAdmin: true });
  });

  // Fix 1: folder_not_found from service → 404 { error: 'folder_not_found' }
  it("folder_not_found AppError → 404 { error: 'folder_not_found' }", async () => {
    const service = fakeService({
      listFolderItems: async () => {
        throw new AppError("folder_not_found", "Folder not found or not enabled");
      },
    });
    const app = await makeApp(service, MEMBER);

    const res = await app.inject({ method: "GET", url: "/api/folders/f-dis/items" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "folder_not_found" });
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/pending
// ---------------------------------------------------------------------------

describe("GET /api/admin/pending", () => {
  it("as admin → 200 + array", async () => {
    const app = await makeApp(fakeService(), ADMIN);

    const res = await app.inject({ method: "GET", url: "/api/admin/pending" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("as member → 403", async () => {
    const app = await makeApp(fakeService(), MEMBER);

    const res = await app.inject({ method: "GET", url: "/api/admin/pending" });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/items/approve
// ---------------------------------------------------------------------------

describe("POST /api/admin/items/approve", () => {
  it("as admin → 200 + { approved: 2 }", async () => {
    const app = await makeApp(fakeService(), ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/items/approve",
      payload: { ids: ["id1", "id2"] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ approved: 2 });
  });

  it("as member → 403", async () => {
    const app = await makeApp(fakeService(), MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/items/approve",
      payload: { ids: ["id1"] },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/items/reject
// ---------------------------------------------------------------------------

describe("POST /api/admin/items/reject", () => {
  it("as admin → 200 + { rejected: 2 }", async () => {
    const app = await makeApp(fakeService(), ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/items/reject",
      payload: { ids: ["id1", "id2"] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rejected: 2 });
  });

  it("missing/empty ids → 400", async () => {
    const app = await makeApp(fakeService(), ADMIN);

    const noIds = await app.inject({
      method: "POST",
      url: "/api/admin/items/reject",
      payload: {},
    });
    expect(noIds.statusCode).toBe(400);

    const emptyIds = await app.inject({
      method: "POST",
      url: "/api/admin/items/reject",
      payload: { ids: [] },
    });
    expect(emptyIds.statusCode).toBe(400);
  });
});
