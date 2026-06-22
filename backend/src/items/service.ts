import { randomUUID } from "crypto";
import type { Storage } from "../storage/s3.js";
import type { ItemsRepo, Item, ItemWithFolderName, ItemStatus } from "./repo.js";
import type { FoldersRepo } from "../folders/repo.js";

export class AppError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export interface ItemsServiceDeps {
  itemsRepo: ItemsRepo;
  foldersRepo: FoldersRepo;
  storage: Storage;
}

export interface ItemsService {
  presignUpload(
    folderId: string,
    contentType: string,
  ): Promise<{ itemId: string; webUploadUrl: string; thumbUploadUrl: string }>;
  confirmUpload(folderId: string, itemId: string, caption: string, userId: string): Promise<Item>;
  listFolderItems(
    folderId: string,
    opts: { isAdmin: boolean },
  ): Promise<Array<Item & { thumbUrl: string; webUrl: string }>>;
  listPending(): Promise<Array<ItemWithFolderName & { thumbUrl: string; webUrl: string }>>;
  approve(ids: string[], adminId: string): Promise<{ approved: number }>;
  reject(ids: string[]): Promise<{ rejected: number }>;
}

export function createItemsService(deps: ItemsServiceDeps): ItemsService {
  const { itemsRepo, foldersRepo, storage } = deps;

  return {
    async presignUpload(folderId, contentType) {
      const folder = await foldersRepo.findById(folderId);
      if (!folder || !folder.enabled) {
        throw new AppError("folder_not_found", "Folder not found or not enabled");
      }

      const itemId = randomUUID();
      const webKey = `items/${itemId}/web.jpg`;
      const thumbKey = `items/${itemId}/thumb.jpg`;

      const webUploadUrl = await storage.presignPut(webKey, contentType);
      const thumbUploadUrl = await storage.presignPut(thumbKey, contentType);

      return { itemId, webUploadUrl, thumbUploadUrl };
    },

    async confirmUpload(folderId, itemId, caption, userId) {
      // Verify folder exists and is enabled
      const folder = await deps.foldersRepo.findById(folderId);
      if (!folder || !folder.enabled) {
        throw new AppError("folder_not_found", "Folder not found or not enabled");
      }

      const webKey = `items/${itemId}/web.jpg`;
      const thumbKey = `items/${itemId}/thumb.jpg`;

      const [webExists, thumbExists] = await Promise.all([
        storage.headExists(webKey),
        storage.headExists(thumbKey),
      ]);

      if (!webExists || !thumbExists) {
        throw new AppError("upload_incomplete", "Both objects must be uploaded to S3 first");
      }

      return itemsRepo.insertPending({
        id: itemId,
        folderId,
        s3Key: webKey,
        thumbKey,
        caption: caption ?? "",
        uploadedBy: userId,
      });
    },

    async listFolderItems(folderId, { isAdmin }) {
      const statuses: ItemStatus[] = isAdmin
        ? ["pending", "approved", "trashed"]
        : ["approved"];

      const items = await itemsRepo.listByFolder(folderId, statuses);

      return Promise.all(
        items.map(async (item) => ({
          ...item,
          thumbUrl: await storage.presignGet(item.thumbKey),
          webUrl: await storage.presignGet(item.s3Key),
        })),
      );
    },

    async listPending() {
      const items = await itemsRepo.listPending();

      return Promise.all(
        items.map(async (item) => ({
          ...item,
          thumbUrl: await storage.presignGet(item.thumbKey),
          webUrl: await storage.presignGet(item.s3Key),
        })),
      );
    },

    async approve(ids, adminId) {
      const approved = await itemsRepo.setStatusApproved(ids, adminId);
      return { approved };
    },

    async reject(ids) {
      const rejected = await itemsRepo.setStatusTrashed(ids);
      return { rejected };
    },
  };
}
