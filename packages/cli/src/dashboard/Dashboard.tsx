import { Box, Text, useInput, useStdin, type Key } from "ink";
import React, { useEffect, useMemo, useState } from "react";
import type { LogEntry, LogLevel } from "../types.js";
import { groupEntries, type LogGroup } from "../grouping/index.js";
import { sparkline } from "./sparkline.js";
import { bucketCounts } from "./series.js";
import { filterEntries } from "./entries.js";
import { ALERT_THRESHOLDS, recentErrorCount } from "./alerts.js";
import { parseSgrMouse, type MouseEvent } from "./mouse.js";
import type { DashboardTheme } from "./themes.js";

export interface DashboardProps {
  file: string;
  entries: LogEntry[];
  /** Filters to display as active (informational). */
  activeFilters: string[];
  theme?: DashboardTheme;
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box borderStyle="round" borderColor={color} paddingX={2}>
      <Text>
        <Text color={color} bold>
          {String(value).padStart(6)}
        </Text>{" "}
        <Text dimColor>{label}</Text>
      </Text>
    </Box>
  );
}

/**
 * Isolates Ink's raw-mode keyboard handling so the dashboard can also render
 * in non-TTY contexts (pipes/CI) without crashing.
 */
function KeyboardControls({ onKey }: { onKey: (input: string, key: Key) => void }): null {
  useInput((input, key) => onKey(input, key));
  return null;
}

function MouseControls({ onMouse }: { onMouse: (event: MouseEvent) => void }): null {
  const { stdin } = useStdin();
  useEffect(() => {
    if (!stdin.isTTY) return;
    process.stdout.write("\x1b[?1000h\x1b[?1006h");
    const onData = (chunk: Buffer | string) => {
      const event = parseSgrMouse(String(chunk));
      if (event) onMouse(event);
    };
    stdin.on("data", onData);
    return () => {
      stdin.off("data", onData);
      process.stdout.write("\x1b[?1000l\x1b[?1006l");
    };
  }, [stdin, onMouse]);
  return null;
}

/**
 * Full-screen live dashboard: totals, error-rate sparkline, and the top
 * message groups. ↑/↓ select a group, enter expands its line numbers,
 * q/ctrl+c quits.
 */
export function Dashboard({ file, entries, activeFilters, theme }: DashboardProps): React.ReactElement {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [browser, setBrowser] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [entryCursor, setEntryCursor] = useState(0);
  const [alertIndex, setAlertIndex] = useState(0);

  const stats = useMemo(() => {
    const levels = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, UNKNOWN: 0 };
    let firstTs: number | null = null;
    let lastTs: number | null = null;
    for (const e of entries) {
      levels[e.level] = (levels[e.level] ?? 0) + 1;
      const t = e.timestamp?.getTime() ?? null;
      if (t !== null) {
        if (firstTs === null || t < firstTs) firstTs = t;
        if (lastTs === null || t > lastTs) lastTs = t;
      }
    }
    return { levels, firstTs, lastTs };
  }, [entries]);

  const groups = useMemo(() => groupEntries(entries), [entries]);
  const visibleEntries = useMemo(() => filterEntries(entries, query), [entries, query]);
  const recentErrors = recentErrorCount(entries, Date.now());

  // Per-level series sharing one time axis.
  const series = useMemo(() => {
    if (stats.firstTs === null || stats.lastTs === null) return null;
    const width = 40;
    const span = Math.max(1, stats.lastTs - stats.firstTs);
    const inRange = entries.filter((e) => e.timestamp);
    const build = (level: LogLevel) =>
      sparkline(
        bucketCounts(
          inRange.filter((e) => e.level === level).map((e) => e.timestamp!.getTime()),
          stats.firstTs!,
          stats.lastTs!,
          width,
        ),
        width,
      );
    return { errors: build("ERROR"), warnings: build("WARN"), info: build("INFO") };
  }, [entries, stats]);

  const handleKey = (input: string, key: Key) => {
    if (searching) {
      if (key.escape) { setSearching(false); setQuery(""); return; }
      if (key.return) { setSearching(false); return; }
      if (key.backspace || key.delete) { setQuery((q) => q.slice(0, -1)); return; }
      if (input && input.length === 1 && !key.ctrl && !key.meta) setQuery((q) => q + input);
      return;
    }
    if (input === "q" || key.escape) process.exit(0);
    if (input === "e") { setBrowser((v) => !v); setEntryCursor(0); return; }
    if (input === "a") { setAlertIndex((i) => (i + 1) % ALERT_THRESHOLDS.length); return; }
    if (input === "/") { setBrowser(true); setSearching(true); return; }
    if (browser) {
      if (key.upArrow) setEntryCursor((i) => Math.max(0, i - 1));
      if (key.downArrow) setEntryCursor((i) => Math.min(Math.max(0, visibleEntries.length - 1), i + 1));
      return;
    }
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelected((s) => Math.min(Math.max(0, groups.length - 1), s + 1));
    if (key.return) setExpanded((v) => !v);
  };

  const handleMouse = (event: MouseEvent) => {
    if (event.button === "wheel-up") setEntryCursor((i) => Math.max(0, i - 1));
    if (event.button === "wheel-down") setEntryCursor((i) => Math.min(Math.max(0, visibleEntries.length - 1), i + 1));
    if (event.button === "left" && !event.release && event.row >= 13 && event.row < 23) {
      setSelected(Math.min(groups.length - 1, event.row - 13));
      setExpanded(true);
    }
  };

  const selectedGroup: LogGroup | null = groups[selected] ?? null;

  return (
    <Box flexDirection="column">
      {process.stdin.isTTY ? <KeyboardControls onKey={handleKey} /> : null}
      {process.stdin.isTTY ? <MouseControls onMouse={handleMouse} /> : null}
      <Box marginBottom={1}>
        <Text bold color={theme?.accent ?? "cyan"}>
          ⌁ logscope
        </Text>
        <Text dimColor> — {file}</Text>
        {activeFilters.length > 0 && (
          <Text color="yellow"> [{activeFilters.join(", ")}]</Text>
        )}
      </Box>

      <Text dimColor>
        alert rule: {ALERT_THRESHOLDS[alertIndex] === null ? "off" : `${ALERT_THRESHOLDS[alertIndex]} errors/min`} · recent errors: {recentErrors} · press a to edit
      </Text>

      <Box gap={2} marginBottom={1}>
        <StatBox label="lines" value={entries.length} color="white" />
        <StatBox label="errors" value={stats.levels.ERROR} color="red" />
        <StatBox label="warnings" value={stats.levels.WARN} color="yellow" />
        <StatBox label="unparsed" value={stats.levels.UNKNOWN} color="magenta" />
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>rate over time</Text>
        {series ? (
          <Box flexDirection="column">
            <Text>
              <Text color="red">err </Text>
              {series.errors}
            </Text>
            <Text>
              <Text color="yellow">warn</Text> {series.warnings}
            </Text>
            <Text>
              <Text color="blue">info</Text> {series.info}
            </Text>
          </Box>
        ) : (
          <Text dimColor>(no timestamped entries yet)</Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text bold>
          top message groups{" "}
          <Text dimColor>({groups.length} total · ↑↓ select · enter expand · e entries · a alert · q quit)</Text>
        </Text>
        {groups.length === 0 && <Text dimColor>waiting for log lines…</Text>}
        {groups.slice(0, 10).map((group, i) => {
          const isSelected = i === selected;
          return (
            <React.Fragment key={`${group.level}:${group.signature}`}>
              <Box>
        <Text color={isSelected ? (theme?.accent ?? "cyan") : undefined}>
                  {isSelected ? "❯ " : "  "}
                </Text>
                <Text color={theme?.levels[group.level] ?? "white"}>{group.level.padEnd(7)}</Text>
                <Text bold>×{String(group.count).padEnd(4)}</Text>
                <Text>{group.sample}</Text>
              </Box>
              {isSelected && expanded && (
                <Box marginLeft={4}>
                  <Text dimColor>
                    lines: {group.lines.slice(0, 20).map((l) => l + 1).join(", ")}
                    {group.lines.length > 20 ? ` … (+${group.lines.length - 20} more)` : ""}
                  </Text>
                </Box>
              )}
            </React.Fragment>
          );
        })}
      </Box>

      {browser && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>entries <Text dimColor>(↑↓ scroll · / search · e close)</Text></Text>
          {searching && <Text color="yellow">/{query}▌</Text>}
          {!searching && query && <Text dimColor>filter: /{query}/ ({visibleEntries.length})</Text>}
          {visibleEntries.slice(Math.max(0, entryCursor - 4), entryCursor + 6).map((entry, i) => {
            const actual = Math.max(0, entryCursor - 4) + i;
            return <Text key={`${entry.line}:${actual}`} color={actual === entryCursor ? "cyan" : undefined}>
              {actual === entryCursor ? "❯ " : "  "}{String(entry.line + 1).padStart(5)} {entry.level.padEnd(7)} {entry.message}
            </Text>;
          })}
          {visibleEntries.length === 0 && <Text dimColor>no matching entries</Text>}
        </Box>
      )}

      {selectedGroup && (
        <Box marginTop={1}>
          <Text dimColor>
            seen {selectedGroup.firstSeen ? selectedGroup.firstSeen.toISOString().slice(0, 19).replace("T", " ") : "?"}
            {" → "}
            {selectedGroup.lastSeen ? selectedGroup.lastSeen.toISOString().slice(0, 19).replace("T", " ") : "?"}
          </Text>
        </Box>
      )}
    </Box>
  );
}
