/**
 * Canvas workspace styles: React Flow base (bundled string, CJS-safe) plus
 * plugin styling on host theme tokens (--dsw-alias-*, --dsw-elevation-*).
 */
import { RF_BASE_CSS } from './rf-base-css.js'

const CANVAS_CUSTOM_CSS = `
.dcv-root{display:flex;flex-direction:column;height:100%;min-height:420px;background:var(--dsw-alias-bg-layer-1,transparent)}
.dcv-canvas{flex:1 1 auto;min-height:0}
.dcv-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 14px;border-bottom:0.5px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-2,transparent)}
.dcv-toolbar-group{display:flex;align-items:center;gap:6px}
.dcv-toolbar-sep{width:1px;height:18px;margin:0 4px;background:var(--dsw-alias-border-l2,#e5e7eb)}
.dcv-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;padding:6px 12px;background:var(--dsw-alias-bg-layer-3,#f9fafb);color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,opacity .15s}
.dcv-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#edf0f3);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dcv-btn:disabled{opacity:.45;cursor:default}
.dcv-btn-primary{border:0;background:var(--dsw-alias-brand-primary,#4c78ff);color:var(--dsw-alias-bg-layer-3,#fff);font-weight:500}
.dcv-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary,#4c78ff);opacity:.88}
.dcv-save-state{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#7b818b);margin-left:auto}

.dcv-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--dsw-alias-label-tertiary,#7b818b);pointer-events:none;padding:24px;text-align:center}
.dcv-empty-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-secondary,inherit)}
.dcv-empty p{margin:0;font-size:13px;line-height:1.6;max-width:460px}

.dcv-toast{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);padding:8px 16px;border-radius:10px;border:0;background:var(--dsw-alias-bg-layer-3,#fff);color:var(--dsw-alias-label-primary,inherit);font-size:13px;box-shadow:var(--dsw-elevation-2,0 4px 16px rgba(0,0,0,.14));z-index:20;max-width:70%}

.dcv-node{position:relative;border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff);box-shadow:var(--dsw-elevation-1,0 1px 4px rgba(0,0,0,.12));border:1px solid var(--dsw-alias-border-l2,#e5e7eb);transition:box-shadow .15s,border-color .15s}
.dcv-node.react-flow__node-selected{border-color:var(--dsw-alias-brand-primary,#4c78ff);box-shadow:var(--dsw-elevation-2,0 4px 16px rgba(76,120,255,.22))}
.dcv-node-delete{position:absolute;top:-9px;right:-9px;z-index:5;display:none;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:50%;background:var(--dsw-alias-bg-layer-3,#fff);color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;line-height:1;cursor:pointer;box-shadow:var(--dsw-elevation-1,0 1px 3px rgba(0,0,0,.18))}
.dcv-node:hover .dcv-node-delete{display:flex}
.dcv-node-delete:hover{color:var(--dsw-alias-label-error,#d33);border-color:var(--dsw-alias-label-error,#d33)}
.dcv-handle{width:11px;height:11px;background:var(--dsw-alias-bg-layer-3,#fff);border:2px solid var(--dsw-alias-label-dimmed,#9ca3af)}
.dcv-handle:hover{border-color:var(--dsw-alias-brand-primary,#4c78ff)}

.dcv-node-image{width:220px;padding:6px}
.dcv-node-image-empty{display:flex;align-items:center;justify-content:center;min-height:120px}
.dcv-image-wrap{position:relative}
.dcv-image{display:block;width:100%;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);user-select:none}
.dcv-image-loading,.dcv-image-pending{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1/1;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.dcv-image-error{display:flex;align-items:center;justify-content:center;width:100%;min-height:110px;border-radius:8px;padding:10px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-error,#d33);font-size:12px;text-align:center;word-break:break-all}
.dcv-spinner{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--dsw-alias-border-l2,#d7dbe0);border-top-color:var(--dsw-alias-brand-primary,#4c78ff);animation:dcv-spin 0.9s linear infinite}
@keyframes dcv-spin{to{transform:rotate(360deg)}}
.dcv-image-dl{position:absolute;right:6px;bottom:6px;appearance:none;border:0;border-radius:7px;padding:3px 8px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.92));color:var(--dsw-alias-label-secondary,inherit);font-size:12px;cursor:pointer;box-shadow:var(--dsw-elevation-1,0 1px 3px rgba(0,0,0,.2));opacity:0;transition:opacity .15s}
.dcv-image-wrap:hover .dcv-image-dl{opacity:1}
.dcv-node-caption{margin-top:6px;font-size:11.5px;line-height:1.4;color:var(--dsw-alias-label-tertiary,#7b818b);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

.dcv-node-text{width:250px;padding:8px}
.dcv-textarea{box-sizing:border-box;width:100%;border:0;outline:none;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:1.5;resize:vertical;min-height:64px;max-height:280px}
.dcv-textarea::placeholder{color:var(--dsw-alias-label-tertiary,#9ca3af)}

.dcv-node-config{width:290px;padding:12px;display:flex;flex-direction:column;gap:9px}
.dcv-config-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.dcv-config-cell{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dcv-config-cell span{line-height:1.2}
.dcv-config-cell select{box-sizing:border-box;width:100%;padding:5px 6px;font:inherit;font-size:12.5px;border:0.5px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:7px;background:var(--dsw-alias-bg-layer-2,transparent);color:inherit;outline:none;cursor:pointer}
.dcv-config-prompt{min-height:76px;border:0.5px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:7px;background:var(--dsw-alias-bg-layer-2,transparent);padding:7px 9px}
.dcv-config-foot{display:flex;align-items:center;gap:8px}
.dcv-generate{appearance:none;border:0;border-radius:8px;padding:6px 16px;background:var(--dsw-alias-brand-primary,#4c78ff);color:var(--dsw-alias-bg-layer-3,#fff);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:opacity .15s}
.dcv-generate:disabled{opacity:.45;cursor:default}
.dcv-generate:hover:not(:disabled){opacity:.88}
.dcv-config-error{flex:1;min-width:0;font-size:11.5px;line-height:1.3;color:var(--dsw-alias-label-error,#d33);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.dcv-import-count{font-size:12.5px;color:var(--dsw-alias-label-secondary,inherit)}

.react-flow__attribution{display:none}
.react-flow__edge-path{stroke:var(--dsw-alias-label-dimmed,#9ca3af);stroke-width:1.6}
.react-flow__edge.selected .react-flow__edge-path{stroke:var(--dsw-alias-brand-primary,#4c78ff);stroke-width:2.4}
/* Generation output edges (config → image) use the brand color to stand out from input edges. */
.dcv-edge-output .react-flow__edge-path{stroke:var(--dsw-alias-brand-primary,#4c78ff)}
/* In-flight generation edge: marching dashes while the placeholder spins. */
.dcv-edge-pending .react-flow__edge-path{stroke-dasharray:6 4;animation:dcv-dash .5s linear infinite}
@keyframes dcv-dash{to{stroke-dashoffset:-10}}
/* The drag-preview connection line matches the input edge color. */
.react-flow__connectionline path{stroke:var(--dsw-alias-label-dimmed,#9ca3af);stroke-width:1.6}
.react-flow__handle.connecting{background:var(--dsw-alias-brand-primary,#4c78ff)}
`

export const CANVAS_STYLE: string = `${RF_BASE_CSS}\n${CANVAS_CUSTOM_CSS}`
