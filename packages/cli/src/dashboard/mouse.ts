export interface MouseEvent {
  row: number;
  column: number;
  button: "left" | "wheel-up" | "wheel-down";
  release: boolean;
}

/** Parse an SGR (1006) mouse report, returning null for ordinary input. */
export function parseSgrMouse(input: string): MouseEvent | null {
  const match = /^\x1b\[<(\d+);(\d+);(\d+)([mM])$/.exec(input);
  if (!match) return null;
  const code = Number(match[1]);
  return {
    row: Number(match[3]),
    column: Number(match[2]),
    button: code & 64 ? (code & 1 ? "wheel-down" : "wheel-up") : "left",
    release: match[4] === "m",
  };
}
