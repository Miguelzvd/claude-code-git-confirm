import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const COMMAND = 'git-confirm'
const PANE = 'git-confirm'
const STORE_KEY = 'commands'
// true deixa o Claude como coautor; ausente ou false remove (o padrão).
const COAUTHOR_KEY = 'claudeCoauthor'
const COAUTHOR = 'coauthor'
const ALLOW = 'Permitir'
const BLOCK = 'Bloquear'
const SAVE = 'save'
const CANCEL = 'cancel'

// O que a lista de seleção oferece; regras com várias palavras exigem as flags.
export const CATALOG = [
  'commit',
  'commit --amend',
  'push',
  'push --force',
  'pull',
  'fetch',
  'merge',
  'rebase',
  'reset',
  'reset --hard',
  'checkout',
  'checkout --',
  'switch',
  'restore',
  'clean',
  'branch -d',
  'branch -D',
  'tag',
  'stash',
  'stash drop',
  'cherry-pick',
  'revert',
  'rm',
  'add',
]

export const DEFAULTS = ['commit', 'push', 'reset --hard', 'rebase', 'merge', 'clean', 'branch -D', 'checkout --', 'restore', 'stash drop']

const draft = atom({ plugin: 'git-confirm', key: 'draft' } as const, [] as string[])
const focused = atom({ plugin: 'git-confirm', key: 'focused' } as const, `rule:${CATALOG[0]}`)
const top = atom({ plugin: 'git-confirm', key: 'top' } as const, 0)
const coauthorDraft = atom({ plugin: 'git-confirm', key: 'coauthorDraft' } as const, false)

// Linhas focáveis do painel, na ordem desenhada; a linha 0 é o cabeçalho.
const paneKeys = (chosen: string[]): string[] => [
  ...[...CATALOG, ...chosen.filter(rule => !CATALOG.includes(rule))].map(rule => `rule:${rule}`),
  COAUTHOR,
  SAVE,
  CANCEL,
]

// Opções globais do git que consomem o argumento seguinte (`git -C dir push`).
const GLOBAL_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])

const tokenize = (segment: string): string[] =>
  (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(token => token.replace(/^["']|["']$/g, ''))

// Cada invocação de git no comando Bash: o subcomando e os argumentos que vêm depois.
export const gitInvocations = (command: string): string[][] =>
  command
    .split(/&&|\|\||[;|\n]|\$\(|`/)
    .map(tokenize)
    .flatMap(tokens => {
      let i = 0
      while (i < tokens.length && /^\w+=/.test(tokens[i])) i++
      while (i < tokens.length && ['sudo', 'command', 'exec', 'env'].includes(tokens[i])) i++
      if (i >= tokens.length || !/(^|\/)git$/.test(tokens[i])) return []
      i++
      while (i < tokens.length && tokens[i].startsWith('-')) {
        i += GLOBAL_WITH_ARG.has(tokens[i]) ? 2 : 1
      }
      return i < tokens.length ? [tokens.slice(i)] : []
    })

// "push --force" casa `git push origin main --force`: subcomando igual e cada flag presente.
export const matchRule = (invocation: string[], rule: string): boolean => {
  const [sub, ...rest] = rule.split(' ')
  const [cmd, ...args] = invocation
  return cmd === sub && rest.every(word => args.includes(word))
}

// Coautoria do Claude/Anthropic: o commit fica só com a autoria do usuário.
const AI_TRAILER_ARG = /\s+(?:--trailer|-m)\s+(["'])co-authored-by:[^\n]*?(?:claude|anthropic)[^\n]*?\1/gi
// Para antes de uma aspa: a linha pode ser a última de um `-m "..."`.
const AI_TRAILER_LINE = /^[ \t]*co-authored-by:[^\n"']*(?:claude|anthropic)[^\n"']*\n?/gim

// Tira as linhas e os argumentos `Co-Authored-By` que citam Claude ou Anthropic de um `git commit`.
export const stripAiCoauthor = (command: string): string =>
  gitInvocations(command).some(([sub]) => sub === 'commit')
    ? command.replace(AI_TRAILER_ARG, '').replace(AI_TRAILER_LINE, '')
    : command

const isList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

// O que está salvo em $.store, ou a lista padrão enquanto nada foi salvo.
const toRules = (stored: unknown): string[] => (isList(stored) ? stored : DEFAULTS)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Escolhe os comandos git que pedem confirmação',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const current = toRules(await $.store.get(STORE_KEY))
    await update($, draft, () => current)
    const keepCoauthor = (await $.store.get(COAUTHOR_KEY)) === true
    await update($, coauthorDraft, () => keepCoauthor)
    await update($, focused, () => `rule:${CATALOG[0]}`)
    await update($, top, () => 0)
    await $.ui.open({ id: PANE, title: 'Comandos git com confirmação', focus: true, closeOnEscape: true })

    return { text: 'Enter marca ou desmarca; escolha "Salvar" no fim da lista.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const chosen = await read($, draft)
    const keepCoauthor = await read($, coauthorDraft)
    const items = [...CATALOG, ...chosen.filter(rule => !CATALOG.includes(rule))]

    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>Abra /git-confirm no terminal ou no desktop.</Text>
    }
    const { Box, Text, Button } = $.ui.resolve(e)

    const toggle = (rule: string) =>
      update($, draft, list => (list.includes(rule) ? list.filter(one => one !== rule) : [...list, rule]))
    const save = async () => {
      const picked = await read($, draft)
      await $.store.set(STORE_KEY, picked)
      await $.store.set(COAUTHOR_KEY, await read($, coauthorDraft))
      await $.ui.close({ id: PANE })
      $.ui.toast(`${picked.length} comando(s) git com confirmação.`)
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>{chosen.length} selecionado(s) · ↑↓ move · Enter marca · Esc fecha sem salvar</Text>
        {items.map((rule, i) => (
          <Button
            key={`rule:${rule}`}
            plain
            autoFocus={i === 0 ? true : undefined}
            label={`${chosen.includes(rule) ? '●' : '○'} git ${rule}`}
            onPress={() => void toggle(rule)}
          />
        ))}
        <Button
          key={COAUTHOR}
          plain
          label={`${keepCoauthor ? '●' : '○'} Claude como coautor nos commits`}
          onPress={() => void update($, coauthorDraft, keep => !keep)}
        />
        <Button key={SAVE} plain label="✔ Salvar" onPress={() => void save()} />
        <Button key={CANCEL} plain label="✖ Cancelar" onPress={() => void $.ui.close({ id: PANE })} />
      </Box>
    )
  })

  // Guarda onde o anel está; Tab ou clique trazem a linha para a vista.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e)
    const element = e.element
    if (element) {
      await update($, focused, () => element)
      if (e.origin.kind === 'person') await $.ui.scroll({ to: { key: element } })
    }
    return moved
  })

  // ↑/↓ chegam ao painel como rolagem de uma linha: viram movimento do cursor,
  // e a janela só anda quando o cursor sai dela.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'person' || e.pointer || Math.abs(e.by) !== 1) {
      await update($, top, () => e.offset)
      return next(e)
    }
    const keys = paneKeys(await read($, draft))
    const at = Math.max(0, keys.indexOf(await read($, focused)))
    const to = Math.min(keys.length - 1, Math.max(0, at + e.by))
    await $.ui.focus({ requestId: PANE, key: keys[to] })

    const row = to + 1
    const current = await read($, top)
    const offset =
      to === 0 ? 0 : row < current ? row : row >= current + e.bodyRows ? row - e.bodyRows + 1 : current
    await update($, top, () => offset)
    return next({ ...e, offset })
  })

  on('tool.call', { tool: 'Bash' }, async ($, original, next) => {
    const keepCoauthor = (await $.store.get(COAUTHOR_KEY)) === true
    const command = keepCoauthor ? original.command : stripAiCoauthor(original.command)
    const e = command === original.command ? original : { ...original, command }
    const rules = toRules(await $.store.get(STORE_KEY))
    const hits = gitInvocations(e.command)
      .filter(invocation => rules.some(rule => matchRule(invocation, rule)))
      .map(invocation => `git ${invocation.join(' ')}`)
    if (hits.length === 0) return next(e)

    let answer: string
    try {
      answer = await $.ui.ask(`Claude quer rodar ${hits.join(' e ')}. Permitir?`, {
        options: [ALLOW, BLOCK],
        header: 'Git',
      })
    } catch {
      return { deny: `${$.plugin.name}: confirmação de "${hits.join(', ')}" não respondida; comando bloqueado.` }
    }

    if (answer === ALLOW) return next(e)
    if (answer === BLOCK) return { deny: `${$.plugin.name}: o usuário bloqueou "${hits.join(', ')}".` }
    return { deny: `${$.plugin.name}: o usuário bloqueou "${hits.join(', ')}" e disse: ${answer}` }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: a verificação falhou; comando bloqueado.` },
  )
}
