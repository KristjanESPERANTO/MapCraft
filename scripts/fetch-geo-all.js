#!/usr/bin/env node
// Fetch many ISO3 codes for a given ADM level by reading a list file.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const listPath = args[0] || path.join(root, 'scripts', 'iso3-adm0.txt')
const adm = args[1] || 'ADM0'

if (!fs.existsSync(listPath)) {
  console.error('ISO3 list file not found:', listPath)
  process.exit(1)
}

const content = fs.readFileSync(listPath, 'utf8')
const isos = content
  .split(/[^A-Za-z]+/)
  .map(s => s.trim().toUpperCase())
  .filter(s => s.length === 3)

if (isos.length === 0) {
  console.error('No ISO3 codes found in list file')
  process.exit(1)
}

const batch = Array.from(new Set(isos))
console.log('Fetching', batch.length, 'ISO3 codes for', adm)

function run(cmd, args, env, opts = {}) {
  const { retries = 0, label } = opts
  let attempt = 0
  const invoke = () => new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, cwd: root })
    p.on('exit', code => code === 0 ? resolve(null) : reject(new Error('Exit ' + code)))
  })
  const tryOnce = async () => {
    try {
      await invoke()
      return true
    } catch (e) {
      if (attempt < retries) {
        attempt++
        if (label) console.warn(`[retry ${attempt}/${retries}]`, label)
        await new Promise(r => setTimeout(r, 500 * attempt))
        return await tryOnce()
      }
      return false
    }
  }
  return tryOnce()
}

// Chunk to avoid overly long CLI arguments
const chunkSize = 20
const chunks = []
for (let i = 0; i < batch.length; i += chunkSize) chunks.push(batch.slice(i, i + chunkSize))

; (async () => {
  const failed = []
  for (const ch of chunks) {
    const isoArg = ch.join(',')
    console.log('> chunk', ch.length, '…', ch[0], '…')
    const ok = await run('node', ['scripts/fetch-geo.js', isoArg, '--adm', adm], process.env, { retries: 1, label: `chunk ${ch[0]}…` })
    if (!ok) {
      console.warn('Chunk failed, falling back to single ISO fetches for this chunk')
      for (const iso of ch) {
        const singleOk = await run('node', ['scripts/fetch-geo.js', iso, '--adm', adm], process.env, { retries: 2, label: iso })
        if (!singleOk) {
          console.error('FAILED:', iso)
          failed.push(iso)
        }
        await new Promise(r => setTimeout(r, 200))
      }
    }
    await new Promise(r => setTimeout(r, 300))
  }
  if (failed.length) {
    console.warn(`Completed with ${failed.length} failures:`)
    console.warn(failed.join(','))
  } else {
    console.log('All done')
  }
})().catch(e => { console.error(e); process.exit(1) })
