# git-confirm

A Claude Code mod that asks you before Claude runs the git commands you pick.

When Claude calls `Bash` with a git command on your list, a dialog opens first:

```
Claude quer rodar git push origin main. Permitir?
❯ Permitir
  Bloquear
```

- **Permitir**: the command goes on to Claude Code's usual permission check.
- **Bloquear**: the command is denied.
- Text typed under **Other**: the command is denied and Claude reads your text as the reason.
- Dialog dismissed, or no one to ask (`claude -p`): the command is denied.

### Claude co-author lines

Every `git commit` Claude runs loses its `Co-Authored-By` lines that mention Claude or Anthropic (any case), so the commit keeps only your authorship. Other co-authors stay. This covers a line inside the message (heredoc or `-m "..."`) and a separate `-m` or `--trailer` argument. It runs whether or not `commit` is on your list.

To keep Claude as a co-author, turn on **Claude como coautor nos commits** in `/git-confirm` and save. It is off by default.

## Install

In a Claude Code terminal session:

```
/plugin install git-confirm --marketplace Miguelzvd/miguelzvd-claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install git-confirm --marketplace Miguelzvd/miguelzvd-claude-code-plugins
```

## Commands

- `/git-confirm` opens a pane with every git command the mod knows, each with a circle beside it: `●` asks first, `○` runs freely.

```
3 selecionado(s) · ↑↓ move · Enter marca · Esc fecha sem salvar
● git commit
○ git commit --amend
● git push
○ git push --force
...
○ Claude como coautor nos commits
✔ Salvar
✖ Cancelar
```

`↑` `↓` move the cursor, Enter toggles the command under it, **Salvar** keeps the choice, **Cancelar** or Esc closes without saving. The choice is kept across sessions.

Until you save, these ask first: `commit`, `push`, `reset --hard`, `rebase`, `merge`, `clean`, `branch -D`, `checkout --`, `restore`, `stash drop`.

## How it works

A `tool.call` hook on `Bash` splits the command on `&&`, `||`, `;`, `|`, `$(` and backticks, and finds each git call in it. It skips leading `VAR=value`, `sudo`, `env`, `exec` and `command`, and git's global options (`-C <dir>`, `-c <key=value>`, `--git-dir`, ...), so `cd repo && git -C sub push` is caught too.

An entry with several words also needs its flags: `push --force` matches `git push origin main --force`, not `git push`.

The list lives in the mod's store (`$.store`), so it follows you to every session.

## Limitations

- Only `Bash` calls are checked. Git run some other way (a script file, an alias, a git GUI) is not seen.
- A command built at run time (`eval`, a variable holding `git`) is not parsed.
- `push --force` does not match `push -f`. Add both if you want both caught.
