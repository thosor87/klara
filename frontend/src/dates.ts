/** Date + school-year helpers for the folder form and folder display. */

/**
 * School-year options from "2023/2024" up to "<currentYear>/<currentYear+1>".
 * Newest first so the most likely choice sits at the top of the dropdown.
 */
export function schoolYearOptions(): string[] {
  const current = new Date().getFullYear();
  const out: string[] = [];
  for (let y = 2023; y <= current; y++) {
    out.push(`${y}/${y + 1}`);
  }
  return out.reverse();
}

/** Format an ISO date (YYYY-MM-DD) as German "DD.MM.YYYY". */
function formatISODate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/**
 * Render a folder's date range:
 *  - only start                 → "14.06.2026"
 *  - start === end              → "14.06.2026"
 *  - same month/year, diff day  → "14.–16.06.2026"
 *  - otherwise                  → "14.06.2026 – 02.07.2026"
 */
export function formatDateRange(
  start?: string | null,
  end?: string | null,
): string {
  if (!start) return "";
  if (!end || end === start) return formatISODate(start);

  const [sy, sm, sd] = start.split("-");
  const [ey, em, ed] = end.split("-");
  if (sy === ey && sm === em) {
    return `${sd}.–${ed}.${sm}.${sy}`;
  }
  return `${formatISODate(start)} – ${formatISODate(end)}`;
}
