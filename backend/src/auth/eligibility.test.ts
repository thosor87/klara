import { describe, it, expect } from "vitest";
import { normalizeEmail, isDomainAllowed, decideLoginAction } from "./eligibility.js";

describe("normalizeEmail", () => {
  it("trimmt und lowercased", () => {
    expect(normalizeEmail("  Kind@Grundschule-XY.de ")).toBe("kind@grundschule-xy.de");
  });
});

describe("isDomainAllowed", () => {
  const domains = ["grundschule-xy.de"];
  it("akzeptiert passende Domain", () => {
    expect(isDomainAllowed("kind@grundschule-xy.de", domains)).toBe(true);
  });
  it("lehnt fremde Domain ab", () => {
    expect(isDomainAllowed("kind@gmail.com", domains)).toBe(false);
  });
});

describe("decideLoginAction", () => {
  const domains = ["grundschule-xy.de"];
  it("aktiver Nutzer → send_login", () => {
    expect(decideLoginAction({ email: "a@grundschule-xy.de", allowedDomains: domains,
      existingUser: { status: "active" } }).action).toBe("send_login");
  });
  it("neuer Domain-Nutzer → create_pending", () => {
    expect(decideLoginAction({ email: "neu@grundschule-xy.de", allowedDomains: domains,
      existingUser: null }).action).toBe("create_pending");
  });
  it("bestehender pending → noop", () => {
    expect(decideLoginAction({ email: "p@grundschule-xy.de", allowedDomains: domains,
      existingUser: { status: "pending" } }).action).toBe("noop");
  });
  it("disabled → deny", () => {
    expect(decideLoginAction({ email: "d@grundschule-xy.de", allowedDomains: domains,
      existingUser: { status: "disabled" } }).action).toBe("deny");
  });
  it("fremde Domain ohne Account → deny", () => {
    expect(decideLoginAction({ email: "x@gmail.com", allowedDomains: domains,
      existingUser: null }).action).toBe("deny");
  });
});
