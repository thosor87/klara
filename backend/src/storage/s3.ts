import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

export interface PresignGetOpts {
  /** Force a download with this original filename (Content-Disposition: attachment). */
  downloadFilename?: string;
  /** Override the response Content-Type. */
  contentType?: string;
}

export interface Storage {
  presignPut(key: string, contentType: string): Promise<string>;
  presignGet(key: string, opts?: PresignGetOpts): Promise<string>;
  headExists(key: string): Promise<boolean>;
  /** Object size in bytes (null if it doesn't exist). Used to enforce the video size limit. */
  head(key: string): Promise<{ size: number } | null>;
  deleteObjects(keys: string[]): Promise<void>;
}

export function createS3Storage(): Storage {
  const hasStatic = Boolean(config.ses.accessKeyId && config.ses.secretAccessKey);
  const client = new S3Client({
    region: config.s3Region,
    ...(hasStatic
      ? { credentials: { accessKeyId: config.ses.accessKeyId, secretAccessKey: config.ses.secretAccessKey } }
      : {}),
  });
  const Bucket = config.s3Bucket;
  return {
    async presignPut(key, contentType) {
      return getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: 600 });
    },
    async presignGet(key, opts) {
      // Sanitize the filename for the header (strip quotes/CR/LF).
      const safeName = opts?.downloadFilename?.replace(/["\r\n]/g, "");
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ...(safeName ? { ResponseContentDisposition: `attachment; filename="${safeName}"` } : {}),
          ...(opts?.contentType ? { ResponseContentType: opts.contentType } : {}),
        }),
        { expiresIn: 3600 },
      );
    },
    async headExists(key) {
      try { await client.send(new HeadObjectCommand({ Bucket, Key: key })); return true; }
      catch { return false; }
    },
    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: out.ContentLength ?? 0 };
      } catch { return null; }
    },
    async deleteObjects(keys) {
      if (!keys.length) return;
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    },
  };
}
