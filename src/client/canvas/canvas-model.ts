/**
 * Canvas domain model: pure node/edge helpers shared by the canvas view,
 * the import bridge and unit tests. No React, no IO.
 */
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { StudioGenerateRequest, StudioProviderProfile } from '../../shared.js'

export interface ImageNodeData extends Record<string, unknown> {
  kind: 'image'
  /** Durable attachment-backed image (generated results, conversation imports). */
  attachment?: ImageAttachmentRef
  /** Locally uploaded image kept as base64 until used as a generation reference. */
  encoded?: { mediaType: string; data: string }
  prompt?: string
  pending?: boolean
  error?: string
}

export interface TextNodeData extends Record<string, unknown> {
  kind: 'text'
  text: string
}

export interface ConfigNodeData extends Record<string, unknown> {
  kind: 'config'
  provider: string
  model: string
  prompt: string
  ratio: string
  quality: string
  count: number
  generating?: boolean
  error?: string
}

export type CanvasNode = Node<ImageNodeData | TextNodeData | ConfigNodeData>
export type ConfigNode = Node<ConfigNodeData>

export interface CanvasDocument {
  nodes: CanvasNode[]
  edges: Edge[]
  viewport?: { x: number; y: number; zoom: number }
  updatedAt: number
}

let nextSerial = 0
/** Collision-safe node id (also stable across sessions via the random suffix). */
export function newId(prefix: string): string {
  nextSerial += 1
  return `${prefix}-${nextSerial.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Stable node id for one attachment so repeated imports/generations dedupe. */
export function imageNodeIdOf(attachmentId: string): string {
  return `img-${attachmentId}`
}

export function nodeKindOf(node: CanvasNode | undefined): string | undefined {
  return node !== undefined && typeof node.data?.kind === 'string' ? node.data.kind : undefined
}

export function newTextNode(text = '', x: number, y: number): CanvasNode {
  return { id: newId('text'), type: 'text', position: { x, y }, data: { kind: 'text', text } }
}

export function newConfigNode(profile: StudioProviderProfile | undefined, x: number, y: number): CanvasNode {
  return {
    id: newId('cfg'),
    type: 'config',
    position: { x, y },
    data: {
      kind: 'config',
      provider: profile?.provider ?? 'google',
      model: profile?.model ?? '',
      prompt: '',
      ratio: profile?.defaultRatio ?? '1:1',
      quality: profile?.defaultQuality ?? '1K',
      count: 1,
    },
  }
}

export function newImageNode(input: {
  attachment?: ImageAttachmentRef
  encoded?: { mediaType: string; data: string }
  prompt?: string
  pending?: boolean
  error?: string
  x: number
  y: number
}, id = newId('img')): CanvasNode {
  return {
    id,
    type: 'image',
    position: { x: input.x, y: input.y },
    data: {
      kind: 'image',
      ...(input.attachment !== undefined ? { attachment: input.attachment } : {}),
      ...(input.encoded !== undefined ? { encoded: input.encoded } : {}),
      ...(input.prompt !== undefined && input.prompt.length > 0 ? { prompt: input.prompt } : {}),
      ...(input.pending === true ? { pending: true } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
    },
  }
}

/** Whether an edge is legal in the canvas graph: inputs feed configs, configs emit results, and images chain edits. */
export function isLegalConnection(source: CanvasNode | undefined, target: CanvasNode | undefined): boolean {
  const sourceKind = nodeKindOf(source)
  const targetKind = nodeKindOf(target)
  if (sourceKind === undefined || targetKind === undefined) return false
  if ((sourceKind === 'text' || sourceKind === 'image') && targetKind === 'config') return true
  if (sourceKind === 'config' && targetKind === 'image') return true
  if (sourceKind === 'image' && targetKind === 'image') return true
  return false
}

/** Everything a config node needs to know about its incoming edges. */
export interface ResolvedInputs {
  promptParts: string[]
  referenceAttachments: ImageAttachmentRef[]
  encodedReferences: Array<{ mediaType: string; data: string }>
}

export function resolveConfigInputs(nodes: readonly CanvasNode[], edges: readonly Edge[], configNodeId: string): ResolvedInputs {
  const byId = new Map<string, CanvasNode>()
  for (const node of nodes) byId.set(node.id, node)
  const promptParts: string[] = []
  const referenceAttachments: ImageAttachmentRef[] = []
  const encodedReferences: Array<{ mediaType: string; data: string }> = []
  for (const edge of edges) {
    if (edge.target !== configNodeId) continue
    const source = byId.get(edge.source)
    if (source === undefined) continue
    const data = source.data as ImageNodeData | TextNodeData | ConfigNodeData | undefined
    if (data?.kind === 'text' && typeof data.text === 'string' && data.text.trim().length > 0) {
      promptParts.push(data.text.trim())
    } else if (data?.kind === 'image') {
      if (data.attachment !== undefined) referenceAttachments.push(data.attachment)
      else if (data.encoded !== undefined) encodedReferences.push(data.encoded)
    }
  }
  return { promptParts, referenceAttachments, encodedReferences }
}

/** Build the studio request for one config node. Returns undefined when the prompt is empty. */
export function buildGenerationRequest(
  config: ConfigNode,
  inputs: ResolvedInputs,
): StudioGenerateRequest | undefined {
  const prompt = [config.data.prompt.trim(), ...inputs.promptParts]
    .filter(part => part.trim().length > 0)
    .join('\n\n')
  if (prompt.length === 0) return undefined
  const hasReferences = inputs.referenceAttachments.length > 0 || inputs.encodedReferences.length > 0
  return {
    mode: hasReferences ? 'edit' : 'generate',
    provider: config.data.provider as StudioGenerateRequest['provider'],
    model: config.data.model,
    prompt,
    ratio: config.data.ratio,
    quality: config.data.quality,
    ...(config.data.count > 1 ? { count: config.data.count } : {}),
    ...(hasReferences
      ? {
        references: [
          ...inputs.referenceAttachments.map(attachment => ({ attachment })),
          ...inputs.encodedReferences.map(encoded => ({ mediaType: encoded.mediaType as 'image/png', data: encoded.data })),
        ],
      }
      : {}),
  }
}

/** Position for the k-th output image spawned by one config node. */
export function outputPosition(config: CanvasNode, existingOutputCount: number, index: number): { x: number; y: number } {
  return { x: config.position.x + 420, y: config.position.y + (existingOutputCount + index) * 330 }
}

/** One imported generation record (gallery item or pending bridge payload). */
export interface ImportRecord {
  attachmentId: string
  attachment: ImageAttachmentRef
  prompt?: string
  provider?: string
  model?: string
  createdAt?: number
  sourceAttachmentIds?: readonly string[]
}

/**
 * Canonical canvas edge factory: the closed arrowhead is baked in here so
 * generation edges, import edit-chain edges, and user-drawn edges all read
 * direction the same way (React Flow's defaultEdgeOptions never applies to
 * edges inserted directly through the edges state).
 */
export function canvasEdge(source: string, target: string, className?: string, color?: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'smoothstep',
    ...(className !== undefined ? { className } : {}),
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      ...(color !== undefined ? { color } : {}),
    },
  }
}

/**
 * Arrowhead colors must be baked into markerEnd: React Flow renders all marker
 * <defs> in one shared SVG outside the edge elements, so CSS cannot color them
 * per edge class. These fallbacks mirror the CSS stroke fallbacks.
 */
export const EDGE_INPUT_FALLBACK_COLOR = '#9ca3af'
export const EDGE_OUTPUT_FALLBACK_COLOR = '#4c78ff'

/**
 * Normalize every edge's arrowhead to the given colors. Applied to restored
 * documents and import merges so legacy edges (no color, or a stale theme
 * color from a previous session) always match their path stroke.
 */
export function restyleEdges(edges: readonly Edge[], colors: { input: string; output: string }): Edge[] {
  return edges.map(edge => {
    const isOutput = typeof edge.className === 'string' && edge.className.includes('dcv-edge-output')
    const previous = typeof edge.markerEnd === 'object' && edge.markerEnd !== null ? edge.markerEnd : {}
    return {
      ...edge,
      type: 'smoothstep',
      markerEnd: {
        ...previous,
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: isOutput ? colors.output : colors.input,
      },
    }
  })
}

export const LAYOUT_COL_GAP = 400
export const LAYOUT_ROW_GAP = 300
export const LAYOUT_GRID_COLUMNS = 4
const LAYOUT_COMPONENT_GAP = 200

/**
 * Chronological grid for edge-less nodes. Session imports are view-only image
 * grids by design (no edit-chain edges); users connect nodes manually when
 * they want to continue editing.
 */
export function gridLayout(nodes: readonly CanvasNode[], columns = LAYOUT_GRID_COLUMNS): CanvasNode[] {
  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: 60 + (index % columns) * LAYOUT_COL_GAP,
      y: 60 + Math.floor(index / columns) * LAYOUT_ROW_GAP,
    },
  }))
}

function pushTo<K>(map: Map<K, string[]>, key: K, value: string): void {
  map.set(key, [...(map.get(key) ?? []), value])
}

/**
 * Layered layout for the manual "tidy layout" action. Connected stories are
 * laid out separately and stacked vertically so they never interleave; within
 * a component nodes are layered by longest-path depth (Kahn, cycle-safe) and
 * barycenter-ordered per layer so edit chains read as parallel tracks.
 * Edge-less isolated nodes pack into a grid below the stories.
 */
export function layoutCanvas(nodes: readonly CanvasNode[], edges: readonly Edge[]): CanvasNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  const adjacent = new Map<string, string[]>()
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    pushTo(incoming, edge.target, edge.source)
    pushTo(outgoing, edge.source, edge.target)
    pushTo(adjacent, edge.source, edge.target)
    pushTo(adjacent, edge.target, edge.source)
  }
  // Connected components (undirected), largest first so primary chains anchor the top.
  const visited = new Set<string>()
  const components: string[][] = []
  for (const node of nodes) {
    if (visited.has(node.id)) continue
    const component: string[] = []
    const stack = [node.id]
    visited.add(node.id)
    while (stack.length > 0) {
      const id = stack.pop()!
      component.push(id)
      for (const next of adjacent.get(id) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        stack.push(next)
      }
    }
    components.push(component)
  }
  components.sort((a, b) => b.length - a.length)
  // Edge-less isolated nodes (session imports, loose uploads) pack into a grid
  // instead of stacking one per row; only connected stories get the layered tree.
  const isolated = components.filter(component => component.length === 1).map(component => component[0]!)
  const connected = components.filter(component => component.length > 1)

  const positions = new Map<string, { x: number; y: number }>()
  let yCursor = 0
  for (const component of connected) {
    const member = new Set(component)
    // Longest-path layering via Kahn; cycle members fall back to layer 0.
    const depth = new Map<string, number>()
    const pending = new Map<string, number>()
    const children = new Map<string, string[]>()
    const ready: string[] = []
    for (const id of component) {
      const parents = (incoming.get(id) ?? []).filter(parent => member.has(parent))
      pending.set(id, parents.length)
      if (parents.length === 0) {
        depth.set(id, 0)
        ready.push(id)
      }
      for (const parent of parents) pushTo(children, parent, id)
    }
    while (ready.length > 0) {
      const id = ready.shift()!
      for (const child of children.get(id) ?? []) {
        const left = (pending.get(child) ?? 0) - 1
        pending.set(child, left)
        if (left === 0) {
          depth.set(child, Math.max(...(incoming.get(child) ?? []).map(parent => depth.get(parent) ?? 0)) + 1)
          ready.push(child)
        }
      }
    }
    for (const id of component) if (!depth.has(id)) depth.set(id, 0)

    const layers = new Map<number, string[]>()
    for (const id of component) pushTo(layers, depth.get(id) ?? 0, id)
    const slotOf = new Map<string, number>()
    for (const ids of layers.values()) ids.forEach((id, slot) => slotOf.set(id, slot))
    // Barycenter sweeps: order each layer by the mean slot of its connected
    // neighbours. Alternate forward/backward passes until settled.
    const neighbourMean = (id: string, direction: 'in' | 'out'): number => {
      const neighbours = (direction === 'in' ? incoming : outgoing).get(id) ?? []
      const slots: number[] = []
      for (const neighbour of neighbours) {
        const slot = slotOf.get(neighbour)
        if (slot !== undefined) slots.push(slot)
      }
      return slots.length === 0 ? (slotOf.get(id) ?? 0) : slots.reduce((a, b) => a + b, 0) / slots.length
    }
    const layerKeys = [...layers.keys()].sort((a, b) => a - b)
    for (let pass = 0; pass < 6; pass += 1) {
      const backward = pass % 2 === 1
      const order = backward ? [...layerKeys].reverse() : layerKeys
      for (const layer of order) {
        const ids = layers.get(layer)!
        const direction = backward ? 'out' : 'in'
        ids.sort((a, b) => neighbourMean(a, direction) - neighbourMean(b, direction))
        ids.forEach((id, slot) => slotOf.set(id, slot))
      }
    }
    let maxSlot = 0
    for (const layer of layerKeys) {
      for (const [slot, id] of layers.get(layer)!.entries()) {
        positions.set(id, { x: 60 + layer * LAYOUT_COL_GAP, y: yCursor + 60 + slot * LAYOUT_ROW_GAP })
        maxSlot = Math.max(maxSlot, slot)
      }
    }
    yCursor += (maxSlot + 1) * LAYOUT_ROW_GAP + LAYOUT_COMPONENT_GAP
  }
  isolated.forEach((id, index) => {
    positions.set(id, {
      x: 60 + (index % LAYOUT_GRID_COLUMNS) * LAYOUT_COL_GAP,
      y: yCursor + 60 + Math.floor(index / LAYOUT_GRID_COLUMNS) * LAYOUT_ROW_GAP,
    })
  })
  return nodes.map(node => ({ ...node, position: positions.get(node.id) ?? node.position }))
}

/** Rebuild image nodes and edit-chain edges from import records (ordered oldest first). */
export function buildImportGraph(records: readonly ImportRecord[]): { nodes: CanvasNode[]; edges: Edge[] } {
  const sorted = [...records].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  const seen = new Map<string, CanvasNode>()
  const pendingEdges: Array<{ source: string; target: string }> = []
  for (const record of sorted) {
    const id = imageNodeIdOf(record.attachmentId)
    if (!seen.has(id)) {
      seen.set(id, newImageNode({
        attachment: record.attachment,
        ...(record.prompt !== undefined && record.prompt.length > 0 ? { prompt: record.prompt } : {}),
        x: 0,
        y: 0,
      }, id))
    }
    for (const sourceId of record.sourceAttachmentIds ?? []) {
      pendingEdges.push({ source: imageNodeIdOf(sourceId), target: id })
    }
  }
  const edges: Edge[] = []
  const edgeKeys = new Set<string>()
  for (const { source, target } of pendingEdges) {
    if (!seen.has(source) || !seen.has(target) || source === target) continue
    const key = `${source}->${target}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    edges.push(canvasEdge(source, target))
  }
  // Layered layout with component packing happens in layoutCanvas below.
  return { nodes: layoutCanvas([...seen.values()], edges), edges }
}

/** Merge an import graph into existing canvas state (nodes dedupe by id, edges by key). */
export function mergeIntoCanvas(
  current: { nodes: readonly CanvasNode[]; edges: readonly Edge[] },
  incoming: { nodes: readonly CanvasNode[]; edges: readonly Edge[] },
  offset: { x: number; y: number },
): { nodes: CanvasNode[]; edges: Edge[] } {
  const existingIds = new Set(current.nodes.map(node => node.id))
  const nodes = [...current.nodes]
  for (const node of incoming.nodes) {
    if (existingIds.has(node.id)) continue
    nodes.push({ ...node, position: { x: node.position.x + offset.x, y: node.position.y + offset.y } })
  }
  const edgeKeys = new Set(current.edges.map(edge => `${edge.source}->${edge.target}`))
  const edges = [...current.edges]
  for (const edge of incoming.edges) {
    const key = `${edge.source}->${edge.target}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    edges.push(edge)
  }
  return { nodes, edges }
}

/** Drop volatile runtime flags (generating/pending/selected) — before persisting AND after restoring, so a remount never shows a phantom in-flight generation. */
export function stripVolatile(node: CanvasNode): CanvasNode {
  const data = { ...node.data } as Record<string, unknown>
  delete data.generating
  delete data.pending
  return { ...node, selected: false, data: data as CanvasNode['data'] }
}

/** Serialize the graph for persistence (strips volatile flags). */
export function toDocument(nodes: readonly CanvasNode[], edges: readonly Edge[], viewport?: { x: number; y: number; zoom: number }): CanvasDocument {
  return {
    nodes: nodes.map(stripVolatile),
    edges: edges.map(edge => ({ ...edge, selected: false })),
    ...(viewport !== undefined ? { viewport } : {}),
    updatedAt: Date.now(),
  }
}
