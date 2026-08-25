import type { Command } from "commander";

const SUBCOMMANDS = ["read", "tail", "stats", "dashboard", "watch", "gaps", "spikes", "latency", "advise", "explain", "diff"];
const FLAGS = [
  "--level",
  "--grep",
  "--since",
  "--tz",
  "--top",
  "--out",
  "--json",
  "--quiet",
  "--notify",
  "--alert-rate",
  "--bucket",
  "--sensitivity",
  "--min-gap",
  "--interval",
  "-n",
];

function bashScript(): string {
  return `
_logscope_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${SUBCOMMANDS.join(" ")}" -- "$cur") )
    return
  fi
  COMPREPLY=( $(compgen -W "${FLAGS.join(" ")}" -- "$cur") )
}
complete -F _logscope_completions logscope
`.trimStart();
}

function zshScript(): string {
  return `#compdef logscope
_logscope() {
  local -a subcommands flags
  subcommands=(${SUBCOMMANDS.map((s) => `"${s}"`).join(" ")})
  flags=(${FLAGS.map((f) => `"${f}"`).join(" ")})
  if (( CURRENT == 2 )); then
    _describe 'command' subcommands
  else
    _describe 'option' flags
  fi
}
compdef _logscope logscope
`;
}

function fishScript(): string {
  const lines = SUBCOMMANDS.map(
    (s) => `complete -c logscope -n '__fish_use_subcommand' -a '${s}' -d '${s}'`,
  );
  lines.push(...FLAGS.map((f) => `complete -c logscope -l ${f.replace(/^--/, "")} -d 'option'`));
  return lines.join("\n") + "\n";
}

/**
 * `logscope completion <shell>` — emit a sourceable completion script.
 */
export function completionCommand(shell: string): string {
  switch (shell) {
    case "bash":
      return bashScript();
    case "zsh":
      return zshScript();
    case "fish":
      return fishScript();
    default:
      throw new Error(`Unknown shell "${shell}". Use bash, zsh or fish.`);
  }
}

export function registerCompletionCommand(program: Command): void {
  program
    .command("completion")
    .description("Emit a shell completion script (source it in your rc file)")
    .argument("<shell>", "bash | zsh | fish")
    .action((shell: string) => {
      try {
        process.stdout.write(completionCommand(shell));
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
