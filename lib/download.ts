"use client";

import JSZip from "jszip";
import type { FileTree } from "./types";

/** Zip up a product's file tree and trigger a browser download. */
export async function downloadZip(files: FileTree, name = "loco-product"): Promise<void> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${safe(name)}.zip`);
}

/** Download a single file from the tree as-is. */
export function downloadFile(path: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, path.split("/").pop() || "file.txt");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safe(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "product";
}
