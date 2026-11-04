/**
 * 用 Electron 自带的 Node 运行 vitest。
 *
 * 原因：better-sqlite3 13 要求 Node >= 22，而开发机上的默认 Node 可能更旧。
 * Electron 主进程本身就跑在自带的 Node 上，用同一个运行时跑测试最接近真实情况，
 * 也省掉了 electron-rebuild。
 *
 * 如果你的 Node 已经 >= 22，也可以直接运行 `pnpm run test:node`。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

// vitest 5 的 exports 不暴露 vitest.mjs，这里按包目录推导 CLI 入口
const vitestCandidates = []
try {
  vitestCandidates.push(path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs'))
} catch {
  // 忽略，走下面的兜底路径
}
vitestCandidates.push(path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs'))

const vitestPath = vitestCandidates.find((candidate) => existsSync(candidate))
if (!vitestPath) {
  console.error('找不到 vitest，请先执行 pnpm install')
  process.exit(1)
}

const args = process.argv.slice(2)
const command = args.includes('--watch') ? 'watch' : 'run'
const forwarded = args.filter((arg) => arg !== '--watch')

const child = spawn(electronPath, [vitestPath, command, ...forwarded], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
