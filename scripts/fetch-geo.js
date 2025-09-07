#!/usr/bin/env node
/*
  Fetch selected geoBoundaries files and save them into public/data for local serving.
  Usage:
    node scripts/fetch-geo.js DEU,FRA --adm ADM0
*/
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'
import AdmZip from 'adm-zip'
import { feature as topojsonFeature } from 'topojson-client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'public', 'data', 'gbOpen')

const args = process.argv.slice(2)
const nonFlagArg = args.find(a => !a.startsWith('--'))
if (!nonFlagArg) {
  console.error('Provide ISO3 list, e.g. `node scripts/fetch-geo.js DEU,FRA --adm ADM0`')
  process.exit(1)
}
const isoList = nonFlagArg.split(/[\,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
const admIdx = args.indexOf('--adm')
const adm = admIdx !== -1 ? args[admIdx+1] : 'ADM0'

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchText(res.headers.location))
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url))
        return
      }
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    }).on('error', reject)
  })
}

function toCandidates(u) {
  const url = new URL(u)
  const list = []
  // jsDelivr
  if (url.hostname === 'github.com') {
    const parts = url.pathname.split('/')
    const owner = parts[1]
    const repo = parts[2]
    const rawIdx = parts.indexOf('raw')
    if (owner && repo && rawIdx !== -1 && parts[rawIdx + 1]) {
      const commit = parts[rawIdx + 1]
      const sub = parts.slice(rawIdx + 2).join('/')
      list.push(`https://cdn.jsdelivr.net/gh/${owner}/${repo}@${commit}/${sub}`)
      list.push(`https://rawcdn.githack.com/${owner}/${repo}/${commit}/${sub}`)
      list.push(`https://cdn.statically.io/gh/${owner}/${repo}/${commit}/${sub}`)
    }
  }
  if (url.hostname === 'raw.githubusercontent.com') {
    const parts = url.pathname.split('/')
    const owner = parts[1]
    const repo = parts[2]
    const commit = parts[3]
    const sub = parts.slice(4).join('/')
    list.push(`https://cdn.jsdelivr.net/gh/${owner}/${repo}@${commit}/${sub}`)
    list.push(`https://rawcdn.githack.com/${owner}/${repo}/${commit}/${sub}`)
    list.push(`https://cdn.statically.io/gh/${owner}/${repo}/${commit}/${sub}`)
  }
  list.push(u)
  return list
}

function toMediaGitHub(u) {
  try {
    const url = new URL(u)
    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/')
      const owner = parts[1]
      const repo = parts[2]
      const rawIdx = parts.indexOf('raw')
      if (owner && repo && rawIdx !== -1 && parts[rawIdx + 1]) {
        const commit = parts[rawIdx + 1]
        const sub = parts.slice(rawIdx + 2).join('/')
        return `https://media.githubusercontent.com/media/${owner}/${repo}/${commit}/${sub}`
      }
    }
    if (url.hostname === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/')
      const owner = parts[1]
      const repo = parts[2]
      const commit = parts[3]
      const sub = parts.slice(4).join('/')
      return `https://media.githubusercontent.com/media/${owner}/${repo}/${commit}/${sub}`
    }
  } catch {}
  return null
}

async function withRetries(fn, retries = 2, label = 'op') {
  let attempt = 0
  while (true) {
    try { return await fn() } catch (e) {
      if (attempt >= retries) throw e
      attempt++
      console.warn(`[retry ${attempt}/${retries}]`, label, (e && e.message) ? e.message : e)
      await new Promise(r => setTimeout(r, 400 * attempt))
    }
  }
}

async function main() {
  for (const iso of isoList) {
    const metaUrl = `https://www.geoboundaries.org/api/current/gbOpen/${iso}/${adm}/`
    const metaText = await withRetries(() => fetchText(metaUrl), 2, `meta ${iso}`)
    let meta
    try {
      meta = JSON.parse(metaText)
    } catch (e) {
      throw new Error(`Invalid JSON metadata for ${iso}: ${metaText.slice(0, 120)}…`)
    }
  // Prefer GeoJSON-only (no TopoJSON). We'll convert TopoJSON only if we must (zip fallback).
  const dl = meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL || meta.geojsonDownloadURL || meta.geojsonURL || meta.downloadURL
    if (!dl) throw new Error('No download URL for ' + iso)

    const candidates = toCandidates(dl)
    const media = toMediaGitHub(dl)
    if (media) candidates.unshift(media)
    let ok = false
    let text = ''
    for (const c of candidates) {
      try {
        text = await withRetries(() => fetchText(c), 1, `download ${iso}`)
        // Detect Git LFS pointer and skip
        if (text.startsWith('version https://git-lfs.github.com/spec/v1')) {
          continue
        }
        ok = true; break
      } catch (e) {
        // try next
      }
    }
    if (!ok) {
      // Try static zip as last resort
      const zipUrl = meta.staticDownloadLink
      if (!zipUrl) throw new Error('Failed to download for ' + iso)
      const zipBuf = await withRetries(() => fetchBuffer(zipUrl), 1, `zip ${iso}`)
      const zip = new AdmZip(zipBuf)
      const entry = zip.getEntries().find(e => /\.geojson$|\.topojson$/i.test(e.entryName))
      if (!entry) throw new Error('No geo/topojson inside zip for ' + iso)
      text = zip.readAsText(entry)
      ok = true
    }

    // Normalize to GeoJSON if Topology
    let outJsonText = text
    try {
      const parsed = JSON.parse(text)
      if (parsed && parsed.type === 'Topology' && parsed.objects) {
        const firstKey = Object.keys(parsed.objects)[0]
        const fc = topojsonFeature(parsed, parsed.objects[firstKey])
        outJsonText = JSON.stringify(fc)
      }
    } catch {}

    // Write file as .geojson always
    const dir = path.join(outDir, iso, adm)
    fs.mkdirSync(dir, { recursive: true })
    const outPath = path.join(dir, `geoBoundaries-${iso}-${adm}.geojson`)
    fs.writeFileSync(outPath, outJsonText, 'utf8')
    console.log('Saved', outPath)

    // Also write a small metadata file for the frontend (date/version display)
    const metaOut = path.join(dir, 'meta.json')
    const metaInfo = {
      iso,
      adm,
      sourceMetaUrl: metaUrl,
      downloadUrl: dl,
      fetchedAt: new Date().toISOString(),
      // Include original meta for transparency (may contain boundaryYear, license, etc.)
      meta
    }
    fs.writeFileSync(metaOut, JSON.stringify(metaInfo, null, 2), 'utf8')
    console.log('Saved', metaOut)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchBuffer(res.headers.location))
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url))
        return
      }
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}
