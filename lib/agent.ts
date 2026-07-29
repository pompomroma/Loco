"use client";

import type { FileTree, UploadedFile, ChatMessage } from "./types";
import type { Job, JobResult } from "./jobs";
import { assemblePreview } from "./preview";
import { useSettings, KEY_HEADER, MODEL_HEADER } from "./settings";

const POLL_MS = 1000;
const STALL_MS = 90_000;

export type Phase = "generating" | "building" | "fixing" | "done" | "error";

export interface RunCallbacks {
  onToken: (delta: string) => void;
  onPhase: (phase: Phase, detail?: string) => void;
  signal?: AbortSignal;
}

export interface RunResult {
  files: FileTree;
  kind: "web" | "files";
  note: string;
  done: boolean;
  remainingErrors: string[];
  iterations: number;
  results: JobResult[];
  jobId: string;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { apiKey, model } = useSettings.getState();
  if (apiKey.trim()) headers[KEY_HEADER] = apiKey.trim();
  if (model.trim()) headers[MODEL_HEADER] = model.trim();
  return headers;
}

/** Create a background generation job on the server. Generation continues
 *  server-side even if this tab closes; results are merged on return. */
export async function createGenerationJob(opts: {
  workspaceId: string;
  requests: string[];
  product: FileTree;
  attachments?: UploadedFile[];
  history: ChatMessage[];
}): Promise<Job> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      workspaceId: opts.workspaceId,
      requests: opts.requests,
      product: opts.product,
      attachments: opts.attachments ?? [],
      // Prose-only history; the product tree is sent fresh above.
      history: opts.history
        .filter((m) => m.content?.trim())
        .map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const json = (await res.json()) as { job?: Job; error?: string };
  if (!res.ok || !json.job) {
    throw new Error(json.error || `Failed to create job (${res.status}).`);
  }
  return json.job;
}

export async function fetchJob(
  id: string,
): Promise<(Job & { partialNote: string }) | null> {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  const json = (await res.json()) as { job?: Job & { partialNote: string } };
  return json.job ?? null;
}

export async function deleteJobOnServer(id: string): Promise<void> {
  await fetch(`/api/jobs/${id}`, { method: "DELETE" }).catch(() => {});
}

function jobPhaseToUi(job: Job): { phase: Phase; detail: string } {
  if (job.status === "done") return { phase: "done", detail: job.detail };
  if (job.status === "error") return { phase: "error", detail: job.error || job.detail };
  if (job.phase === "fixing") return { phase: "fixing", detail: job.detail };
  return { phase: "generating", detail: job.detail };
}

function resultFromJob(job: Job & { partialNote?: string }): RunResult {
  const last = job.results[job.results.length - 1];
  return {
    files: last?.files ?? {},
    kind: last?.kind ?? "files",
    note: last?.note ?? "",
    done: job.status === "done",
    remainingErrors: last?.remainingErrors ?? [],
    iterations: job.results.reduce((n, r) => n + r.iterations, 0),
    results: job.results,
    jobId: job.id,
  };
}

/**
 * Watch a job until it finishes, forwarding progress to the UI callbacks.
 * Abort (via signal) cancels the job server-side too.
 * Stall detection: if the server heartbeat stops moving for STALL_MS, we
 * surface it honestly instead of spinning forever.
 */
export async function watchJob(id: string, cb: RunCallbacks): Promise<RunResult> {
  let lastNote = "";
  let lastUpdatedAt = 0;
  let stallSince = Date.now();

  for (;;) {
    if (cb.signal?.aborted) {
      await deleteJobOnServer(id);
      throw new Error("Stopped.");
    }
    const job = await fetchJob(id);
    if (!job) throw new Error("The job disappeared on the server (it may have restarted).");

    // Forward newly streamed prose (delta only) so the UI feels live.
    if (job.partialNote && job.partialNote !== lastNote) {
      const delta = job.partialNote.startsWith(lastNote)
        ? job.partialNote.slice(lastNote.length)
        : job.partialNote;
      lastNote = job.partialNote;
      if (delta) cb.onToken(delta);
    }

    const { phase, detail } = jobPhaseToUi(job);
    cb.onPhase(phase, detail);

    if (job.status === "done") return resultFromJob(job);
    if (job.status === "error") throw new Error(job.error || "Generation failed.");

    if (job.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = job.updatedAt;
      stallSince = Date.now();
    } else if (Date.now() - stallSince > STALL_MS) {
      throw new Error(
        "The job stalled — the server may have restarted mid-run. Send the request again.",
      );
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/**
 * Run the generated web product in a hidden sandboxed iframe and collect any
 * runtime errors/console errors it produces. Returns [] for non-web products.
 * (Client-side only — this is the richer check the server can't do.)
 */
export function collectPreviewErrors(files: FileTree, waitMs = 1800): Promise<string[]> {
  return new Promise((resolve) => {
    let html: string | null = null;
    try {
      html = assemblePreview(files);
    } catch {
      html = null;
    }
    if (!html) return resolve([]);

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "1024px";
    iframe.style.height = "768px";
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-pointer-lock",
    );

    const errors: string[] = [];
    let settled = false;

    function onMsg(ev: MessageEvent) {
      const d = ev.data as { __loco?: boolean; kind?: string; message?: string };
      if (!d || !d.__loco) return;
      if ((d.kind === "error" || d.kind === "console") && d.message) {
        errors.push(d.message);
      }
    }
    window.addEventListener("message", onMsg);

    function finish() {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMsg);
      iframe.remove();
      const seen = new Set<string>();
      const unique = errors.filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
      resolve(unique.slice(0, 12));
    }

    iframe.onload = () => setTimeout(finish, waitMs);
    setTimeout(finish, waitMs + 3500);
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

/** Compose a fix request (sent as a normal adjustment job) from runtime errors
 *  found by the in-browser check after a background job lands. */
export function composeRuntimeFixRequest(errors: string[]): string {
  return (
    "The current product produced these RUNTIME errors when it ran in the browser preview:\n" +
    errors.map((e, i) => `${i + 1}. ${e}`).join("\n") +
    "\nFix the ROOT CAUSE and re-emit only the changed files."
  );
}
