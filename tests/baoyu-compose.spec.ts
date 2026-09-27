import { describe, expect, it } from 'vitest'
import {
  BAOYU_DEFAULT_SELECTION,
  BAOYU_LABELS_ZH,
  BAOYU_MOODS,
  BAOYU_PALETTES,
  BAOYU_RENDERINGS,
  BAOYU_TEXT_LEVELS,
  BAOYU_TYPES,
  composeBaoyuPrompt,
  randomBaoyuSelection,
} from '../src/baoyu-compose.js'

const selection = { ...BAOYU_DEFAULT_SELECTION, title: 'Deep Learning Notes' }

describe('baoyu dimension data', () => {
  it('carries the full dimension vocabulary with hex palettes', () => {
    expect(BAOYU_TYPES.map(item => item.id)).toEqual(['hero', 'conceptual', 'typography', 'metaphor', 'scene', 'minimal'])
    expect(BAOYU_PALETTES).toHaveLength(11)
    expect(BAOYU_PALETTES.every(palette => palette.colors.length >= 5 && palette.colors.every(color => /^#[0-9a-f]{6}$/.test(color.hex)))).toBe(true)
    expect(BAOYU_PALETTES.find(palette => palette.id === 'duotone')?.pairs).toHaveLength(6)
    expect(BAOYU_RENDERINGS.map(item => item.id)).toEqual(['flat-vector', 'pixel', 'digital', 'hand-drawn', 'painterly', 'chalk', 'screen-print'])
    expect(BAOYU_TEXT_LEVELS.map(item => item.id)).toEqual(['none', 'title-only', 'title-subtitle', 'text-rich'])
    expect(BAOYU_MOODS.map(item => item.id)).toEqual(['subtle', 'balanced', 'bold'])
  })

  it('labels every option id in Chinese', () => {
    const ids = [
      ...BAOYU_TYPES, ...BAOYU_PALETTES, ...BAOYU_RENDERINGS, ...BAOYU_TEXT_LEVELS, ...BAOYU_MOODS,
    ].map(item => item.id)
    expect(ids.every(id => BAOYU_LABELS_ZH[id] !== undefined)).toBe(true)
  })
})

describe('composeBaoyuPrompt', () => {
  it('stitches all five dimensions into one prompt', () => {
    const prompt = composeBaoyuPrompt({ ...selection, type: 'hero', palette: 'duotone', rendering: 'chalk', mood: 'bold' })
    expect(prompt).toContain('Type: hero — Large focal visual')
    expect(prompt).toContain('Palette: duotone')
    expect(prompt).toContain('Rendering: chalk')
    expect(prompt).toContain('Mood: bold — Use high contrast')
    expect(prompt).toContain('Title: "Deep Learning Notes"')
    expect(prompt).toContain('Duotone pair: pick ONE')
    expect(prompt).toContain('do NOT display color names, hex codes, or palette labels as visible text')
    expect(prompt).toContain('# Core Principles')
  })

  it('omits text elements at the none level and includes subtitle lines at richer levels', () => {
    const none = composeBaoyuPrompt({ ...selection, text: 'none' })
    expect(none).toContain('No text elements')
    expect(none).not.toContain('Title:')
    const subtitle = composeBaoyuPrompt({ ...selection, text: 'title-subtitle' })
    expect(subtitle).toContain('Subtitle: derive one short supporting line')
    expect(subtitle).not.toContain('Tags: derive')
    const rich = composeBaoyuPrompt({ ...selection, text: 'text-rich' })
    expect(rich).toContain('Tags: derive 2-3 keyword badges')
  })

  it('requires a title whenever the text level includes text', () => {
    expect(() => composeBaoyuPrompt({ ...BAOYU_DEFAULT_SELECTION, title: '' })).toThrow('baoyu-title-required')
    expect(() => composeBaoyuPrompt({ ...BAOYU_DEFAULT_SELECTION, text: 'none', title: '' })).not.toThrow()
    expect(() => composeBaoyuPrompt({ ...BAOYU_DEFAULT_SELECTION, title: '   ' })).toThrow('baoyu-title-required')
  })

  it('rejects unknown dimension ids', () => {
    expect(() => composeBaoyuPrompt({ ...selection, palette: 'neon' })).toThrow('invalid-baoyu-selection')
    expect(() => composeBaoyuPrompt({ ...selection, rendering: 'photoreal' })).toThrow('invalid-baoyu-selection')
  })
})

describe('randomBaoyuSelection', () => {
  it('randomizes every visual dimension and keeps the title', () => {
    const random = randomBaoyuSelection({ ...selection, title: 'Kept' })
    expect(random.title).toBe('Kept')
    expect(BAOYU_TYPES.some(item => item.id === random.type)).toBe(true)
    expect(BAOYU_PALETTES.some(item => item.id === random.palette)).toBe(true)
    expect(BAOYU_RENDERINGS.some(item => item.id === random.rendering)).toBe(true)
    expect(BAOYU_TEXT_LEVELS.some(item => item.id === random.text)).toBe(true)
    expect(BAOYU_MOODS.some(item => item.id === random.mood)).toBe(true)
  })
})
