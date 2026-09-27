// Regenerates src/inspiration/data/baoyu-compose.json from a local
// JimLiu/baoyu-skills clone (skills/baoyu-cover-image/references).
// Usage: node scripts/build-baoyu-compose.mjs <baoyu-skills-dir>
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.argv[2]
if (root === undefined) throw new Error('pass the baoyu-skills clone dir')

const refs = join(root, 'skills/baoyu-cover-image/references')

async function parsePalette(id) {
  const text = await readFile(join(refs, 'palettes', `${id}.md`), 'utf8')
  const tagline = text.split('\n').find(line => line.trim() !== '' && !line.startsWith('#'))?.trim() ?? ''
  const colorRows = []
  for (const line of text.split('\n')) {
    const cells = line.split('|').map(cell => cell.trim())
    if (cells.length === 5 && /^#[0-9a-fA-F]{6}$/.test(cells[3])) {
      colorRows.push({ role: cells[1], name: cells[2], hex: cells[3].toLowerCase() })
    }
  }
  const section = name => {
    const start = text.indexOf(`## ${name}`)
    if (start < 0) return []
    const rest = text.slice(start).split('\n## ')[0]
    return rest.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2).trim())
  }
  const pairs = []
  const pairStart = text.indexOf('## Duotone Pair Options')
  if (pairStart >= 0) {
    const rest = text.slice(pairStart).split('\n## ')[0]
    for (const line of rest.split('\n')) {
      const cells = line.split('|').map(cell => cell.trim())
      if (cells.length === 6 && /^#[0-9a-fA-F]{6}$/.test(cells[2]) && /^#[0-9a-fA-F]{6}$/.test(cells[3])) {
        pairs.push({ name: cells[1], a: cells[2].toLowerCase(), b: cells[3].toLowerCase(), feel: cells[4] })
      }
    }
  }
  return {
    id,
    tagline,
    colors: colorRows,
    decorativeHints: section('Decorative Hints'),
    bestFor: section('Best For').join(', '),
    ...(pairs.length > 0 ? { pairs } : {}),
  }
}

async function parseRendering(id) {
  const text = await readFile(join(refs, 'renderings', `${id}.md`), 'utf8')
  const tagline = text.split('\n').find(line => line.trim() !== '' && !line.startsWith('#'))?.trim() ?? ''
  const section = name => {
    const start = text.indexOf(`## ${name}`)
    if (start < 0) return []
    const rest = text.slice(start).split('\n## ')[0]
    return rest.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2).trim())
  }
  return {
    id,
    tagline,
    lines: section('Lines'),
    texture: section('Texture'),
    depth: section('Depth'),
    elements: section('Element Vocabulary'),
  }
}

const typeTable = await readFile(join(refs, 'types.md'), 'utf8')
// types.md has two tables: a 3-column gallery (id | description | best for)
// and a 2-column composition table (id | guideline).
const compositionRows = []
const galleryRows = new Map()
for (const line of typeTable.split('\n')) {
  const cells = line.split('|').map(cell => cell.trim())
  if (cells[1] === undefined || cells[1] === 'Type' || !cells[1].startsWith('`')) continue
  const id = cells[1].replaceAll('`', '')
  if (cells.length === 4) compositionRows.push({ id, composition: cells[2] })
  else if (cells.length === 5) galleryRows.set(id, cells[2])
}

const data = {
  source: 'JimLiu/baoyu-skills baoyu-cover-image skill (MIT)',
  types: compositionRows.map(row => ({ id: row.id, description: galleryRows.get(row.id) ?? '', composition: row.composition })),
  palettes: await Promise.all(['warm', 'cool', 'dark', 'earth', 'elegant', 'macaron', 'mono', 'pastel', 'retro', 'duotone', 'vivid'].map(parsePalette)),
  renderings: await Promise.all(['flat-vector', 'pixel', 'digital', 'hand-drawn', 'painterly', 'chalk', 'screen-print'].map(parseRendering)),
  textLevels: [
    { id: 'none', area: '85% visual area' },
    { id: 'title-only', area: '85% visual area' },
    { id: 'title-subtitle', area: '75% visual area' },
    { id: 'text-rich', area: '60% visual area' },
  ],
  moods: [
    { id: 'subtle', application: 'Use low contrast, muted colors, light visual weight, calm aesthetic' },
    { id: 'balanced', application: 'Use medium contrast, normal saturation, balanced visual weight' },
    { id: 'bold', application: 'Use high contrast, vivid saturated colors, heavy visual weight, dynamic energy' },
  ],
}

await writeFile(new URL('../src/inspiration/data/baoyu-compose.json', import.meta.url), `${JSON.stringify(data, null, 2)}\n`)
console.log(`types=${String(data.types.length)} palettes=${String(data.palettes.length)} renderings=${String(data.renderings.length)}`)
