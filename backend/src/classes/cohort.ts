// Plan 7 — reine Kohorten-Logik. Zeit immer als `now` injiziert, UTC.
// Eine Klasse ("Kohorte") ist definiert durch Zug (track) + Einschulungsjahr
// (startYear). Stufen-Label und Lebenszyklus-Status werden aus dem aktuellen
// Schuljahr berechnet. Stichtag für den Schuljahreswechsel: 1. August.

export type CohortStatus =
  | "active"
  | "alumni"
  | "archived"
  | "expired"
  | "future"
  | "legacy";

export interface CohortInfo {
  grade: number | null;
  status: CohortStatus;
  label: string;
  schoolYear: string | null;
  daysSinceGraduation: number | null;
}

const MS_PER_DAY = 86_400_000;

/** Schuljahres-Startjahr: Kalenderjahr, wenn Monat ≥ August (Stichtag 1. Aug),
 *  sonst Kalenderjahr − 1. UTC. */
export function schoolYearStart(now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0 = Januar, 7 = August
  return month >= 7 ? year : year - 1;
}

/** Status, in denen ein Mitglied die Alben seiner Klasse weiterhin sieht. */
export function isMemberVisibleStatus(status: CohortStatus): boolean {
  return status === "active" || status === "alumni" || status === "legacy";
}

/**
 * Berechnet Stufe, Lebenszyklus-Status, Anzeige-Label und Schuljahr einer
 * Kohorte zum Zeitpunkt `now`.
 *
 * @param fallbackLabel Anzeige-Label für Legacy-Klassen (startYear === null);
 *   für Kohorten wird das Label berechnet und dieser Wert ignoriert.
 */
export function cohortInfo(
  track: string,
  startYear: number | null,
  now: Date,
  fallbackLabel = "",
): CohortInfo {
  // Legacy: keine Kohorte → kein Lebenszyklus, gespeichertes Label gilt.
  if (startYear === null) {
    return {
      grade: null,
      status: "legacy",
      label: fallbackLabel,
      schoolYear: null,
      daysSinceGraduation: null,
    };
  }

  const sy = schoolYearStart(now);
  const grade = sy - startYear + 1;

  // Noch nicht eingeschult.
  if (grade < 1) {
    return {
      grade,
      status: "future",
      label: `${track} · ab ${startYear}`,
      schoolYear: null,
      daysSinceGraduation: null,
    };
  }

  // Aktive Grundschulzeit (Stufe 1–4).
  if (grade <= 4) {
    return {
      grade,
      status: "active",
      label: `${grade}${track}`,
      schoolYear: `${sy}/${sy + 1}`,
      daysSinceGraduation: null,
    };
  }

  // Nach Klasse 4: Lebenszyklus relativ zum Abgangs-1.-August (startYear + 4).
  const gradAug = Date.UTC(startYear + 4, 7, 1); // 1. August, UTC-Mitternacht
  const daysSinceGraduation = Math.floor((now.getTime() - gradAug) / MS_PER_DAY);

  // Schuljahr des Abgangsjahrgangs (4. Klasse), z.B. für "Ehemalige m (2024/2025)".
  const sy4 = startYear + 3;
  const gradSchoolYear = `${sy4}/${sy4 + 1}`;

  let status: CohortStatus;
  let label: string;
  if (daysSinceGraduation < 90) {
    status = "alumni";
    label = `Ehemalige ${track} (${gradSchoolYear})`;
  } else if (daysSinceGraduation <= 180) {
    status = "archived";
    label = `Archiviert ${track}`;
  } else {
    status = "expired";
    label = `Archiviert ${track}`;
  }

  return { grade, status, label, schoolYear: null, daysSinceGraduation };
}
