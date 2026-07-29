import type { AgentTurn, FileTree } from "./types";

// ---------------------------------------------------------------------------
// The file-operation protocol.
//
// The model is asked to emit files using explicit delimiters so we can parse a
// multi-file, any-language project out of a single streamed turn:
//
//   <<<FILE path/to/file.ext>>>
//   ...file contents...
//   <<<ENDFILE>>>
//
//   <<<DELETE path/to/old.ext>>>
//   <<<DONE>>>            (emitted only when the product fully meets the request)
//
// Everything outside those markers is treated as the assistant's prose note.
// ---------------------------------------------------------------------------

const FILE_BLOCK = /<<<FILE\s+(.+?)>>>\r?\n([\s\S]*?)<<<ENDFILE>>>/g;
const DELETE_LINE = /<<<DELETE\s+(.+?)>>>/g;
const DONE_MARK = /<<<DONE>>>/;

/** Strip reasoning-model scaffolding (<think>…</think>) that some Nemotron
 *  variants emit, so it never pollutes file parsing or the visible note. */
export function stripReasoning(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    // An unterminated <think> (stream cut mid-thought): drop from the tag on.
    .replace(/<think>[\s\S]*$/i, "");
}

export function parseAgentTurn(input: string): AgentTurn {
  const raw = stripReasoning(input);
  const files: FileTree = {};
  const deletions: string[] = [];

  let m: RegExpExecArray | null;
  FILE_BLOCK.lastIndex = 0;
  while ((m = FILE_BLOCK.exec(raw)) !== null) {
    const path = normalizePath(m[1]);
    if (!path) continue;
    let content = m[2];
    // Trim exactly one trailing newline the delimiter format tends to add.
    content = content.replace(/\r?\n$/, "");
    files[path] = content;
  }

  DELETE_LINE.lastIndex = 0;
  while ((m = DELETE_LINE.exec(raw)) !== null) {
    const path = normalizePath(m[1]);
    if (path) deletions.push(path);
  }

  const done = DONE_MARK.test(raw);

  // Note = the raw text with every marker/block stripped out.
  const note = raw
    .replace(FILE_BLOCK, "")
    .replace(DELETE_LINE, "")
    .replace(DONE_MARK, "")
    .trim();

  return { note, files, deletions, done };
}

function normalizePath(p: string): string {
  return p
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
}

/** For live streaming: show only the prose before any file markers appear. */
export function visibleProse(raw: string): string {
  const clean = stripReasoning(raw);
  const cut = Math.min(
    ...["<<<FILE", "<<<DELETE", "<<<DONE"]
      .map((m) => clean.indexOf(m))
      .filter((i) => i >= 0)
      .concat([clean.length]),
  );
  return clean.slice(0, cut).trim();
}

/** Apply a parsed turn onto an existing tree, returning a new tree. */
export function applyTurn(prev: FileTree, turn: AgentTurn): FileTree {
  const next: FileTree = { ...prev };
  for (const [path, content] of Object.entries(turn.files)) next[path] = content;
  for (const path of turn.deletions) delete next[path];
  return next;
}

/** Heuristic: can this product be rendered in the in-browser preview? */
export function detectKind(files: FileTree): "web" | "files" {
  const paths = Object.keys(files);
  if (paths.length === 0) return "files";
  const hasHtml = paths.some((p) => /\.html?$/i.test(p));
  return hasHtml ? "web" : "files";
}

/** Pick the entry HTML file for preview (prefer index.html at the shallowest depth). */
export function findEntryHtml(files: FileTree): string | null {
  const htmls = Object.keys(files).filter((p) => /\.html?$/i.test(p));
  if (htmls.length === 0) return null;
  htmls.sort((a, b) => {
    const ai = /(^|\/)index\.html?$/i.test(a) ? 0 : 1;
    const bi = /(^|\/)index\.html?$/i.test(b) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return a.split("/").length - b.split("/").length;
  });
  return htmls[0];
}
