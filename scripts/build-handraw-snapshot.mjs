/**
 * Build the handraw-style inspiration snapshot from a local clone of
 * https://github.com/yang0/handraw-style. Usage:
 *   node scripts/build-handraw-snapshot.mjs <clone-dir> <out-json>
 *
 * Reads skills/handdraw-style-prompter/references/{styles,layouts,colors}.json
 * plus the per-layout prompt markdown, and emits the plugin's snapshot schema
 * (repository / totalCases / categories / styles / scenes / cases). Image paths
 * stay repo-relative; the server-side image proxy resolves them against the
 * pinned upstream commit.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const [cloneDir, outPath] = process.argv.slice(2)
if (cloneDir === undefined || outPath === undefined) {
  console.error('usage: node scripts/build-handraw-snapshot.mjs <clone-dir> <out-json>')
  process.exit(1)
}
const refs = join(cloneDir, 'skills/handdraw-style-prompter/references')
const styles = JSON.parse(readFileSync(join(refs, 'styles.json'), 'utf8'))
const layouts = JSON.parse(readFileSync(join(refs, 'layouts.json'), 'utf8'))
const colors = JSON.parse(readFileSync(join(refs, 'colors.json'), 'utf8'))
const layoutPrompt = new Map()
for (const file of readdirSync(join(refs, 'layouts'))) {
  layoutPrompt.set(file.replace(/\.md$/, ''), readFileSync(join(refs, 'layouts', file), 'utf8'))
}

const LAYOUT_CATEGORY_ZH = { 'social-card': '社媒卡', infographic: '信息图', 'comic-storyboard': '漫画分镜' }
// Upstream ships per-style webps under images/individual, split into two
// numbered bands; layouts/colors keep their own directories.
function styleImage(number) {
  const n = Number.parseInt(number, 10)
  const band = n <= 200 ? '001-200' : '201-400'
  return `/images/individual/${band}/${String(n).padStart(3, '0')}.webp`
}

const cases = []
const categories = new Set()
const styleTags = new Set()

for (const s of styles) {
  const category = s.group.split('·').slice(1).join('·').trim() || s.group
  categories.add(`风格 · ${category}`)
  styleTags.add(category)
  const prompt = [
    `手绘风格 #${s.number} · ${s.generation_name}（原参考：${s.reference}）。`,
    `核心风格特征：${s.traits}`,
    '使用：把"主题：……"替换为你的主题；纯图模式直接生图，图文模式可让文字参与构图；可再叠加排版图型编号与主题色编号。',
  ].join('\n')
  cases.push({
    id: `s-${s.number}`,
    title: `#${s.number} ${s.generation_name}`,
    image: styleImage(s.number),
    imageAlt: `手绘风格 ${s.number} ${s.generation_name}`,
    sourceLabel: s.reference,
    prompt,
    promptPreview: `${s.generation_name} · ${s.traits.slice(0, 120)}`,
    category: `风格 · ${category}`,
    styles: [category],
    scenes: [],
    featured: false,
  })
}

for (const l of layouts) {
  const category = `排版 · ${LAYOUT_CATEGORY_ZH[l.category] ?? l.category}`
  categories.add(category)
  styleTags.add(l.name)
  const md = layoutPrompt.get(l.id) ?? ''
  const zh = (md.match(/<!-- zh -->\s*([\s\S]*?)(?:\n<!-- en -->|$)/) ?? [])[1]?.trim() ?? ''
  const en = (md.match(/<!-- en -->\s*([\s\S]*)$/) ?? [])[1]?.trim() ?? ''
  const prompt = [zh, en].filter(Boolean).join('\n\n') || `排版图型 ${l.id} ${l.name}`
  cases.push({
    id: `l-${l.id.toLowerCase()}`,
    title: `${l.id} ${l.name}`,
    image: `/images/layouts/${l.category}s/${l.id}.webp`,
    imageAlt: `排版图型 ${l.id} ${l.name}`,
    prompt,
    promptPreview: `${l.name}（${l.name_en}）`,
    category,
    styles: [l.name],
    scenes: l.keywords.slice(0, 5),
    featured: false,
  })
}

for (const c of colors) {
  const category = `单色 · ${c.category_zh}`
  categories.add(category)
  cases.push({
    id: `c-${c.id.toLowerCase()}`,
    title: `${c.id} ${c.name_zh}`,
    image: `/images/colors/${c.id}.webp`,
    imageAlt: `主题色 ${c.id} ${c.name_zh}`,
    prompt: `主题色 ${c.id} · ${c.name_zh}（${c.name_en}）——${c.quote_zh}。\n${c.prompt_zh}\n${c.prompt_en}`,
    promptPreview: `${c.name_zh} · ${c.quote_zh}`,
    category,
    styles: [c.name_zh],
    scenes: [],
    featured: false,
  })
}

const snapshot = {
  repository: 'https://github.com/yang0/handraw-style',
  totalCases: cases.length,
  categories: [...categories],
  styles: [...styleTags].slice(0, 120),
  scenes: [],
  cases,
}
writeFileSync(outPath, JSON.stringify(snapshot))
console.log(`wrote ${cases.length} cases to ${outPath}`)
