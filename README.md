# logscope

A terminal-based log analysis & observability toolkit — turn messy, noisy log
files into clear, actionable insight, entirely from the command line.

Paste in a 10,000-line log file and one command shows you what actually broke,
how often, and when — no dashboard SaaS, no signup. Ships as a single binary.

## Install (dev)

```bash
git clone https://github.com/Cleverprogramer/logscope.git
cd logscope
bun install

# run from source
bun run dev -- read samples/sample.log

# or build the standalone binary (~no runtime required)
cd packages/cli && bun run compile && ./dist/logscope --help
```

## Usage

### `read` — parse & inspect a log file

```bash
logscope read app.log                  # parse + color-coded output
logscope read app.log -q               # hide the summary line
logscope read app.log --level=error    # only errors (comma lists ok)
logscope read app.log --grep="timeout" # regex/text filter
logscope read app.log --since=2h       # last two hours only
logscope read app.log -t 5             # + top 5 most frequent message groups
```

Filters combine freely: `--level=error,warn --grep="db" --since=30m`.

Plain text (`2026-08-20 09:00:01 ERROR Payment failed`) and JSON-lines
(`{"timestamp":"...","level":"error","msg":"..."}`) are both parsed — even
mixed inside a single file. Unparseable lines never crash anything; they're
flagged as `⟨unparsed⟩` and counted.

### `tail` — follow a file live

```bash
logscope tail app.log                  # like tail -f, but parsed
logscope tail app.log -n 50            # show last 50 lines first
logscope tail app.log --alert-rate 10  # banner when ≥10 errors land in 60s
```

Detects truncation/rotation and keeps going.

### `stats` — one-shot report

```bash
logscope stats app.log                 # totals, level breakdown, top groups
logscope stats app.log --json          # machine-readable export for piping
logscope stats app.log --since=1h --top 5
```

### `dashboard` — full-screen live UI

```bash
logscope dashboard app.log             # ↑↓ select · enter expand · q quit
logscope dashboard app.log --level=error --grep="payment"
```

Live-updating stat boxes, an error-rate sparkline, ranked error groups, and
keyboard navigation — all in raw ANSI, powered by Ink.

## How it works (architecture notes)

```
packages/cli/src/
├── parser/
│   ├── detect.ts     format auto-detection (JSON-lines vs plain, by sampling)
│   ├── plain.ts      regex parser for common [ts] LEVEL msg shapes
│   ├── json.ts       NDJSON parser w/ field aliases (time/ts/severity/msg/…)
│   ├── timestamp.ts  naive-timestamp handling (treated as UTC, not host-local)
│   └── index.ts      parseLog(): per-line fallback chain → nothing crashes,
│                     garbage becomes flagged UNKNOWN entries
├── grouping/
│   └── index.ts      signature normalization (ids/uuids/ips/numbers/strings →
│                     <placeholders>) then cluster by (level, signature);
│                     tracks count + first/last seen
├── filter.ts         composable --level / --grep / --since predicates
├── tailer.ts         LineAssembler (chunk-safe incremental line splitting)
│                     + followLines() async generator (poll, truncation-aware)
├── dashboard/        Ink components (stat boxes, sparkline, group list)
├── commands/         read / tail / stats / dashboard wiring
└── format.ts         color-coded rendering (chalk), column-aligned
```

Design decisions worth noting:

- **Parse-per-line with fallback.** Format detection picks the dominant
  format, but every line individually falls back to the other parser before
  being flagged unparsed — so mixed-format files just work.
- **Naive timestamps are UTC.** `new Date("2026-08-20 09:00:00")` uses the
  *host* timezone, which silently shifts plain-text logs relative to
  Z-suffixed JSON logs on any non-UTC machine. We normalize instead.
- **Grouping by normalized signature**, not exact match: "Payment failed for
  order 8841" ×300 collapses to one actionable group.
- **Tail is a pure generator** (`followLines`), so both the CLI tail command
  and the React-based dashboard consume identical streaming semantics.

## Roadmap

- [x] **Week 1** — Parser foundation: plain-text & JSON parsing, structured
      extraction, malformed-line handling, color-coded `read`
- [x] **Week 2** — Grouping/dedup engine, live `tail`, `--since` filter
- [x] **Week 3** — Ink live dashboard, `stats` command (+ JSON export)
- [ ] **Week 4** — AI root-cause hints, `logscope-logger` companion library

## Development

```bash
bun test            # 53 tests across parser/grouping/filter/tailer suites
bun run typecheck   # strict tsc, zero errors
bun run dev -- stats samples/sample.log
```

## License

MIT
