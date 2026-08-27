let ascii = false;

export function setAsciiMode(enabled: boolean | undefined): void { ascii = enabled === true; }
export function symbol(unicode: string, fallback: string): string { return ascii ? fallback : unicode; }

export function levelIcon(level: string): string {
  const icons: Record<string, [string, string]> = {
    ERROR: ["✖", "x"], WARN: ["⚠", "!"], INFO: ["ℹ", "i"], DEBUG: ["·", "."], UNKNOWN: ["?", "?"],
  };
  const pair = icons[level] ?? icons.UNKNOWN!;
  return symbol(pair[0], pair[1]);
}
