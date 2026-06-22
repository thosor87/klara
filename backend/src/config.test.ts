import { describe, it, expect } from "vitest";
import { parseAllowedDomains } from "./config.js";

describe("parseAllowedDomains", () => {
  it("splittet, trimmt und lowercased", () => {
    expect(parseAllowedDomains("Grundschule-XY.de, beispiel.de ")).toEqual([
      "grundschule-xy.de",
      "beispiel.de",
    ]);
  });
  it("liefert leeres Array bei undefined/leer", () => {
    expect(parseAllowedDomains(undefined)).toEqual([]);
    expect(parseAllowedDomains("")).toEqual([]);
  });
});
