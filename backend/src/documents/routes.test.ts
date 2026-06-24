import { describe, it, expect, vi } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { Storage } from "../storage/s3.js";
import type { FoldersRepo, Folder } from "../folders/repo.js";
import type { DocumentsRepo, DocumentRow } from "./repo.js";
import { registerDocumentRoutes } from "./routes.js";

const ADMIN: User = { id: "a1", email: "a@x.de", role: "admin", status: "active", classId: null, createdAt: "x" };
const MEMBER: User = { id: "m1", email: "m@x.de", role: "member", status: "active", classId: "class-a", createdAt: "x" };

const FOLDER: Folder = {
  id: "f1", name: "Klasse 3b", schoolYear: "2025", classLabel: "3b", enabled: true,
  createdBy: null, createdAt: "x", coverItemId: null, startDate: null, endDate: null, sortOrder: 0, classIds: [],
};

const DOC: DocumentRow = {
  id: "d1", folderId: "f1", filename: "Elternbrief.pdf", contentType: "application/pdf",
  sizeBytes: 1234, s3Key: "documents/d1", uploadedBy: "a1", createdAt: "x",
};

function fakeStorage(over: Partial<Storage> = {}): Storage {
  return {
    presignPut: async (key) => `https://s3/put/${key}`,
    presignGet: async (key) => `https://s3/get/${key}`,
    headExists: async () => true,
    head: async () => ({ size: 1234 }),
    deleteObjects: async () => {},
    ...over,
  };
}

function fakeFoldersRepo(over: Partial<FoldersRepo> = {}): FoldersRepo {
  return {
    listAll: async () => [], listEnabled: async () => [], listForClass: async () => [],
    create: async () => FOLDER, update: async () => null, setClasses: async () => {},
    isVisibleToClass: async () => true, findById: async () => FOLDER,
    itemCounts: async () => new Map(), move: async () => false, softDelete: async () => true,
    ...over,
  };
}

function fakeDocumentsRepo(over: Partial<DocumentsRepo> = {}): DocumentsRepo {
  return {
    listByFolder: async () => [],
    countByFolder: async () => 0,
    countsByFolder: async () => new Map(),
    insert: async (d) => ({ ...DOC, ...d, uploadedBy: d.uploadedBy }),
    findById: async () => null,
    deleteById: async () => ({ s3Key: "documents/d1" }),
    ...over,
  };
}

async function makeApp(opts: {
  user: User | null;
  documentsRepo?: DocumentsRepo;
  foldersRepo?: FoldersRepo;
  storage?: Storage;
  maxDocumentBytes?: number;
}) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test" });
  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!opts.user) { await reply.code(401).send({ error: "unauth" }); return; }
    req.user = opts.user;
  };
  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!opts.user) { await reply.code(401).send({ error: "unauth" }); return; }
    if (opts.user.role !== "admin") { await reply.code(403).send({ error: "forbidden" }); return; }
    req.user = opts.user;
  };
  registerDocumentRoutes(app, {
    documentsRepo: opts.documentsRepo ?? fakeDocumentsRepo(),
    foldersRepo: opts.foldersRepo ?? fakeFoldersRepo(),
    storage: opts.storage ?? fakeStorage(),
    maxDocumentBytes: opts.maxDocumentBytes ?? 26_214_400,
    requireUser, requireAdmin,
  });
  await app.ready();
  return app;
}

describe("POST documents/presign", () => {
  it("admin → 200 + docId + documents/{id} upload url", async () => {
    const app = await makeApp({ user: ADMIN });
    const res = await app.inject({ method: "POST", url: "/api/admin/folders/f1/documents/presign", payload: { contentType: "application/pdf" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.docId).toBeTypeOf("string");
    expect(body.uploadUrl).toContain("/documents/");
  });
  it("folder missing → 404", async () => {
    const app = await makeApp({ user: ADMIN, foldersRepo: fakeFoldersRepo({ findById: async () => null }) });
    const res = await app.inject({ method: "POST", url: "/api/admin/folders/f1/documents/presign", payload: { contentType: "application/pdf" } });
    expect(res.statusCode).toBe(404);
  });
  it("already 10 docs → 409 document_limit_reached", async () => {
    const app = await makeApp({ user: ADMIN, documentsRepo: fakeDocumentsRepo({ countByFolder: async () => 10 }) });
    const res = await app.inject({ method: "POST", url: "/api/admin/folders/f1/documents/presign", payload: { contentType: "application/pdf" } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "document_limit_reached" });
  });
  it("non-admin → 403", async () => {
    const app = await makeApp({ user: MEMBER });
    const res = await app.inject({ method: "POST", url: "/api/admin/folders/f1/documents/presign", payload: { contentType: "application/pdf" } });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST documents (confirm)", () => {
  it("under limit → 201 + persisted view", async () => {
    const insert = vi.fn(fakeDocumentsRepo().insert);
    const app = await makeApp({ user: ADMIN, documentsRepo: fakeDocumentsRepo({ insert }) });
    const res = await app.inject({ method: "POST", url: "/api/admin/folders/f1/documents", payload: { docId: "d1", filename: "Elternbrief.pdf", contentType: "application/pdf" } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ filename: "Elternbrief.pdf", downloadUrl: expect.stringContaining("documents/d1") });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: "d1", s3Key: "documents/d1", sizeBytes: 1234 }));
  });
  it("too large → 413 + deletes object + no insert", async () => {
    const insert = vi.fn(fakeDocumentsRepo().insert);
    const deleteObjects = vi.fn(async () => {});
    const app = await makeApp({
      user: ADMIN,
      documentsRepo: fakeDocumentsRepo({ insert }),
      storage: fakeStorage({ head: async () => ({ size: 99_000_000 }), deleteObjects }),
      maxDocumentBytes: 26_214_400,
    });
    const res = await app.inject({ method: "POST", url: "/api/admin/folders/f1/documents", payload: { docId: "d1", filename: "big.zip", contentType: "application/zip" } });
    expect(res.statusCode).toBe(413);
    expect(deleteObjects).toHaveBeenCalledWith(["documents/d1"]);
    expect(insert).not.toHaveBeenCalled();
  });
  it("limit reached at confirm → 409 + deletes object", async () => {
    const deleteObjects = vi.fn(async () => {});
    const app = await makeApp({
      user: ADMIN,
      documentsRepo: fakeDocumentsRepo({ countByFolder: async () => 10 }),
      storage: fakeStorage({ deleteObjects }),
    });
    const res = await app.inject({ method: "POST", url: "/api/admin/folders/f1/documents", payload: { docId: "d1", filename: "x.pdf", contentType: "application/pdf" } });
    expect(res.statusCode).toBe(409);
    expect(deleteObjects).toHaveBeenCalledWith(["documents/d1"]);
  });
  it("upload missing in S3 → 400 upload_incomplete", async () => {
    const app = await makeApp({ user: ADMIN, storage: fakeStorage({ headExists: async () => false }) });
    const res = await app.inject({ method: "POST", url: "/api/admin/folders/f1/documents", payload: { docId: "d1", filename: "x.pdf", contentType: "application/pdf" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET documents (list)", () => {
  it("admin → 200 + list with downloadUrl", async () => {
    const app = await makeApp({ user: ADMIN, documentsRepo: fakeDocumentsRepo({ listByFolder: async () => [DOC] }) });
    const res = await app.inject({ method: "GET", url: "/api/folders/f1/documents" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "d1", filename: "Elternbrief.pdf" });
    expect(body[0].downloadUrl).toContain("documents/d1");
    expect(body[0].s3Key).toBeUndefined(); // internal key not leaked
  });
  it("member without folder visibility → 404", async () => {
    const app = await makeApp({ user: MEMBER, foldersRepo: fakeFoldersRepo({ isVisibleToClass: async () => false }) });
    const res = await app.inject({ method: "GET", url: "/api/folders/f1/documents" });
    expect(res.statusCode).toBe(404);
  });
  it("member with visibility → 200", async () => {
    const app = await makeApp({ user: MEMBER, foldersRepo: fakeFoldersRepo({ isVisibleToClass: async () => true }), documentsRepo: fakeDocumentsRepo({ listByFolder: async () => [DOC] }) });
    const res = await app.inject({ method: "GET", url: "/api/folders/f1/documents" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});

describe("DELETE document", () => {
  it("admin → 204 + deletes row + S3", async () => {
    const deleteObjects = vi.fn(async () => {});
    const app = await makeApp({ user: ADMIN, documentsRepo: fakeDocumentsRepo({ deleteById: async () => ({ s3Key: "documents/d1" }) }), storage: fakeStorage({ deleteObjects }) });
    const res = await app.inject({ method: "DELETE", url: "/api/admin/documents/d1" });
    expect(res.statusCode).toBe(204);
    expect(deleteObjects).toHaveBeenCalledWith(["documents/d1"]);
  });
  it("missing → 404", async () => {
    const app = await makeApp({ user: ADMIN, documentsRepo: fakeDocumentsRepo({ deleteById: async () => null }) });
    const res = await app.inject({ method: "DELETE", url: "/api/admin/documents/nope" });
    expect(res.statusCode).toBe(404);
  });
  it("non-admin → 403", async () => {
    const app = await makeApp({ user: MEMBER });
    const res = await app.inject({ method: "DELETE", url: "/api/admin/documents/d1" });
    expect(res.statusCode).toBe(403);
  });
});
