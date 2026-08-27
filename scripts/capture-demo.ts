import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Build the README demo without third-party image libraries. The three frames
 * are a deterministic storyboard of the dashboard states users can reach with
 * the checked-in samples/sample.log file. FFmpeg converts the PPM frames to a
 * small looping GIF.
 */

const FONT: Record<string, string[]> = {
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  ">": ["10000", "01000", "00100", "00010", "00100", "01000", "10000"],
  "=": ["00000", "11111", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
};

const palette = {
  background: [20, 27, 38],
  text: [216, 222, 233],
  dim: [117, 129, 148],
  accent: [136, 192, 208],
  error: [191, 97, 106],
  warn: [235, 203, 139],
  info: [129, 161, 193],
  success: [163, 190, 140],
  purple: [180, 142, 173],
} as const;

type Color = keyof typeof palette;
type Line = { text: string; color?: Color };

const frames: Line[][] = [
  [
    { text: "LOGSCOPE  LIVE LOG ANALYSIS DASHBOARD", color: "accent" },
    { text: "FILE SAMPLES/SAMPLE.LOG  THEME=NORD  ICONS=ON", color: "dim" },
    { text: "" },
    { text: "ERRORS 5   WARNINGS 2   INFO 3   EVENTS 12", color: "text" },
    { text: "ERROR RATE 41.7/MIN   ALERT RULE OFF", color: "warn" },
    { text: "" },
    { text: "TOP GROUPS", color: "accent" },
    { text: "> ERROR X3 PAYMENT FAILED FOR ORDER #NUM", color: "error" },
    { text: "  ERROR X2 DATABASE CONNECTION TIMEOUT", color: "error" },
    { text: "  WARN X1 RETRYING DATABASE CONNECTION", color: "warn" },
    { text: "  INFO X1 HEALTH CHECK OK", color: "info" },
    { text: "" },
    { text: "RATE  **++*****++**+++   LAST 60S", color: "success" },
    { text: "PRESS E ENTRIES  / SEARCH  A ALERTS  Q QUIT", color: "dim" },
  ],
  [
    { text: "LOGSCOPE  ENTRY BROWSER", color: "accent" },
    { text: "SEARCH: TIMEOUT", color: "warn" },
    { text: "" },
    { text: "  09:12:30 ERROR DATABASE CONNECTION TIMEOUT", color: "error" },
    { text: "  09:13:31 ERROR DATABASE CONNECTION TIMEOUT", color: "error" },
    { text: "  09:14:32 WARN RETRYING DATABASE CONNECTION", color: "warn" },
    { text: "" },
    { text: "SEARCH ACTIVE  PRESS ENTER TO APPLY  ESC CANCEL", color: "dim" },
  ],
  [
    { text: "LOGSCOPE  ALERT RULE EDITOR", color: "accent" },
    { text: "" },
    { text: "ALERT RULE  10 ERRORS/MIN", color: "warn" },
    { text: "RECENT ERRORS 12   THRESHOLD EXCEEDED", color: "error" },
    { text: "" },
    { text: "THEME NORD  ASCII=OFF  ICONS=ON  MOUSE=ON", color: "success" },
    { text: "PRESS A TO CYCLE  E TO BROWSE  Q TO QUIT", color: "dim" },
  ],
];

const scale = 2;
const charWidth = 6 * scale;
const charHeight = 9 * scale;
const width = 960;
const height = 512;

function drawLine(pixels: Uint8Array, line: Line, row: number): void {
  const text = line.text.toUpperCase();
  const [r, g, b] = palette[line.color ?? "text"];
  const y0 = 22 + row * charHeight;
  for (let i = 0; i < text.length; i += 1) {
    const glyph = FONT[text[i]!] ?? FONT[" "]!;
    const x0 = 24 + i * charWidth;
    for (let gy = 0; gy < glyph.length; gy += 1) {
      for (let gx = 0; gx < glyph[gy]!.length; gx += 1) {
        if (glyph[gy]![gx] !== "1") continue;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const x = x0 + (gx * scale) + sx;
            const y = y0 + (gy * scale) + sy;
            if (x < width && y < height) {
              const offset = (y * width + x) * 3;
              pixels[offset] = r;
              pixels[offset + 1] = g;
              pixels[offset + 2] = b;
            }
          }
        }
      }
    }
  }
}

function ppm(lines: Line[]): Uint8Array {
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = palette.background[0];
    pixels[i + 1] = palette.background[1];
    pixels[i + 2] = palette.background[2];
  }
  for (let row = 0; row < lines.length; row += 1) drawLine(pixels, lines[row]!, row);
  const header = new TextEncoder().encode(`P6\n${width} ${height}\n255\n`);
  const out = new Uint8Array(header.length + pixels.length);
  out.set(header);
  out.set(pixels, header.length);
  return out;
}

const temp = mkdtempSync(join(tmpdir(), "logscope-demo-"));
try {
  mkdirSync("docs/assets", { recursive: true });
  for (let i = 0; i < frames.length; i += 1) {
    await Bun.write(join(temp, `frame-${String(i).padStart(2, "0")}.ppm`), ppm(frames[i]!));
  }
  const result = Bun.spawnSync([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    "1/2",
    "-i",
    join(temp, "frame-%02d.ppm"),
    "-vf",
    "fps=2,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=sierra2_4a",
    "-loop",
    "0",
    "docs/assets/dashboard-demo.gif",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
  const info = Bun.file("docs/assets/dashboard-demo.gif");
  console.log(`wrote docs/assets/dashboard-demo.gif (${info.size} bytes)`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
