"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Circle, AlertTriangle, KeyRound } from "lucide-react";
import { useStore, uid } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import type { ChatMessage, UploadedFile } from "@/lib/types";
import {
  createGenerationJob,
  watchJob,
  fetchJob,
  collectPreviewErrors,
  composeRuntimeFixRequest,
} from "@/lib/agent";
import {
  syncWorkspaceJob,
  mergeFinishedJob,
  recordFailedJob,
} from "@/lib/jobSync";
import { readUploads } from "@/lib/uploads";
import { downloadZip, downloadFile } from "@/lib/download";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import Composer from "@/components/Composer";
import PreviewPanel from "@/components/PreviewPanel";
import SpecCard from "@/components/SpecCard";
import KeySettings from "@/components/KeySettings";

interface Health {
  ok: boolean;
  model: string;
  hasWorker: boolean;
}

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const abortMap = useRef(new Map<string, AbortController>());
  const userKey = useSettings((s) => s.apiKey);
  const userModel = useSettings((s) => s.model);

  const order = useStore((s) => s.order);
  const activeId = useStore((s) => s.activeId);
  const workspace = useStore((s) => (s.activeId ? s.workspaces[s.activeId] : null));

  // "Running" is per-workspace: true while the displayed workspace has a live
  // background job (or a job is being created right now).
  const running = busy || Boolean(workspace?.activeJobId);

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

  // Watch a background job, mirroring progress into its assistant message.
  // On completion: merge results; if the tab is still open and the product is
  // a web app, run the in-browser runtime check and chain ONE fix job.
  async function attachToJob(
    wsId: string,
    jobId: string,
    assistantId: string,
    allowRuntimeFix: boolean,
  ): Promise<void> {
    const ac = new AbortController();
    abortMap.current.set(wsId, ac);
    let buffer = "";
    try {
      await watchJob(jobId, {
        signal: ac.signal,
        onToken: (d) => {
          buffer += d;
          useStore.getState().updateMessage(wsId, assistantId, { content: buffer });
        },
        onPhase: (p, detail) => {
          const status =
            p === "fixing" ? "fixing" : p === "done" ? "done" : p === "error" ? "error" : "streaming";
          useStore.getState().updateMessage(wsId, assistantId, {
            status,
            statusDetail: detail
              ? `${detail} Running in background — safe to close this tab.`
              : "Running in background — safe to close this tab.",
          });
        },
      });

      const job = await fetchJob(jobId);
      if (job?.status === "done") {
        const outcome = mergeFinishedJob(wsId, job);
        if (allowRuntimeFix && outcome.state === "merged" && outcome.kind === "web") {
          const errors = await collectPreviewErrors(outcome.files);
          if (errors.length > 0) {
            await runRequests(wsId, [composeRuntimeFixRequest(errors)], [], {
              allowRuntimeFix: false,
              internalLabel: "Verifying in your browser and fixing runtime errors…",
            });
          }
        }
      }
    } catch (err) {
      const job = await fetchJob(jobId).catch(() => null);
      if (job?.status === "done") {
        mergeFinishedJob(wsId, job);
      } else if (job?.status === "error") {
        recordFailedJob(wsId, job);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        useStore.getState().updateMessage(wsId, assistantId, {
          status: "error",
          statusDetail: ac.signal.aborted ? "Stopped." : message,
        });
        useStore.getState().setActiveJob(wsId, null, null);
      }
    } finally {
      abortMap.current.delete(wsId);
    }
  }

  // Create a background job for one or more requests (stacked adjustments ride
  // in the same job so the server drains them without the tab being open).
  async function runRequests(
    wsId: string,
    requests: string[],
    uploaded: UploadedFile[],
    opts: { allowRuntimeFix: boolean; internalLabel?: string },
  ): Promise<void> {
    const s = useStore.getState();
    const ws = s.workspaces[wsId];
    if (!ws || requests.length === 0) return;

    // History snapshot BEFORE adding the new user messages (the request text is
    // sent separately in the job payload).
    const history = ws.messages;

    if (!opts.internalLabel) {
      requests.forEach((request, i) => {
        s.addMessage(wsId, {
          id: uid("m_"),
          role: "user",
          content: request,
          attachments:
            i === 0
              ? uploaded.map((a) => ({
                  name: a.name,
                  mime: a.mime,
                  size: a.size,
                  isText: a.isText,
                  note: a.note,
                }))
              : undefined,
          createdAt: Date.now(),
        } as ChatMessage);
      });
    }

    const assistantId = uid("m_");
    s.addMessage(wsId, {
      id: assistantId,
      role: "assistant",
      content: opts.internalLabel ?? "",
      status: "streaming",
      statusDetail: "Starting background job…",
      createdAt: Date.now(),
    });

    try {
      const job = await createGenerationJob({
        workspaceId: wsId,
        requests,
        product: ws.files,
        attachments: uploaded,
        history,
      });
      useStore.getState().setActiveJob(wsId, job.id, assistantId);
      await attachToJob(wsId, job.id, assistantId, opts.allowRuntimeFix);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useStore.getState().updateMessage(wsId, assistantId, {
        status: "error",
        statusDetail: message,
      });
    }
  }

  const handleSend = useCallback(
    async (text: string, rawFiles: File[]) => {
      let wsId = useStore.getState().activeId;
      if (!wsId) wsId = useStore.getState().createWorkspace();
      const ws = useStore.getState().workspaces[wsId];
      if (!ws || ws.activeJobId) return;
      setBusy(true);
      try {
        const uploaded = rawFiles.length ? await readUploads(rawFiles) : [];
        // The stacked queue rides along in the same background job.
        const requests = [text, ...ws.queue];
        if (ws.queue.length > 0) useStore.getState().clearQueue(wsId);
        await runRequests(wsId, requests, uploaded, { allowRuntimeFix: true });
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleRunQueue = useCallback(async () => {
    const wsId = useStore.getState().activeId;
    if (!wsId) return;
    const ws = useStore.getState().workspaces[wsId];
    if (!ws || ws.activeJobId || ws.queue.length === 0) return;
    setBusy(true);
    try {
      const requests = [...ws.queue];
      useStore.getState().clearQueue(wsId);
      await runRequests(wsId, requests, [], { allowRuntimeFix: true });
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On load: sweep every workspace for background jobs that finished (merge
  // them) or are still running (re-attach so progress resumes in this tab).
  useEffect(() => {
    if (!mounted) return;
    const ids = useStore.getState().order;
    (async () => {
      for (const wsId of ids) {
        try {
          const outcome = await syncWorkspaceJob(wsId);
          if (outcome.state === "running") {
            let msgId = outcome.messageId;
            const ws = useStore.getState().workspaces[wsId];
            if (!ws) continue;
            if (!msgId || !ws.messages.some((m) => m.id === msgId)) {
              msgId = uid("m_");
              useStore.getState().addMessage(wsId, {
                id: msgId,
                role: "assistant",
                content: "",
                status: "streaming",
                statusDetail: "Reattached to the background job.",
                createdAt: Date.now(),
              });
              useStore.getState().setActiveJob(wsId, outcome.jobId, msgId);
            }
            void attachToJob(wsId, outcome.jobId, msgId, true);
          }
        } catch {
          /* per-workspace sync is best-effort */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Generation works if either the server has a key or the user saved one here.
  const online = Boolean(health?.ok || userKey.trim());

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
              {userModel.trim()
                ? `Nemotron · ${userModel.trim()}`
                : health?.model
                  ? `Nemotron · ${health.model}`
                  : "vibe programming"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-xs text-white/40"
              title={
                userKey.trim()
                  ? "Using the key saved in this browser"
                  : health?.ok
                    ? "Using the server's configured key"
                    : "No key — add yours via the API key button"
              }
            >
              <Circle
                className={`h-2.5 w-2.5 ${
                  online ? "fill-emerald-400 text-emerald-400" : "fill-red-400 text-red-400"
                }`}
              />
              {userKey.trim() ? "online · your key" : health?.ok ? "online" : "no key"}
            </span>
            <button
              onClick={() => {
                setKeyOpen((v) => !v);
                setSpecOpen(false);
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-white/10 ${
                online
                  ? "border-white/10 text-white/70"
                  : "border-amber-400/40 text-amber-300"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" /> API key
            </button>
            <button
              onClick={() => {
                setSpecOpen((v) => !v);
                setKeyOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/10"
            >
              <Cpu className="h-3.5 w-3.5" /> Spec card
            </button>
          </div>
          {specOpen && <SpecCard onClose={() => setSpecOpen(false)} />}
          {keyOpen && <KeySettings onClose={() => setKeyOpen(false)} />}
        </div>

        {health && !online && (
          <div className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              No API key yet. Click{" "}
              <button
                onClick={() => setKeyOpen(true)}
                className="font-semibold underline underline-offset-2 hover:text-amber-100"
              >
                API key
              </button>{" "}
              in the top bar and paste your <span className="mono">nvapi-…</span>{" "}
              key — no .env file needed. (Server admins can alternatively set{" "}
              <span className="mono">NVIDIA_API_KEY</span> as an environment
              variable.)
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
              onStop={() => activeId && abortMap.current.get(activeId)?.abort()}
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
