/**
 * Parse a timestamp string into a Date, treating *naive* timestamps (no
 * timezone suffix) as UTC so they round-trip unchanged through ISO output.
 * Log files almost always write local-to-the-server wall-clock times; mixing
 * that with `new Date()`'s host-local interpretation shifts every plain-text
 * entry by the machine's UTC offset relative to JSON entries.
 */
export function parseTimestamp(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Already has an explicit zone: Z, +hh:mm, +hhmm, or -hh:mm.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const date = new Date(hasZone ? trimmed : `${trimmed}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
