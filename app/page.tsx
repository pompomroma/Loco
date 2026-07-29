"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Circle, AlertTriangle } from "lucide-react";
import { useStore, uid } from "@/lib/store";
import type { ChatMessage, UploadedFile } from "@/lib/types";
import { runAgent, type Phase } from "@/lib/agent";
import { visibleProse } from "@/lib/protocol";
import { readUploads } from "@/lib/uploads";
import { downloadZip, downloadFile } from "@/lib/download";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import Composer from "@/components/Composer";
import PreviewPanel from "@/components/PreviewPanel";
import SpecCard from "@/components/SpecCard";

interface Health {
  ok: boolean;
  model: string;
  hasWorker: boolean;
}

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const order = useStore((s) => s.order);
  const activeId = useStore((s) => s.activeId);
  const workspace = useStore((s) => (s.activeId ? s.workspaces[s.activeId] : null));

  useEffect(() => setMounted(true), []);

  // Ensure there's always at least one workspace to work in.
  useEffect(() => {
    if (mounted && order.length === 0) useStore.getState().createWorkspace();
  }, [mounted, order.length]);

  // Non-secret health probe.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, model: "", hasWorker: false }));
  }, []);

  const runRequest = useCallback(
    async (wsId: string, request: string, uploaded: UploadedFile[]) => {
      const s = useStore.getState();
      const ws = s.workspaces[wsId];
      if (!ws) return;

      const history = ws.messages;

      s.addMessage(wsId, {
        id: uid("m_"),
        role: "user",
        content: request,
        attachments: uploaded.map((a) => ({
          name: a.name,
          mime: a.mime,
          size: a.size,
          isText: a.isText,
          note: a.note,
        })),
        createdAt: Date.now(),
      } as ChatMessage);

      const assistantId = uid("m_");
      s.addMessage(wsId, {
        id: assistantId,
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: Date.now(),
      });

      const ac = new AbortController();
      abortRef.current = ac;
      let buffer = "";
      let phase: Phase = "generating";

      try {
        const result = await runAgent({
          history,
          request,
          product: ws.files,
          attachments: uploaded,
          callbacks: {
            signal: ac.signal,
            onToken: (d) => {
              buffer += d;
              if (phase === "generating") {
                useStore
                  .getState()
                  .updateMessage(wsId, assistantId, { content: visibleProse(buffer) });
              }
            },
            onPhase: (p, detail) => {
              phase = p;
              if (p === "generating") buffer = "";
              const status =
                p === "generating"
                  ? "streaming"
                  : p === "building"
                    ? "building"
                    : p === "fixing"
                      ? "fixing"
                      : "done";
              useStore
                .getState()
                .updateMessage(wsId, assistantId, { status, statusDetail: detail });
            },
          },
        });

        const st = useStore.getState();
        st.setProduct(wsId, result.files, result.kind);
        st.snapshotVersion(wsId, request.slice(0, 60) || "build");

        const fileCount = Object.keys(result.files).length;
        let detail = `${fileCount} file${fileCount === 1 ? "" : "s"} · ${
          result.kind === "web" ? "web app" : "files"
        }`;
        if (result.iterations > 0) detail += ` · auto-fixed ${result.iterations}×`;
        if (result.remainingErrors.length > 0)
          detail += ` · ⚠ ${result.remainingErrors.length} issue(s) remain`;

        const note =
          result.note?.trim() ||
          (result.remainingErrors.length
            ? "Built, but with some remaining issues (below)."
            : "Done.");
        const content =
          result.remainingErrors.length > 0
            ? `${note}\n\nRemaining issues I couldn't fully resolve automatically:\n` +
              result.remainingErrors.map((e) => `• ${e}`).join("\n")
            : note;

        st.updateMessage(wsId, assistantId, {
          content,
          status: "done",
          statusDetail: detail,
        });
      } catch (err) {
        const aborted = ac.signal.aborted;
        const message = err instanceof Error ? err.message : String(err);
        useStore.getState().updateMessage(wsId, assistantId, {
          content: visibleProse(buffer),
          status: "error",
          statusDetail: aborted ? "Stopped." : message,
        });
        throw err;
      } finally {
        abortRef.current = null;
      }
    },
    [],
  );

  const drainQueue = useCallback(
    async (wsId: string) => {
      for (;;) {
        const next = useStore.getState().dequeue(wsId);
        if (!next) break;
        await runRequest(wsId, next, []);
      }
    },
    [runRequest],
  );

  const handleSend = useCallback(
    async (text: string, rawFiles: File[]) => {
      if (running) return;
      let wsId = useStore.getState().activeId;
      if (!wsId) wsId = useStore.getState().createWorkspace();
      setRunning(true);
      try {
        const uploaded = rawFiles.length ? await readUploads(rawFiles) : [];
        await runRequest(wsId, text, uploaded);
        await drainQueue(wsId);
      } catch {
        /* surfaced in the message */
      } finally {
        setRunning(false);
      }
    },
    [running, runRequest, drainQueue],
  );

  const handleRunQueue = useCallback(async () => {
    if (running) return;
    const wsId = useStore.getState().activeId;
    if (!wsId) return;
    setRunning(true);
    try {
      await drainQueue(wsId);
    } catch {
      /* surfaced */
    } finally {
      setRunning(false);
    }
  }, [running, drainQueue]);

  if (!mounted) {
    return (
      <div className="grid h-screen place-items-center bg-[#0a0a0f] text-white/40">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f] text-white">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {workspace?.name ?? "No workspace"}
            </div>
            <div className="text-xs text-white/40">
              {health?.model
                ? `Nemotron · ${health.model}`
                : "vibe programming"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-xs text-white/40"
              title={
                health?.ok
                  ? "Server connected to Nemotron"
                  : "NVIDIA_API_KEY not set on the server"
              }
            >
              <Circle
                className={`h-2.5 w-2.5 ${
                  health?.ok ? "fill-emerald-400 text-emerald-400" : "fill-red-400 text-red-400"
                }`}
              />
              {health?.ok ? "online" : "no key"}
            </span>
            <button
              onClick={() => setSpecOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/10"
            >
              <Cpu className="h-3.5 w-3.5" /> Spec card
            </button>
          </div>
          {specOpen && <SpecCard onClose={() => setSpecOpen(false)} />}
        </div>

        {health && !health.ok && (
          <div className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              The server has no <span className="mono">NVIDIA_API_KEY</span>. Add it
              to <span className="mono">.env.local</span> (local) or your Vercel
              project&apos;s Environment Variables, then reload. The UI works, but
              generation will fail until a key is set.
            </span>
          </div>
        )}

        {/* Work area: chat + preview */}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 basis-1/2 flex-col">
            <ChatPanel messages={workspace?.messages ?? []} />
            <Composer
              running={running}
              queue={workspace?.queue ?? []}
              onSend={handleSend}
              onQueue={(t) => activeId && useStore.getState().enqueue(activeId, t)}
              onStop={() => abortRef.current?.abort()}
              onRemoveQueued={(i) => activeId && useStore.getState().removeQueued(activeId, i)}
              onRunQueue={handleRunQueue}
            />
          </div>

          {workspace && (
            <div className="hidden min-w-0 basis-1/2 md:flex">
              <PreviewPanel
                workspace={workspace}
                onDownloadZip={() => downloadZip(workspace.files, workspace.name)}
                onDownloadFile={(p) => downloadFile(p, workspace.files[p] ?? "")}
                onRestore={(vId) => activeId && useStore.getState().restoreVersion(activeId, vId)}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
