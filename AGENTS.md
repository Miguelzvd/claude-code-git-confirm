# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

`git-confirm` is a Claude Code mod. It asks the person before Claude runs a git command they picked, and `/git-confirm` opens a pane to pick them. See `README.md` for the behavior and the install steps.

## Layout

- `.claude-plugin/plugin.json`: the manifest.
- `hooks/hooks.json`: lists the hooks module, `./register.tsx`.
- `hooks/register.tsx`: the whole mod. A `tool.call` hook on `Bash` asks through `$.ui.ask`; `/git-confirm` opens a `Pane` drawn by a `ui.render` hook.
- `hooks/register.test.ts`: tests for the parser, the dialog and the pane.
- `types/index.d.ts`: the `$.state` contract.

`tsconfig.json` and `.claude-plugin/types/` are generated and stay out of git.

## Rules

- The hooks module has no DOM and no Node. Everything outside it goes through `$`.
- The saved list is in `$.store` under `commands`. `draft`, `focused` and `top` in `$.state` belong to the open pane only.
- In a pane, `↑` and `↓` arrive as a one-row `ui.scroll`, not as a focus move. The `ui.scroll` hook turns them into `$.ui.focus` and moves the window only when the cursor leaves it. Keep `paneKeys` in the same order as the rows drawn: row 0 is the header.
- A failed check denies the command (the `.catch` on the `tool.call` hook). Do not let it fall through.

## Checks

Run these before a commit:

```
claude plugin validate .
claude plugin test .
```

Test by hand: run `/git-confirm`, move with the arrows past the bottom of the pane, toggle a row, save, then ask Claude for one of the saved commands.

## Commits

Write commit messages in Portuguese, Conventional Commit style (`feat:`, `fix:`, `docs:`), with a short title and a body that says why.
