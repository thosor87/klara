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
    opts: { isAdmin: boolean; userId?: string },
  ): Promise<Array<Item & { thumbUrl: string; webUrl: string; mine: boolean }>>;
  listPending(): Promise<Array<ItemWithFolderName & { thumbUrl: string; webUrl: string }>>;
  approve(ids: string[], adminId: string): Promise<{ approved: number }>;
  reject(ids: string[]): Promise<{ rejected: number }>;
  /** Set approved items back to pending. Returns count affected. */
  unapprove(ids: string[]): Promise<{ unapproved: number }>;
  /** Delete own pending item; throws not_allowed if not found, not owned, or not pending. */
  deleteOwnPending(itemId: string, userId: string): Promise<{ deleted: boolean }>;
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
      const folder = await foldersRepo.findById(folderId);
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

      const item = await itemsRepo.insertPending({
        id: itemId,
        folderId,
        s3Key: webKey,
        thumbKey,
        caption: caption ?? "",
        uploadedBy: userId,
      });

      if (!item) {
        throw new AppError("already_confirmed", "Item has already been confirmed");
      }

      return item;
    },

    async listFolderItems(folderId, { isAdmin, userId }) {
      if (!isAdmin) {
        const folder = await foldersRepo.findById(folderId);
        if (!folder || !folder.enabled) {
          throw new AppError("folder_not_found", "Folder not found or not enabled");
        }
      }

      const items = isAdmin
        ? await itemsRepo.listByFolder(folderId, ["pending", "approved", "trashed"])
        : await itemsRepo.listForMember(folderId, userId ?? "");

      return Promise.all(
        items.map(async (item) => {
          const [thumbUrl, webUrl] = await Promise.all([
            storage.presignGet(item.thumbKey),
            storage.presignGet(item.s3Key),
          ]);
          const mine = item.uploadedBy === (userId ?? null);
          return { ...item, thumbUrl, webUrl, mine };
        }),
      );
    },

    async listPending() {
      const items = await itemsRepo.listPending();

      return Promise.all(
        items.map(async (item) => {
          const [thumbUrl, webUrl] = await Promise.all([
            storage.presignGet(item.thumbKey),
            storage.presignGet(item.s3Key),
          ]);
          return { ...item, thumbUrl, webUrl };
        }),
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

    async unapprove(ids) {
      const unapproved = await itemsRepo.setStatusPending(ids);
      return { unapproved };
    },

    async deleteOwnPending(itemId, userId) {
      const item = await itemsRepo.findById(itemId);
      if (!item || item.uploadedBy !== userId || item.status !== "pending") {
        throw new AppError("not_allowed", "Item not found, not owned by user, or not pending");
      }
      await storage.deleteObjects([item.s3Key, item.thumbKey]);
      await itemsRepo.deleteById(itemId);
      return { deleted: true };
    },
  };
}
