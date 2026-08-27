# logscope architecture

This document is a source-anchored map of how logscope turns bytes into
actionable terminal output. It follows a small C4-style context/container view:
only the boundaries that help contributors reason about a change are shown.

## System context

```text
                         +----------------------+
  log files / stdin ---> |                      | ---> text, JSONL, reports
  HTTP POST /logs -----> |      logscope        |
                         |  CLI + analysis      | ---> live terminal UI
       operator <------- |                      |
                         +----------------------+
                            ^              ^
                            |              |
                    .logscoperc        tail -f input
```

logscope is local and offline. It reads the sources the operator provides,
does not upload log contents, and has no database or background service. The
`serve` command is an optional in-process HTTP listener that appends request
bodies to a file; it is not a remote control plane.

## Runtime data flow

```text
paths / stdin
    │
    ▼
reader (glob expansion, bytes, .gz/.zst decode)
    │ text
    ▼
parser (format detection → per-line fallback → multiline folding)
    │ LogEntry[]
    ├──────────────► filters (--level, --grep, --since)
    │                         │
    ▼                         ▼
grouping (normalized signatures)      batch analyses
    │                                   ├─ stats / watch
    │                                   ├─ gaps / spikes / latency
    │                                   ├─ advise / explain / diff
    │                                   └─ correlate
    │
    ├──────────────► formatter (text, JSONL, report HTML/Markdown)
    └──────────────► dashboard (Ink state, panels, keyboard/mouse)
```

### 1. Input and reading

`packages/cli/src/reader.ts` is the boundary between the filesystem and the
parser. `expandPaths` resolves the basename portion of `*` and `?` globs;
`readLogFile` reads UTF-8 bytes, decodes gzip or zstd based on the extension,
and treats `-` as stdin. `readLogFiles` merges multiple results while keeping
the source path on each entry and preserving per-file line numbers.

The reader reports missing, unreadable, corrupt gzip, and unavailable zstd
inputs as friendly errors. It does not decide how a command renders the error.

### 2. Parsing and normalization

`packages/cli/src/parser/index.ts` samples lines with `detectFormat`, then
parses each line independently. The selected plain or JSON parser is tried
first, followed by the other parser and infrastructure formats (syslog,
access logs, and Kubernetes CRI). A failed line becomes an `UNKNOWN` entry with
`unparsed: true`; it is never silently discarded.

The parser modules are deliberately small:

- `plain.ts` handles timestamp/level/message layouts and deterministic UTC for
  naive timestamps.
- `json.ts` handles JSONL aliases such as `time`, `ts`, `severity`, `msg`, and
  metadata fields.
- `custom.ts` compiles the `read --format` template into a parser.
- `infra.ts` handles common infrastructure prefixes.
- `timestamp.ts` centralizes date parsing and epoch-second/millisecond rules.

`isContinuation` conservatively identifies indented stack frames, `Caused by:`
chains, and ellipsis continuations. Those lines are appended to the previous
valid entry rather than emitted as independent noise.

The shared contract is `LogEntry` in `packages/cli/src/types.ts`: source line,
raw text, timestamp, normalized level, message, optional JSON metadata, and an
unparsed marker. Keeping this contract stable lets every analysis and output
command share the same parser behavior.

### 3. Filtering and grouping

`filter.ts` builds composable predicates. Level, case-insensitive message/RAW
regex, and relative/absolute time filters combine with AND semantics. Explicit
CLI flags override values loaded from `.logscoperc`; missing configuration is
fine, while malformed JSON is a hard error.

`grouping/index.ts` replaces volatile message parts (UUIDs, IPs, hashes,
quoted strings, and numbers) with placeholders, then keys groups by normalized
signature plus level. Each group tracks count, representative sample, member
line numbers, and first/last timestamps. This is why repeated failures remain
readable even when IDs differ.

### 4. Batch analysis

Batch commands consume `LogEntry[]` and return plain data before rendering:

- `stats.ts` counts levels, time range, and top groups; `watch.ts` reruns it.
- `analysis/gaps.ts` finds timestamp silences above a duration.
- `analysis/anomalies.ts` computes robust z-scores over equal time buckets.
- `analysis/latency.ts` extracts duration units and nearest-rank percentiles.
- `analysis/sequences.ts` pairs a preceding regex with a following regex once
  per preceding event inside a bounded window.
- `analysis/context.ts`, `analysis/diff.ts`, and `analysis/kb.ts` power
  explain, diff, and the offline known-error advice command.

These analyses are statistical or rules-based. No AI service is called, and
the intentionally excluded AI root-cause, AI Git-correlation, and MCP-agent
features are not hidden dependencies.

### 5. Output and reports

`format.ts` is the human/JSONL boundary. Text output uses the color gate in
`color.ts`, respects `NO_COLOR` and TTY behavior, and supports compact,
verbose, ASCII, icons, timezone, and timestamp-token rendering. JSONL is pure
machine data: one record per entry with no ANSI decoration.

`commands/report-cli.ts` feeds the same stats model to
`commands/report.ts`, which escapes user content and renders a self-contained
HTML document or Markdown table. `serve.ts` appends `/logs` POST bodies and
exposes `/healthz`, allowing a writer to feed `tail` or the dashboard.

### 6. Streaming tail and dashboard

`tailer.ts` exposes `followLines`, an async generator that polls a file for
appends, handles partial UTF-8 lines, and resets offsets on truncation/rotation.
The `tail` command and dashboard both consume this streaming primitive, so
line assembly and rotation behavior do not diverge between interfaces.

The dashboard is an Ink component in `dashboard/Dashboard.tsx`:

1. The command parses and filters the initial file, resolves config/theme/
   panel defaults, and renders the component.
2. `followLines` yields new lines; the command parses them and rerenders with
   the appended entry.
3. The component memoizes stats, groups, multi-series rates, and entry-search
   results. `entries.ts`, `alerts.ts`, and `mouse.ts` isolate interaction logic.
4. `themes.ts`, `layout.ts`, `symbols.ts`, and `banner.ts` provide presentation
   choices without changing the `LogEntry` or analysis contracts.

Keyboard controls, mouse coordinates, and alert editing are UI state only;
they never mutate source logs. The dashboard exits cleanly by aborting the
shared follow generator.

## Configuration precedence

`config.ts` reads `$HOME/.logscoperc` first, then `.logscoperc` in the current
working directory. CWD values win over home values. Command actions merge only
unset options from this config, so an explicit flag always wins. Dashboard
theme/color/panel resolution follows the same principle, with panel names
validated against `stats`, `rate`, `groups`, and `entries`.

## Extension points

When adding a parser, keep it pure and add it to the fallback chain with
focused tests. When adding analysis, return serializable data and keep
rendering in a command or formatter. For a new dashboard panel, add a panel
name to `dashboard/layout.ts`, render it from the existing `LogEntry[]` state,
and cover keyboard/mouse behavior without coupling to filesystem I/O.

The test suite under `packages/cli/tests` exercises these contracts directly;
run `bun test` and `bun run typecheck` before changing a boundary.
