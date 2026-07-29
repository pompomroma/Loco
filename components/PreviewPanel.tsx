"use client";

import { useMemo, useState } from "react";
import {
  Monitor,
  Files,
  History,
  Download,
  ExternalLink,
  RotateCcw,
  Package,
} from "lucide-react";
import type { Workspace } from "@/lib/types";
import { assemblePreview } from "@/lib/preview";
import FileTreeView from "./FileTreeView";

type Tab = "preview" | "files" | "versions";

interface Props {
  workspace: Workspace;
  onDownloadZip: () => void;
  onDownloadFile: (path: string) => void;
  onRestore: (versionId: string) => void;
}

export default function PreviewPanel({
  workspace,
  onDownloadZip,
  onDownloadFile,
  onRestore,
}: Props) {
  const [tab, setTab] = useState<Tab>("preview");
  const [selected, setSelected] = useState<string | null>(null);
  const hasFiles = Object.keys(workspace.files).length > 0;

  const previewHtml = useMemo(
    () => (workspace.kind === "web" ? assemblePreview(workspace.files) : null),
    [workspace.files, workspace.kind],
  );

  function openInNewTab() {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "preview", label: "Preview", icon: <Monitor className="h-4 w-4" /> },
    { id: "files", label: "Files", icon: <Files className="h-4 w-4" /> },
    { id: "versions", label: "Versions", icon: <History className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col border-l border-white/10 bg-[#0a0a0f]">
      <div className="flex items-center justify-between border-b border-white/10 px-2">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition ${
                tab === t.id
                  ? "border-fuchsia-500 text-white"
                  : "border-transparent text-white/50 hover:text-white/80"
              }`}
            >
              {t.icon}
              {t.label}
              {t.id === "versions" && workspace.versions.length > 0 && (
                <span className="ml-1 rounded bg-white/10 px-1.5 text-[10px]">
                  {workspace.versions.length}
                </span>
              )}
            </button>
          ))}
        </div>
        {hasFiles && (
          <button
            onClick={onDownloadZip}
            className="mr-1 flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
          >
            <Download className="h-3.5 w-3.5" /> Download .zip
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "preview" && (
          <div className="flex h-full flex-col">
            {previewHtml ? (
              <>
                <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5 text-xs text-white/40">
                  <span>Live preview (sandboxed)</span>
                  <button
                    onClick={openInNewTab}
                    className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10 hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
                  </button>
                </div>
                <iframe
                  title="preview"
                  className="min-h-0 flex-1 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-pointer-lock"
                  srcDoc={previewHtml}
                />
              </>
            ) : (
              <div className="grid h-full place-items-center p-8 text-center">
                <div>
                  <Package className="mx-auto mb-3 h-10 w-10 text-white/30" />
                  <p className="text-sm text-white/60">
                    {hasFiles
                      ? "This product isn't a browser app, so there's no live preview."
                      : "No product yet. Send a request to generate one."}
                  </p>
                  {hasFiles && (
                    <p className="mt-1 text-xs text-white/40">
                      Use the Files tab to view it, or download the .zip. Running
                      non-web code needs the execution worker.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "files" && (
          <FileTreeView
            files={workspace.files}
            selected={selected}
            onSelect={setSelected}
            onDownloadFile={onDownloadFile}
          />
        )}

        {tab === "versions" && (
          <div className="h-full overflow-y-auto p-3">
            {workspace.versions.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-white/40">
                No versions yet. Each successful build is snapshotted here.
              </div>
            ) : (
              <ol className="space-y-2">
                {[...workspace.versions].reverse().map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-white/80">{v.label}</div>
                      <div className="text-xs text-white/40">
                        {new Date(v.createdAt).toLocaleString()} ·{" "}
                        {Object.keys(v.files).length} files · {v.kind}
                      </div>
                    </div>
                    <button
                      onClick={() => onRestore(v.id)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
