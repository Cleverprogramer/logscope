# Contributing to logscope

Thanks for helping make logscope better. This project is a terminal-first log
analysis toolkit, so contributions should keep the CLI fast, scriptable,
offline, and predictable in plain terminals.

## Before you start

Open or claim an issue before starting a meaningful change. Good issues save
review time, so include:

- The problem or feature in plain language.
- Current behavior and expected behavior.
- Example commands, sample log lines, screenshots, or terminal output when
  they help.
- Affected commands, flags, files, or platforms.
- Suggested labels such as `bug`, `enhancement`, `documentation`,
  `accessibility`, or `priority/high`.

Small typo fixes can go straight to a pull request, but anything that changes
behavior should reference an issue.

## Local setup

Install Bun, then set up the workspace from the repository root:

```bash
bun install
```

Run the checked-in quickstart fixture:

```bash
bun run quickstart
```

Run a command directly from source:

```bash
bun run dev -- read sample.log --top 5
bun run dev -- dashboard sample.log --theme nord --icons --banner
```

The standalone binary can be checked from the CLI package:

```bash
cd packages/cli
bun run compile
./dist/logscope stats ../../sample.log --json
```

## Project layout

- `packages/cli/src/index.ts` wires the command router.
- `packages/cli/src/reader.ts` handles files, globs, stdin, and compressed
  input.
- `packages/cli/src/parser/` contains format detection and parsing.
- `packages/cli/src/grouping/` normalizes repeated messages into groups.
- `packages/cli/src/analysis/` contains batch analysis such as gaps, spikes,
  latency, context windows, diffs, known-error advice, and sequence
  correlation.
- `packages/cli/src/dashboard/` contains the live terminal UI pieces.
- `packages/cli/tests/` contains CLI, parser, dashboard, and analysis tests.
- `packages/logger/` contains the companion logger package.
- `samples/sample.log` and root `sample.log` are the checked-in demo fixtures.
- `scripts/capture-demo.ts` regenerates the README dashboard GIF.
- `ARCHITECTURE.md` explains the parser to dashboard data flow in more depth.

## Development workflow

1. Start from an up-to-date `main` branch.
2. Create a focused branch, for example `codex/read-gzip-input`.
3. Keep changes grouped by behavior. Prefer a small parser change plus tests
   over a broad refactor mixed with unrelated docs.
4. Add or update tests for user-visible behavior.
5. Run local validation before opening the pull request.
6. Link the issue in the pull request body and commit footer.

Use Conventional Commits for commit subjects:

```bash
feat(parser): support syslog timestamps
fix(dashboard): keep search state while scrolling
docs(readme): document report examples
test(reader): cover malformed gzip input
```

Include an issue reference when the commit completes tracked work, for example
`Fixes #123`.

## Validation

Run these from the repository root before submitting a pull request:

```bash
bun run typecheck
bun test
bun run coverage
bun run quickstart
bun run perf:smoke
```

Run extra checks when your change touches the related area:

```bash
bun run demo:gif
cd packages/cli && bun run compile
```

Use `bun run perf:smoke` when parser, grouping, analysis, dashboard bucketing,
or large-file behavior changes. Use `bun run demo:gif` when README dashboard
visuals change. Use the compile check when command routing, package metadata,
or build behavior changes.

## Testing guidance

- Parser and reader changes should include fixtures for valid input and
  malformed input.
- Dashboard changes should cover state helpers, rendering utilities, mouse
  handling, themes, symbols, or layout functions where possible.
- Analysis changes should cover edge cases such as empty input, missing
  timestamps, repeated groups, and boundary windows.
- Output changes should test human output and JSON or NDJSON output when both
  are supported.
- Performance work should include a repeatable fixture or script notes so the
  result can be measured again.

Tests should avoid the network and should not depend on local timezone,
terminal width, or wall-clock timing unless the behavior under test requires
it.

## Pull requests

Before opening a pull request, make sure:

- The branch is based on current `main`.
- The PR title follows Conventional Commits.
- The PR body explains what changed, why it changed, and how it was tested.
- The related issue is referenced with `Fixes #...` or `Refs #...`.
- Screenshots, recordings, or generated assets are included for visible
  dashboard or README changes.
- CI is passing for `Typecheck & test` and `Compile standalone binary`.

Keep pull requests focused. If a change naturally splits into parser support,
dashboard polish, and documentation, prefer separate commits and consider
separate PRs.

## Style expectations

- Keep the CLI deterministic and useful in pipes.
- Preserve `NO_COLOR`, `--ascii`, and non-TTY behavior when changing output.
- Do not send logs to hosted services. logscope's analysis is offline and
  heuristic by design.
- Prefer clear TypeScript and small functions over clever control flow.
- Follow existing module boundaries before introducing new abstractions.
- Keep new dependencies out unless they clearly pay for their weight.
- Write concise docs with runnable examples.

## Documentation and samples

When adding or changing commands, update README examples and command tables in
the same PR. If a feature changes data flow or module boundaries, update
`ARCHITECTURE.md`.

If you change `samples/sample.log`, also update root `sample.log` so the
quickstart path stays simple. The quickstart test checks that the two files
remain aligned.

## Reporting security issues

Do not post secrets, private logs, tokens, or production credentials in public
issues or pull requests. If a report needs sensitive details, remove or mask
them before sharing a minimal reproduction.
