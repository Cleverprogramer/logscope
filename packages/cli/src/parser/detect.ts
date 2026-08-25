/**
 * Auto-detect whether a file is JSON-lines (NDJSON) or plain text.
 * Samples up to the first 50 non-blank lines and picks whichever format
 * explains more of them.
 */

export type LogFormat = "plain" | "json";

/** Heuristic check: does this line look like a JSON object? */
function looksLikeJson(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("{");
}

export function detectFormat(lines: string[]): LogFormat {
  const sample = lines.filter((line) => line.trim() !== "").slice(0, 50);
  if (sample.length === 0) return "plain";

  let jsonCandidates = 0;
  for (const line of sample) {
    if (looksLikeJson(line)) jsonCandidates++;
  }

  // If most sampled lines start with "{", treat the whole file as NDJSON.
  // Per-line fallback still flags any non-JSON lines as unparsed.
  return jsonCandidates / sample.length >= 0.5 ? "json" : "plain";
}
