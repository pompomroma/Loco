import type { FileTree } from "./types";
import { findEntryHtml } from "./protocol";

// Messages posted from the sandboxed preview iframe back to the app.
export interface PreviewMessage {
  __loco: true;
  kind: "ready" | "error" | "console";
  message?: string;
}

// Injected into the preview so runtime errors surface to the fix loop.
const PROBE = `<script>(function(){
  function send(kind,msg){try{parent.postMessage({__loco:true,kind:kind,message:String(msg)},'*');}catch(e){}}
  window.addEventListener('error',function(e){
    if(e && e.message){send('error', e.message + (e.filename?(' @ '+e.filename+':'+(e.lineno||0)):''));}
    else if(e && e.target && (e.target.src||e.target.href)){send('error','Failed to load resource: '+(e.target.src||e.target.href));}
  },true);
  window.addEventListener('unhandledrejection',function(e){
    var r=e && e.reason; send('error','Unhandled rejection: '+((r&&r.message)?r.message:r));
  });
  var _e=console.error;console.error=function(){try{send('console',Array.prototype.map.call(arguments,String).join(' '));}catch(x){}_e.apply(console,arguments);};
  parent.postMessage({__loco:true,kind:'ready'},'*');
})();</script>`;

export function normalizeAssetPath(p: string): string {
  return p.trim().replace(/^\.?\//, "").replace(/^\/+/, "");
}

/** Resolve a referenced asset path (from an entry file) to a tree key.
 *  Shared by the browser preview assembler and the server-side validator. */
export function resolveRef(ref: string, entryPath: string, files: FileTree): string | null {
  if (/^(https?:|data:|#|mailto:)/i.test(ref)) return null;
  const clean = normalizeAssetPath(ref.split("?")[0].split("#")[0]);
  if (files[clean] != null) return clean;
  const dir = entryPath.includes("/") ? entryPath.slice(0, entryPath.lastIndexOf("/") + 1) : "";
  const joined = normalizeAssetPath(dir + clean);
  if (files[joined] != null) return joined;
  const base = clean.split("/").pop();
  const hit = Object.keys(files).find((k) => k.split("/").pop() === base);
  return hit ?? null;
}

/**
 * Build a single self-contained HTML document for the preview iframe's srcdoc:
 * inlines local <link>/<script> references (srcdoc has no file server) and
 * injects the error probe. Returns null if the product has no HTML entry.
 */
export function assemblePreview(files: FileTree): string | null {
  const entry = findEntryHtml(files);
  if (!entry) return null;
  let html = files[entry];

  // Inline local stylesheets.
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel=["']?stylesheet["']?/i.test(tag)) return tag;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) return tag;
    const key = resolveRef(href, entry, files);
    if (!key) return tag;
    return `<style data-src="${key}">\n${files[key]}\n</style>`;
  });

  // Inline local scripts.
  html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, attrs: string) => {
    const src = attrs.match(/src=["']([^"']+)["']/i)?.[1];
    if (!src) return tag;
    const key = resolveRef(src, entry, files);
    if (!key) return tag;
    const type = attrs.match(/type=["']([^"']+)["']/i)?.[1];
    const typeAttr = type ? ` type="${type}"` : "";
    return `<script${typeAttr} data-src="${key}">\n${files[key]}\n</script>`;
  });

  // Inject the probe as early as possible.
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (h) => `${h}\n${PROBE}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (h) => `${h}\n${PROBE}`);
  } else {
    html = `${PROBE}\n${html}`;
  }

  return html;
}
