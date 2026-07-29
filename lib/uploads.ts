"use client";

import JSZip from "jszip";
import type { FileTree, UploadedFile } from "./types";

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "html", "htm", "css", "scss", "less", "js", "jsx",
  "mjs", "cjs", "ts", "tsx", "json", "jsonc", "yml", "yaml", "toml", "ini",
  "cfg", "conf", "env", "xml", "svg", "csv", "tsv", "py", "rb", "go", "rs",
  "java", "kt", "kts", "c", "h", "cpp", "hpp", "cc", "cs", "php", "sh", "bash",
  "zsh", "sql", "lua", "r", "swift", "dart", "vue", "svelte", "astro", "gradle",
  "properties", "gitignore", "dockerfile", "makefile", "lock", "graphql", "gql",
]);

const BINARY_NOTE: Record<string, string> = {
  exe: "Windows PE executable. Full decompile/redesign isn't reliable; inspection & best-effort patching need the execution worker.",
  gba: "Game Boy Advance ROM. Header inspection, asset extraction & best-effort patching need the execution worker.",
  bin: "Raw binary. Editing needs the execution worker.",
  dll: "Windows library. Inspection needs the execution worker.",
  so: "Shared object. Inspection needs the execution worker.",
  png: "Image. Convert/inspect via the conversion tools.",
  jpg: "Image. Convert/inspect via the conversion tools.",
  jpeg: "Image. Convert/inspect via the conversion tools.",
  gif: "Image.",
  webp: "Image.",
  pdf: "PDF document. Text/format conversion needs the tooling service.",
  wasm: "WebAssembly binary.",
};

function ext(name: string): string {
  const base = name.split("/").pop() || name;
  if (!base.includes(".")) return base.toLowerCase(); // e.g. Dockerfile, Makefile
  return base.split(".").pop()!.toLowerCase();
}

function looksTextual(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  let suspicious = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return false; // null byte => binary
    if (b < 9 || (b > 13 && b < 32)) suspicious++;
  }
  return suspicious / Math.max(n, 1) < 0.05;
}

async function expandZip(buf: ArrayBuffer): Promise<FileTree> {
  const zip = await JSZip.loadAsync(buf);
  const out: FileTree = {};
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  // Guardrail: don't inline an enormous archive into the prompt.
  let budget = 400_000; // ~400 KB of text
  for (const entry of entries) {
    if (budget <= 0) break;
    const e = ext(entry.name);
    if (!TEXT_EXT.has(e)) continue;
    const content = await entry.async("string");
    if (content.length > budget) continue;
    out[entry.name] = content;
    budget -= content.length;
  }
  return out;
}

export async function readUpload(file: File): Promise<UploadedFile> {
  const e = ext(file.name);
  const base: UploadedFile = {
    name: file.name,
    mime: file.type || "",
    size: file.size,
    isText: false,
  };

  // Archives: expand text entries so the model can edit source in place.
  if (e === "zip" || file.type === "application/zip") {
    try {
      const buf = await file.arrayBuffer();
      base.archiveEntries = await expandZip(buf);
      base.note = `Expanded ${Object.keys(base.archiveEntries).length} text file(s) from the archive.`;
      return base;
    } catch (err) {
      base.note = `Could not read archive: ${String(err)}`;
      return base;
    }
  }

  // Read bytes once, decide text vs binary.
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const knownText = TEXT_EXT.has(e);
  if (knownText || looksTextual(bytes)) {
    base.isText = true;
    base.text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return base;
  }

  base.note = BINARY_NOTE[e] || "Binary file — not inlined. Editing/inspection needs the execution worker.";
  return base;
}

export async function readUploads(files: FileList | File[]): Promise<UploadedFile[]> {
  const arr = Array.from(files);
  return Promise.all(arr.map(readUpload));
}
