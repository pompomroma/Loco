// Server-side static validation of a generated product. Weaker than the
// browser's runtime check (which still runs client-side when the user is
// present), but catches the common failure classes without a browser:
//   - web product with no HTML entry
//   - JavaScript syntax errors (compiled via node:vm, never executed)
//   - <script src>/<link href> references that don't resolve to emitted files
import { Script } from "node:vm";
import type { FileTree } from "./types";
import { findEntryHtml } from "./protocol";
import { resolveRef } from "./preview";

function checkJsSyntax(source: string, label: string, isModule: boolean): string | null {
  try {
    // Modules allow import/export; wrap so top-level await also compiles.
    const wrapped = isModule
      ? source.replace(/\b(import|export)\b/g, "// $1")
      : source;
    new Script(wrapped, { filename: label });
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Syntax error in ${label}: ${msg}`;
  }
}

/** Extract inline <script> bodies from an HTML document. */
function inlineScripts(html: string): { code: string; isModule: boolean }[] {
  const out: { code: string; isModule: boolean }[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    if (/\bsrc=/i.test(attrs)) continue;
    const type = attrs.match(/type=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (type && type !== "module" && !/javascript|ecmascript/.test(type)) continue;
    if (m[2].trim()) out.push({ code: m[2], isModule: type === "module" });
  }
  return out;
}

/** Validate a product tree; returns a list of problems (empty = passed). */
export function validateProduct(files: FileTree): string[] {
  const problems: string[] = [];
  const paths = Object.keys(files);
  if (paths.length === 0) return ["The product contains no files."];

  const entry = findEntryHtml(files);

  // Standalone JS/MJS files: syntax-compile each.
  for (const p of paths) {
    if (/\.(mjs|js)$/i.test(p)) {
      const err = checkJsSyntax(files[p], p, /\.mjs$/i.test(p));
      if (err) problems.push(err);
    }
  }

  if (entry) {
    const html = files[entry];
    // Inline scripts.
    inlineScripts(html).forEach((s, i) => {
      const err = checkJsSyntax(s.code, `${entry} inline <script> #${i + 1}`, s.isModule);
      if (err) problems.push(err);
    });
    // Local references must resolve to emitted files.
    const refRe = /<(?:script\b[^>]*\bsrc|link\b[^>]*\bhref|img\b[^>]*\bsrc)=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = refRe.exec(html)) !== null) {
      const ref = m[1];
      if (/^(https?:|data:|#|mailto:)/i.test(ref)) continue;
      if (!resolveRef(ref, entry, files)) {
        problems.push(`Referenced file "${ref}" in ${entry} was not emitted — emit it or inline it.`);
      }
    }
  }

  return problems.slice(0, 12);
}
