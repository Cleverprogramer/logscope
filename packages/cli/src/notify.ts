import { spawn } from "node:child_process";

export type NotifierKind = "macos" | "linux" | null;

/**
 * Pick the OS notification mechanism for this platform.
 * Returns null when there's nothing we know how to call.
 */
export function pickNotifier(platform: NodeJS.Platform): NotifierKind {
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return null;
}

/** Build the argv that delivers a notification for the given notifier. */
export function buildNotifyArgs(kind: Exclude<NotifierKind, null>, title: string, message: string): string[] {
  if (kind === "macos") {
    return [
      "osascript",
      "-e",
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
    ];
  }
  return ["notify-send", title, message];
}

/**
 * Fire an OS notification without blocking or surfacing errors —
 * notification failure must never take down a log stream.
 */
export function sendNotification(title: string, message: string, platform: NodeJS.Platform = process.platform): void {
  const kind = pickNotifier(platform);
  if (!kind) return;
  try {
    const child = spawn(buildNotifyArgs(kind, title, message)[0]!, buildNotifyArgs(kind, title, message).slice(1), {
      stdio: "ignore",
      detached: true,
    });
    child.unref();
  } catch {
    // best effort only
  }
}

/** Emit the terminal bell character. */
export function ringBell(): void {
  process.stdout.write("\x07");
}
