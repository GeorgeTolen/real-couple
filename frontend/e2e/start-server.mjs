// Отдельный сервер для тестов на копии базы: рабочие оценки и апелляции не меняются.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const source = path.join(root, 'data', 'cqa.sqlite')
if (!fs.existsSync(source)) {
  console.error('Нет data/cqa.sqlite: сначала выполните make import и make evaluate-all')
  process.exit(1)
}
const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-e2e-')), 'e2e.sqlite')
const script = `
import sqlite3, sys
source = sqlite3.connect(sys.argv[1]); target = sqlite3.connect(sys.argv[2]); source.backup(target)
target.execute('delete from decisions'); target.execute('delete from appeals'); target.commit()
target.close(); source.close()
`
const prepared = spawnSync(python, ['-I', '-c', script, source, copy], { stdio: 'inherit' })
if (prepared.status !== 0) process.exit(prepared.status ?? 1)

const server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--port', '8001', '--log-level', 'warning'], {
  cwd: path.join(root, 'backend'),
  env: { ...process.env, DB_PATH: copy, PYTHONUTF8: '1' },
  stdio: 'inherit',
})
server.on('exit', (code) => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill())
