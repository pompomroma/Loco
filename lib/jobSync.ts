"use client";

// Return-sync: reconciles server-side background jobs with the local store.
// Called on app load and on workspace switch. Merging is idempotent — the
// assistant message id is derived from the job id, so a job is merged at most
// once even across multiple tabs/reloads.

import { useStore } from "./store";
import { fetchJob, deleteJobOnServer } from "./agent";
import type { Job, JobResult } from "./jobs";

export type SyncOutcome =
  | { state: "idle" }
  | { state: "running"; jobId: string; messageId: string }
  | { state: "merged"; files: Record<string, string>; kind: "web" | "files" }
  | { state: "failed"; error: string };

function doneContent(results: JobResult[]): string {
  const last = results[results.length - 1];
  const note = last?.note?.trim() || "Done.";
  const errs = last?.remainingErrors ?? [];
  if (errs.length === 0) return note;
  return (
    `${note}\n\nRemaining issues I couldn't fully resolve automatically:\n` +
    errs.map((e) => `• ${e}`).join("\n")
  );
}

function doneDetail(job: Job): string {
  const last = job.results[job.results.length - 1];
  const fileCount = Object.keys(last?.files ?? {}).length;
  const fixes = job.results.reduce((n, r) => n + r.iterations, 0);
  let detail = `${fileCount} file${fileCount === 1 ? "" : "s"} · ${
    (last?.kind ?? "files") === "web" ? "web app" : "files"
  }`;
  if (job.requests.length > 1) detail += ` · ${job.requests.length} stacked requests`;
  if (fixes > 0) detail += ` · auto-fixed ${fixes}×`;
  const errs = last?.remainingErrors?.length ?? 0;
  if (errs > 0) detail += ` · ⚠ ${errs} issue(s) remain`;
  detail += " · ran in background";
  return detail;
}

/** Merge a finished job into its workspace exactly once. */
export function mergeFinishedJob(wsId: string, job: Job): SyncOutcome {
  const s = useStore.getState();
  const ws = s.workspaces[wsId];
  if (!ws) return { state: "idle" };

  const mergedMsgId = `m_job_${job.id}`;
  const alreadyMerged = ws.messages.some((m) => m.id === mergedMsgId);

  if (!alreadyMerged && job.results.length > 0) {
    // Version snapshot per request, ending with the final product live.
    for (const result of job.results) {
      s.setProduct(wsId, result.files, result.kind);
      s.snapshotVersion(wsId, result.label);
    }

    // Reuse the in-progress message from this browser if it exists; otherwise
    // append a fresh one (job may have been started before a full reload).
    const progressId = ws.activeJobMessageId;
    const hasProgressMsg = progressId && ws.messages.some((m) => m.id === progressId);
    if (hasProgressMsg) {
      s.updateMessage(wsId, progressId, {
        id: progressId,
        content: doneContent(job.results),
        status: "done",
        statusDetail: doneDetail(job),
      });
      // Re-id so future merges see it as merged.
      const cur = useStore.getState().workspaces[wsId];
      if (cur) {
        const renamed = cur.messages.map((m) =>
          m.id === progressId ? { ...m, id: mergedMsgId } : m,
        );
        useStore.setState((st) => ({
          workspaces: { ...st.workspaces, [wsId]: { ...cur, messages: renamed } },
        }));
      }
    } else {
      s.addMessage(wsId, {
        id: mergedMsgId,
        role: "assistant",
        content: doneContent(job.results),
        status: "done",
        statusDetail: doneDetail(job),
        createdAt: Date.now(),
      });
    }
  }

  s.setActiveJob(wsId, null, null);
  void deleteJobOnServer(job.id);

  const last = job.results[job.results.length - 1];
  return {
    state: "merged",
    files: last?.files ?? {},
    kind: last?.kind ?? "files",
  };
}

/** Record a failed job on the workspace chat, exactly once. */
export function recordFailedJob(wsId: string, job: Job): SyncOutcome {
  const s = useStore.getState();
  const ws = s.workspaces[wsId];
  if (!ws) return { state: "idle" };
  const error = job.error || "Generation failed.";

  const progressId = ws.activeJobMessageId;
  const hasProgressMsg = progressId && ws.messages.some((m) => m.id === progressId);
  const mergedMsgId = `m_job_${job.id}`;
  const alreadyRecorded = ws.messages.some((m) => m.id === mergedMsgId);

  if (hasProgressMsg) {
    s.updateMessage(wsId, progressId, { status: "error", statusDetail: error });
  } else if (!alreadyRecorded) {
    s.addMessage(wsId, {
      id: mergedMsgId,
      role: "assistant",
      content: "",
      status: "error",
      statusDetail: error,
      createdAt: Date.now(),
    });
  }
  s.setActiveJob(wsId, null, null);
  void deleteJobOnServer(job.id);
  return { state: "failed", error };
}

/**
 * Check a workspace's stored background job. Merges finished work, records
 * failures, and reports a still-running job so the caller can attach a watcher.
 */
export async function syncWorkspaceJob(wsId: string): Promise<SyncOutcome> {
  const ws = useStore.getState().workspaces[wsId];
  const jobId = ws?.activeJobId;
  if (!ws || !jobId) return { state: "idle" };

  const job = await fetchJob(jobId).catch(() => null);
  if (!job) {
    // Server lost the job (restart / TTL). Close the dangling message honestly.
    const progressId = ws.activeJobMessageId;
    if (progressId && ws.messages.some((m) => m.id === progressId)) {
      useStore.getState().updateMessage(wsId, progressId, {
        status: "error",
        statusDetail:
          "The background job is gone (the server may have restarted). Send the request again.",
      });
    }
    useStore.getState().setActiveJob(wsId, null, null);
    return { state: "idle" };
  }

  if (job.status === "done") return mergeFinishedJob(wsId, job);
  if (job.status === "error") return recordFailedJob(wsId, job);
  return {
    state: "running",
    jobId,
    messageId: ws.activeJobMessageId ?? "",
  };
}
