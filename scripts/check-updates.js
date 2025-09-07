#!/usr/bin/env node
/*
  Check for geoBoundaries updates by comparing local meta.json with remote metadata.
  Usage: node scripts/check-updates.js DEU,FRA,USA
*/
import fs from 'fs'
import path from 'path'
import https from 'https'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const dataDir = path.join(root, 'public', 'data', 'gbOpen')

const args = process.argv.slice(2)
const isoList = args[0] ? args[0].split(/[\,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean) : ['DEU', 'FRA', 'USA']

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

async function checkUpdates() {
  let hasUpdates = false
  for (const iso of isoList) {
    const adm = 'ADM0' // Focus on country level
    const metaUrl = `https://www.geoboundaries.org/api/current/gbOpen/${iso}/${adm}/`
    try {
      const remoteMetaText = await fetchText(metaUrl)
      const remoteMeta = JSON.parse(remoteMetaText)

      const localMetaPath = path.join(dataDir, iso, adm, 'meta.json')
      if (!fs.existsSync(localMetaPath)) {
        console.log(`No local meta for ${iso}, update needed`)
        hasUpdates = true
        continue
      }

      const localMeta = JSON.parse(fs.readFileSync(localMetaPath, 'utf8'))

      // Compare key fields: boundaryYear, license, or last modified
      const remoteYear = remoteMeta.boundaryYear
      const localYear = localMeta.meta?.boundaryYear

      if (remoteYear !== localYear) {
        console.log(`Update detected for ${iso}: remote boundaryYear ${remoteYear}, local ${localYear}`)
        hasUpdates = true
      } else {
        console.log(`No update for ${iso}`)
      }
    } catch (e) {
      console.warn(`Error checking ${iso}: ${e.message}`)
    }
  }

  // Output for GitHub Actions
  const output = `has_updates=${has_updates}`
  console.log(output)
  // Write to GITHUB_OUTPUT
  const fs = await import('fs')
  fs.appendFileSync(process.env.GITHUB_OUTPUT, output + '\n')
  if (hasUpdates) {
    console.log('Updates detected, will fetch new data')
  } else {
    console.log('No updates detected')
  }
}

checkUpdates().catch(e => {
  console.error(e)
  process.exit(1)
})
