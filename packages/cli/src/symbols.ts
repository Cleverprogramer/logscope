let ascii = false;

export function setAsciiMode(enabled: boolean | undefined): void { ascii = enabled === true; }
export function symbol(unicode: string, fallback: string): string { return ascii ? fallback : unicode; }
