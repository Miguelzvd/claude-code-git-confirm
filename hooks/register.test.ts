import { expect, test } from 'claude-code/testing'

import { gitInvocations, matchRule } from './register'

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

test('a lista marca, desmarca e salva', async ($, on) => {
  let saved: unknown
  on('store.get', () => ({ value: ['push'] }))
  on('store.set', (_, e) => {
    saved = e.value
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
  await ui.press({ key: 'save' })
  expect(saved).toEqual(['commit'])
  await ui.unmount()
})
