"use client";

import { FileCode, Download } from "lucide-react";
import type { FileTree } from "@/lib/types";

interface Props {
  files: FileTree;
  selected: string | null;
  onSelect: (path: string) => void;
  onDownloadFile: (path: string) => void;
}

export default function FileTreeView({
  files,
  selected,
  onSelect,
  onDownloadFile,
}: Props) {
  const paths = Object.keys(files).sort();
  const current = selected && files[selected] != null ? selected : paths[0] ?? null;

  if (paths.length === 0) {
    return (
      <div className="grid h-full place-items-center text-sm text-white/40">
        No files yet.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-56 shrink-0 overflow-y-auto border-r border-white/10 py-2">
        {paths.map((p) => (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
              p === current ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5"
            }`}
            title={p}
          >
            <FileCode className="h-3.5 w-3.5 shrink-0 text-white/40" />
            <span className="truncate">{p}</span>
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
          <span className="mono truncate text-xs text-white/60">{current}</span>
          {current && (
            <button
              onClick={() => onDownloadFile(current)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/50 hover:bg-white/10 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" /> File
            </button>
          )}
        </div>
        <pre className="mono min-h-0 flex-1 overflow-auto p-3 text-xs leading-relaxed text-white/80">
          {current ? files[current] : ""}
        </pre>
      </div>
    </div>
  );
}
