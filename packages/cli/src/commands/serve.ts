import type { Command } from "commander";
import chalk from "chalk";
import { appendFileSync } from "node:fs";

export interface ServeOptions {
  /** TCP port to listen on. */
  port?: string;
  /** File where received lines are appended. */
  out?: string;
}

/** Build the request handler for an ingest server writing to `out`. */
export function createIngestHandler(out: string): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return new Response("ok\n");
    }
    if (request.method === "POST" && url.pathname === "/logs") {
      const body = await request.text();
      if (body.length > 0) {
        appendFileSync(out, body.endsWith("\n") ? body : body + "\n", "utf8");
      }
      return new Response("accepted\n", { status: 202 });
    }
    return new Response("not found\n", { status: 404 });
  };
}

/**
 * `logscope serve` — minimal HTTP ingest: every line POSTed to /logs is
 * appended verbatim to the output file, ready for tail/dashboard.
 */
export async function serveCommand(options: ServeOptions): Promise<void> {
  const port = Math.min(65535, Math.max(1, Number.parseInt(options.port ?? "7600", 10) || 7600));
  const out = options.out ?? "ingest.log";

  const server = Bun.serve({ port, fetch: createIngestHandler(out) });

  console.log(
    chalk.dim(`── logscope ingest listening on :${port} → ${out}` +
      ` · POST /logs · GET /healthz · ctrl+c to stop ──`),
  );

  process.on("SIGINT", () => {
    server.stop(true);
    console.log(chalk.dim(`\n── serve stopped, ${out} kept ──`));
    process.exit(0);
  });
}

/** Register the serve subcommand on the CLI program. */
export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Run an HTTP endpoint that appends posted logs to a file")
    .option("--port <n>", "TCP port to listen on", "7600")
    .option("--out <file>", "file to append received logs to", "ingest.log")
    .action(async (options: ServeOptions) => {
      try {
        await serveCommand(options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
