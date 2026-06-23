import { describe, it, expect } from "vitest";
import { schoolYearStart, cohortInfo, isMemberVisibleStatus } from "./cohort.js";

// UTC dates throughout: cutover is 1 August.
const d = (iso: string) => new Date(iso);

describe("schoolYearStart", () => {
  it("July → previous calendar year (still last school year)", () => {
    expect(schoolYearStart(d("2026-07-31T23:59:59Z"))).toBe(2025);
  });

  it("1 August → new school year (calendar year)", () => {
    expect(schoolYearStart(d("2026-08-01T00:00:00Z"))).toBe(2026);
  });

  it("December → calendar year", () => {
    expect(schoolYearStart(d("2026-12-15T00:00:00Z"))).toBe(2026);
  });

  it("January → previous calendar year", () => {
    expect(schoolYearStart(d("2026-01-10T00:00:00Z"))).toBe(2025);
  });
});

describe("cohortInfo", () => {
  it("future: start_year ahead of now → status future, grade < 1", () => {
    // now school year 2026, startYear 2028 → grade = 2026-2028+1 = -1
    const info = cohortInfo("m", 2028, d("2026-09-01T00:00:00Z"));
    expect(info.status).toBe("future");
    expect(info.grade).toBe(-1);
    expect(info.schoolYear).toBeNull();
    expect(info.label).toContain("m");
    expect(info.label).toContain("2028");
  });

  it("active grade 2 with track m", () => {
    // startYear 2024, now school year 2025 → grade = 2025-2024+1 = 2
    const info = cohortInfo("m", 2024, d("2025-09-01T00:00:00Z"));
    expect(info.status).toBe("active");
    expect(info.grade).toBe(2);
    expect(info.label).toBe("2m");
    expect(info.schoolYear).toBe("2025/2026");
    expect(info.daysSinceGraduation).toBeNull();
  });

  it("active grade 1 boundary (first day of school year)", () => {
    const info = cohortInfo("", 2025, d("2025-08-01T00:00:00Z"));
    expect(info.status).toBe("active");
    expect(info.grade).toBe(1);
    expect(info.label).toBe("1");
    expect(info.schoolYear).toBe("2025/2026");
  });

  it("active grade 4 (last active grade)", () => {
    // startYear 2022, now school year 2025 → grade 4
    const info = cohortInfo("m", 2022, d("2025-09-01T00:00:00Z"));
    expect(info.status).toBe("active");
    expect(info.grade).toBe(4);
    expect(info.label).toBe("4m");
  });

  it("alumni: < 90 days past gradAug (1 Aug of startYear+4)", () => {
    // startYear 2021 → gradAug = 2025-08-01. 30 days later.
    const info = cohortInfo("m", 2021, d("2025-08-31T00:00:00Z"));
    expect(info.status).toBe("alumni");
    expect(info.grade).toBe(5);
    expect(info.daysSinceGraduation).toBe(30);
    expect(info.label).toContain("Ehemalige");
    expect(info.label).toContain("m");
  });

  it("alumni boundary: exactly 89 days → alumni", () => {
    const info = cohortInfo("", 2021, d("2025-10-29T00:00:00Z")); // 89 days after 2025-08-01
    expect(info.daysSinceGraduation).toBe(89);
    expect(info.status).toBe("alumni");
  });

  it("archived: 90–180 days past gradAug", () => {
    // 2025-08-01 + 90 days = 2025-10-30
    const info = cohortInfo("m", 2021, d("2025-10-30T00:00:00Z"));
    expect(info.daysSinceGraduation).toBe(90);
    expect(info.status).toBe("archived");
    expect(info.label).toContain("Archiviert");
  });

  it("archived boundary: 179 days → archived", () => {
    const info = cohortInfo("m", 2021, d("2026-01-27T00:00:00Z")); // 179 days after 2025-08-01
    expect(info.daysSinceGraduation).toBe(179);
    expect(info.status).toBe("archived");
  });

  it("archived boundary: exactly 180 days → archived (not yet expired)", () => {
    const info = cohortInfo("m", 2021, d("2026-01-28T00:00:00Z")); // 180 days after 2025-08-01
    expect(info.daysSinceGraduation).toBe(180);
    expect(info.status).toBe("archived");
  });

  it("expired: > 180 days past gradAug", () => {
    // 2025-08-01 + 181 days
    const info = cohortInfo("m", 2021, d("2026-01-29T00:00:00Z"));
    expect(info.daysSinceGraduation).toBe(181);
    expect(info.status).toBe("expired");
  });

  it("legacy: startYear null → status legacy, grade null, fallback label", () => {
    const info = cohortInfo("anything", null, d("2026-09-01T00:00:00Z"));
    expect(info.status).toBe("legacy");
    expect(info.grade).toBeNull();
    expect(info.schoolYear).toBeNull();
    expect(info.daysSinceGraduation).toBeNull();
  });
});

describe("isMemberVisibleStatus", () => {
  it("active, alumni, legacy are visible to members", () => {
    expect(isMemberVisibleStatus("active")).toBe(true);
    expect(isMemberVisibleStatus("alumni")).toBe(true);
    expect(isMemberVisibleStatus("legacy")).toBe(true);
  });

  it("archived, expired, future are NOT visible to members", () => {
    expect(isMemberVisibleStatus("archived")).toBe(false);
    expect(isMemberVisibleStatus("expired")).toBe(false);
    expect(isMemberVisibleStatus("future")).toBe(false);
  });
});
