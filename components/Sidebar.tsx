"use client";

import { useState } from "react";
import { Plus, Layers, Trash2, Check, Pencil } from "lucide-react";
import { useStore } from "@/lib/store";

export default function Sidebar() {
  const order = useStore((s) => s.order);
  const workspaces = useStore((s) => s.workspaces);
  const activeId = useStore((s) => s.activeId);
  const createWorkspace = useStore((s) => s.createWorkspace);
  const selectWorkspace = useStore((s) => s.selectWorkspace);
  const deleteWorkspace = useStore((s) => s.deleteWorkspace);
  const renameWorkspace = useStore((s) => s.renameWorkspace);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function startEdit(id: string, name: string) {
    setEditing(id);
    setDraft(name);
  }
  function commitEdit(id: string) {
    renameWorkspace(id, draft);
    setEditing(null);
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-white/10 bg-[#0c0c12]">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 font-bold">
          L
        </div>
        <div className="text-lg font-semibold tracking-tight">Loco</div>
      </div>

      <div className="px-3">
        <button
          onClick={() => createWorkspace()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-500"
        >
          <Plus className="h-4 w-4" /> New workspace
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 px-4 text-xs uppercase tracking-wide text-white/40">
        <Layers className="h-3.5 w-3.5" /> Session slots
      </div>

      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {order.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-white/40">
            No workspaces yet. Create one to start.
          </div>
        )}
        {order.map((id) => {
          const ws = workspaces[id];
          if (!ws) return null;
          const active = id === activeId;
          return (
            <div
              key={id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition ${
                active ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              {editing === id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="min-w-0 flex-1 rounded bg-black/40 px-2 py-1 text-sm outline-none ring-1 ring-fuchsia-500/60"
                />
              ) : (
                <button
                  onClick={() => selectWorkspace(id)}
                  className="min-w-0 flex-1 truncate text-left"
                  title={ws.name}
                >
                  <span className={active ? "text-white" : "text-white/70"}>
                    {ws.name}
                  </span>
                  <span className="ml-2 text-xs text-white/30">
                    {Object.keys(ws.files).length > 0
                      ? `${Object.keys(ws.files).length} files`
                      : "empty"}
                  </span>
                </button>
              )}

              {editing === id ? (
                <button
                  onClick={() => commitEdit(id)}
                  className="rounded p-1 text-white/50 hover:text-emerald-400"
                  aria-label="Save name"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => startEdit(id, ws.name)}
                    className="rounded p-1 text-white/30 opacity-0 transition hover:text-white group-hover:opacity-100"
                    aria-label="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${ws.name}"? This can't be undone.`))
                        deleteWorkspace(id);
                    }}
                    className="rounded p-1 text-white/30 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3 text-[11px] leading-snug text-white/35">
        Free to use · no usage limits in-app. Upstream Nemotron usage is billed to
        the server&apos;s API key.
      </div>
    </aside>
  );
}
