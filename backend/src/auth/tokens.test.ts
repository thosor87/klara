import { describe, it, expect } from "vitest";
import { generateCode, generateLinkToken, hashSecret, verifySecret } from "./tokens.js";

describe("generateCode", () => {
  it("liefert genau 6 Ziffern", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
});

describe("generateLinkToken", () => {
  it("liefert 64 Hex-Zeichen", () => {
    expect(generateLinkToken()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashSecret / verifySecret", () => {
  it("verifiziert korrektes Geheimnis", () => {
    const h = hashSecret("123456");
    expect(verifySecret("123456", h)).toBe(true);
  });
  it("lehnt falsches Geheimnis ab", () => {
    const h = hashSecret("123456");
    expect(verifySecret("000000", h)).toBe(false);
  });
});
