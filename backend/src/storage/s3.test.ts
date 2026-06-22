import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted to top of file, so we cannot reference variables declared
// before it. Use vi.hoisted() to declare mocks that are available in factories.
const { mockGetSignedUrl, mockSend } = vi.hoisted(() => ({
  mockGetSignedUrl: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  const mockSendRef = mockSend;
  return {
    ...actual,
    // Use a regular function so it can be called with `new`
    S3Client: vi.fn().mockImplementation(function () { return { send: mockSendRef }; }),
  };
});

vi.mock("../config.js", () => ({
  config: {
    s3Bucket: "test-bucket",
    s3Region: "eu-central-1",
    ses: { accessKeyId: "", secretAccessKey: "" },
  },
}));

import { createS3Storage } from "./s3.js";
import { PutObjectCommand, GetObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("presignPut", () => {
  it("returns a string URL from getSignedUrl", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/put-url");
    const storage = createS3Storage();
    const url = await storage.presignPut("items/abc/web.jpg", "image/jpeg");
    expect(url).toBe("https://s3.example.com/put-url");
  });

  it("calls getSignedUrl with correct Bucket and Key", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/put-url");
    const storage = createS3Storage();
    await storage.presignPut("items/abc/web.jpg", "image/jpeg");
    const [, command] = mockGetSignedUrl.mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe("test-bucket");
    expect(command.input.Key).toBe("items/abc/web.jpg");
    expect(command.input.ContentType).toBe("image/jpeg");
  });
});

describe("presignGet", () => {
  it("returns a string URL from getSignedUrl", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/get-url");
    const storage = createS3Storage();
    const url = await storage.presignGet("items/abc/thumb.jpg");
    expect(url).toBe("https://s3.example.com/get-url");
  });

  it("calls getSignedUrl with correct Bucket and Key", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/get-url");
    const storage = createS3Storage();
    await storage.presignGet("items/abc/thumb.jpg");
    const [, command] = mockGetSignedUrl.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input.Bucket).toBe("test-bucket");
    expect(command.input.Key).toBe("items/abc/thumb.jpg");
  });
});

describe("headExists", () => {
  it("returns true when send succeeds", async () => {
    mockSend.mockResolvedValueOnce({});
    const storage = createS3Storage();
    const result = await storage.headExists("items/abc/web.jpg");
    expect(result).toBe(true);
  });

  it("returns false when send throws", async () => {
    mockSend.mockRejectedValueOnce(new Error("NoSuchKey"));
    const storage = createS3Storage();
    const result = await storage.headExists("items/abc/web.jpg");
    expect(result).toBe(false);
  });
});

describe("deleteObjects", () => {
  it("does nothing on empty array (no send call)", async () => {
    const storage = createS3Storage();
    await storage.deleteObjects([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends a DeleteObjectsCommand with correct keys", async () => {
    mockSend.mockResolvedValueOnce({});
    const storage = createS3Storage();
    await storage.deleteObjects(["items/abc/web.jpg", "items/abc/thumb.jpg"]);
    expect(mockSend).toHaveBeenCalledOnce();
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectsCommand);
    expect(command.input.Bucket).toBe("test-bucket");
    expect(command.input.Delete.Objects).toEqual([
      { Key: "items/abc/web.jpg" },
      { Key: "items/abc/thumb.jpg" },
    ]);
  });
});
