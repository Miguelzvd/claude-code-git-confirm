import { expect, test } from 'claude-code/testing'

import { gitInvocations, matchRule, stripAiCoauthor } from './register'

const answering = (label: string) => (_: unknown, e: { questions: { question: string }[] }) => ({
  result: { questions: e.questions, answers: { [e.questions[0].question]: label } },
})

const PANE = {
  plugin: 'git-confirm',
  component: 'Pane',
  requestId: 'git-confirm',
  props: {
    title: 'Comandos git com confirmação',
    isFocused: true,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('acha invocações git em comandos compostos', async () => {
  expect(gitInvocations('cd x && git -C repo push origin main --force; ls')).toEqual([
    ['push', 'origin', 'main', '--force'],
  ])
  expect(gitInvocations('GIT_DIR=. git commit -m "a b"')).toEqual([['commit', '-m', 'a b']])
  expect(gitInvocations('echo git push')).toEqual([])
  expect(matchRule(['branch', '-D', 'x'], 'branch -D')).toBe(true)
  expect(matchRule(['branch', 'x'], 'branch -D')).toBe(false)
})

test('remove a coautoria do Claude e mantém a dos outros', async () => {
  const heredoc = [
    "git commit -F - <<'EOF'",
    'feat: x',
    '',
    'Co-Authored-By: Maria <maria@x.com>',
    'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
    'EOF',
  ].join('\n')
  expect(stripAiCoauthor(heredoc)).toBe(
    ["git commit -F - <<'EOF'", 'feat: x', '', 'Co-Authored-By: Maria <maria@x.com>', 'EOF'].join('\n'),
  )
  expect(stripAiCoauthor('git commit -m "feat: x" -m "Co-authored-by: Claude <noreply@anthropic.com>"')).toBe(
    'git commit -m "feat: x"',
  )
  expect(stripAiCoauthor('git commit -m x --trailer "Co-Authored-By: bot <ai@anthropic.com>" && git push')).toBe(
    'git commit -m x && git push',
  )
  const notCommit = 'echo "Co-Authored-By: Claude <noreply@anthropic.com>" >> notes.txt'
  expect(stripAiCoauthor(notCommit)).toBe(notCommit)
})

test('o commit roda sem a linha do Claude', async ($, on) => {
  let ran = ''
  on('store.get', () => ({ value: ['push'] }))
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    ran = e.command
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })

  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"' })
  expect(ran).toBe('git commit -m "x\n\n"')
})

test('comando fora da lista passa sem perguntar', async ($, on) => {
  let asked = false
  on('store.get', () => ({ value: ['push'] }))
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    asked = true
    return answering('Permitir')
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))

  const ran = await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(ran.isError).toBeFalsy()
  expect(asked).toBe(false)
})

test('bloquear nega o comando', async ($, on) => {
  on('store.get', () => ({ value: ['push'] }))
  on('tool.call', { tool: 'AskUserQuestion' }, answering('Bloquear') as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))

  const ran = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(ran.deny ?? ran.text).toContain('bloqueou')
})

test('permitir deixa o comando rodar', async ($, on) => {
  on('store.get', () => ({ value: ['push'] }))
  on('tool.call', { tool: 'AskUserQuestion' }, answering('Permitir') as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))

  const ran = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(ran.isError).toBeFalsy()
})

test('com a coautoria ligada, o commit roda como veio', async ($, on) => {
  let ran = ''
  on('store.get', (_, e) => ({ value: e.key === 'claudeCoauthor' ? true : ['push'] }))
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    ran = e.command
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })

  const command = 'git commit -m "x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"'
  await $.tool.call({ tool: 'Bash', command })
  expect(ran).toBe(command)
})

test('a lista marca, desmarca e salva', async ($, on) => {
  const saved: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: e.key === 'commands' ? ['push'] : undefined }))
  on('store.set', (_, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'git-confirm' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.run', () => ({ text: '' }))

  await $.command.run({ command: 'git-confirm' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /selecionado/ }))?.text).toContain('1 selecionado')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'rule:commit' })
  await ui.press({ key: 'rule:push' })
  expect((await ui.find({ type: 'Button', key: 'rule:commit' }))?.text).toContain('●')
  expect((await ui.find({ type: 'Button', key: 'coauthor' }))?.text).toContain('○')
  await ui.press({ key: 'coauthor' })
  expect((await ui.find({ type: 'Button', key: 'coauthor' }))?.text).toContain('●')
  await ui.press({ key: 'save' })
  expect(saved).toEqual({ commands: ['commit'], claudeCoauthor: true })
  await ui.unmount()
})
