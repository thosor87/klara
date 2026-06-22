import { describe, it, expect } from "vitest";
import { normalizeEmail, isDomainAllowed, decideLoginAction, isValidEmailFormat } from "./eligibility.js";

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
  it("ungültiges E-Mail-Format → deny, auch wenn Domain passen würde", () => {
    expect(decideLoginAction({ email: "not-an-email", allowedDomains: domains,
      existingUser: null }).action).toBe("deny");
  });
  it("E-Mail ohne TLD-Punkt → deny (z.B. a@b)", () => {
    expect(decideLoginAction({ email: "a@b", allowedDomains: domains,
      existingUser: null }).action).toBe("deny");
  });
});

describe("isValidEmailFormat", () => {
  it("akzeptiert gültige E-Mail", () => {
    expect(isValidEmailFormat("user@example.com")).toBe(true);
  });
  it("lehnt Adresse ohne @ ab", () => {
    expect(isValidEmailFormat("not-an-email")).toBe(false);
  });
  it("lehnt Adresse ohne Punkt in der Domain ab", () => {
    expect(isValidEmailFormat("a@b")).toBe(false);
  });
  it("lehnt Adresse mit Leerzeichen ab", () => {
    expect(isValidEmailFormat("a b@example.com")).toBe(false);
  });
});
