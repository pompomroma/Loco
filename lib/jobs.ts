// Server-side background job engine. Jobs run the full generation loop in the
// Node process, so closing the browser tab does NOT stop generation. The
// browser creates a job, polls it while open, and merges results when it
// returns (lib/jobSync.ts).
//
// Persistence: job state (WITHOUT secrets) is written to data/jobs/<id>.json so
// finished work survives a restart and can be picked up later. The API key and
// model override live only in an in-memory map — never on disk — so a job that
// was mid-flight when the server restarted is marked as interrupted.
import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import type { FileTree } from "./types";
import { parseAgentTurn, applyTurn, detectKind, visibleProse } from "./protocol";
import {
  buildMessages,
  buildFixMessage,
  type ApiMessage,
  type HistoryMessage,
} from "./prompt";
import type { UploadedFile } from "./types";
import { validateProduct } from "./serverValidate";
import { getNvidiaConfig, getGenParams, reasoningSystemLine } from "./nvidia";

const MAX_FIX_ITERATIONS = 3;
const MAX_EMPTY_RETRIES = 2;
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const DATA_DIR = path.join(process.cwd(), "data", "jobs");

export interface JobResult {
  label: string;
  files: FileTree;
  kind: "web" | "files";
  note: string;
  iterations: number;
  remainingErrors: string[];
}

export interface Job {
  id: string;
  workspaceId: string;
  requests: string[];
  currentIndex: number;
  status: "queued" | "running" | "done" | "error";
  phase: string;
  detail: string;
  results: JobResult[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface JobInternal extends Job {
  product: FileTree;
  attachments: UploadedFile[];
  history: HistoryMessage[];
}

// ---- module-level state (one instance in the Next server process) ----------
const jobs = new Map<string, JobInternal>();
const secrets = new Map<string, { apiKey: string; model: string }>();
const buffers = new Map<string, string>(); // live partial model output
const aborts = new Map<string, AbortController>();
const chains = new Map<string, Promise<void>>(); // per-workspace serialization
let loaded = false;

function uid(): string {
  return "job_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const names = await fs.readdir(DATA_DIR);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(DATA_DIR, name), "utf8");
        const job = JSON.parse(raw) as JobInternal;
        // A job that was in flight when the process died can't resume: the
        // API key was memory-only. Mark it honestly.
        if (job.status === "running" || job.status === "queued") {
          job.status = "error";
          job.error =
            "Interrupted by a server restart (the API key is never stored, so the job could not resume). Send the request again.";
          job.updatedAt = Date.now();
        }
        jobs.set(job.id, job);
      } catch {
        /* skip unreadable job files */
      }
    }
  } catch {
    /* data dir unavailable (e.g. read-only serverless) — memory-only mode */
  }
  gc();
}

function gc(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if ((job.status === "done" || job.status === "error") && job.updatedAt < cutoff) {
      jobs.delete(id);
      buffers.delete(id);
      secrets.delete(id);
      void fs.unlink(path.join(DATA_DIR, `${id}.json`)).catch(() => {});
    }
  }
}

async function persist(job: JobInternal): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Secrets are deliberately not part of the job object; write as-is.
    await fs.writeFile(
      path.join(DATA_DIR, `${job.id}.json`),
      JSON.stringify(job),
      "utf8",
    );
  } catch {
    /* best-effort on serverless */
  }
}

function touch(job: JobInternal, phase?: string, detail?: string): void {
  if (phase !== undefined) job.phase = phase;
  if (detail !== undefined) job.detail = detail;
  job.updatedAt = Date.now();
}

// ---- public API -------------------------------------------------------------

export interface CreateJobParams {
  workspaceId: string;
  requests: string[];
  product: FileTree;
  attachments: UploadedFile[];
  history: HistoryMessage[];
  apiKey: string;
  model: string;
}

export async function createJob(params: CreateJobParams): Promise<Job> {
  await ensureLoaded();
  gc();
  const now = Date.now();
  const job: JobInternal = {
    id: uid(),
    workspaceId: params.workspaceId,
    requests: params.requests,
    currentIndex: 0,
    status: "queued",
    phase: "queued",
    detail: "Waiting to start.",
    results: [],
    product: params.product,
    attachments: params.attachments,
    history: params.history,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  secrets.set(job.id, { apiKey: params.apiKey, model: params.model });
  await persist(job);

  // Serialize jobs per workspace so stacked work applies in order.
  const prev = chains.get(job.workspaceId) ?? Promise.resolve();
  const next = prev.then(() => runJob(job.id)).catch(() => {});
  chains.set(job.workspaceId, next);

  return publicJob(job);
}

export async function getJob(id: string): Promise<(Job & { partialNote: string; results: JobResult[] }) | null> {
  await ensureLoaded();
  const job = jobs.get(id);
  if (!job) return null;
  return {
    ...publicJob(job),
    partialNote: visibleProse(buffers.get(id) ?? ""),
    results: job.results,
  };
}

export async function listJobs(workspaceId: string): Promise<Job[]> {
  await ensureLoaded();
  gc();
  return [...jobs.values()]
    .filter((j) => j.workspaceId === workspaceId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(publicJob);
}

export async function deleteJob(id: string): Promise<boolean> {
  await ensureLoaded();
  const job = jobs.get(id);
  if (!job) return false;
  aborts.get(id)?.abort();
  jobs.delete(id);
  buffers.delete(id);
  secrets.delete(id);
  aborts.delete(id);
  await fs.unlink(path.join(DATA_DIR, `${id}.json`)).catch(() => {});
  return true;
}

function publicJob(job: JobInternal): Job {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    requests: job.requests,
    currentIndex: job.currentIndex,
    status: job.status,
    phase: job.phase,
    detail: job.detail,
    results: job.results,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

// ---- the runner -------------------------------------------------------------

function isMaxTokensRejection(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : String(err);
  return status === 400 && /max_?tokens|maximum.*tokens|length/i.test(msg);
}

function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status != null) return status >= 500 || status === 429;
  // No HTTP status → network-level failure (reset, DNS, timeout).
  return true;
}

async function streamCompletion(
  jobId: string,
  messages: ApiMessage[],
  signal: AbortSignal,
): Promise<string> {
  const cfg = getNvidiaConfig();
  const gen = getGenParams();
  const secret = secrets.get(jobId);
  if (!secret) throw new Error("Job credentials are gone (server restarted).");
  const client = new OpenAI({ apiKey: secret.apiKey, baseURL: cfg.baseURL });

  const finalMessages: ApiMessage[] = gen.reasoning
    ? [{ role: "system", content: reasoningSystemLine(gen.reasoning) }, ...messages]
    : messages;

  // Attempt 1: full output budget. If the model's ceiling is lower (400 on
  // max_tokens), retry without it so the model's own maximum applies. One
  // extra retry for transient upstream failures (5xx/429/network).
  let includeMaxTokens = true;
  let transientRetried = false;
  for (;;) {
    try {
      const stream = await client.chat.completions.create(
        {
          model: secret.model,
          messages: finalMessages,
          temperature: gen.temperature,
          ...(includeMaxTokens ? { max_tokens: gen.maxTokens } : {}),
          stream: true,
        },
        { signal },
      );
      let full = "";
      const job = jobs.get(jobId);
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          buffers.set(jobId, full);
          if (job) job.updatedAt = Date.now(); // heartbeat for stall detection
        }
      }
      return full;
    } catch (err) {
      if (signal.aborted) throw err;
      if (includeMaxTokens && isMaxTokensRejection(err)) {
        includeMaxTokens = false;
        continue;
      }
      if (!transientRetried && isTransient(err)) {
        transientRetried = true;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

async function generateTurn(
  jobId: string,
  baseMessages: ApiMessage[],
  signal: AbortSignal,
): Promise<ReturnType<typeof parseAgentTurn>> {
  let msgs = baseMessages;
  for (let attempt = 0; ; attempt++) {
    buffers.set(jobId, "");
    const text = await streamCompletion(jobId, msgs, signal);
    const turn = parseAgentTurn(text);
    const emitted = Object.keys(turn.files).length + turn.deletions.length;
    if (emitted > 0 || attempt >= MAX_EMPTY_RETRIES) return turn;
    msgs = [
      ...baseMessages,
      { role: "assistant", content: turn.note || "(no output)" },
      {
        role: "user",
        content:
          "You did not emit any files in the required <<<FILE path>>> ... <<<ENDFILE>>> format. " +
          "Emit the COMPLETE, working product now using that exact format. No placeholders.",
      },
    ];
  }
}

async function runJob(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job || job.status !== "queued") return;

  const ac = new AbortController();
  aborts.set(id, ac);
  job.status = "running";
  touch(job, "generating", "Starting generation.");
  await persist(job);

  try {
    let files = job.product;
    let history = [...job.history];

    for (let i = 0; i < job.requests.length; i++) {
      job.currentIndex = i;
      const request = job.requests[i];
      touch(
        job,
        "generating",
        job.requests.length > 1
          ? `Request ${i + 1} of ${job.requests.length}: generating.`
          : "Generating.",
      );
      await persist(job);

      const messages = buildMessages({
        history,
        request,
        product: files,
        attachments: i === 0 ? job.attachments : [],
      });
      let turn = await generateTurn(id, messages, ac.signal);
      files = applyTurn(files, turn);

      // Static validation + capped fix loop (syntax/asset errors only — the
      // richer runtime check happens in the browser when the user returns).
      let iterations = 0;
      let problems = validateProduct(files);
      while (problems.length > 0 && iterations < MAX_FIX_ITERATIONS) {
        iterations++;
        touch(job, "fixing", `Found ${problems.length} issue(s) — fix pass ${iterations}.`);
        const fixTurn = await generateTurn(id, buildFixMessage(problems, files), ac.signal);
        const changed = Object.keys(fixTurn.files).length + fixTurn.deletions.length;
        if (changed === 0) break;
        files = applyTurn(files, fixTurn);
        turn = { ...turn, note: fixTurn.note || turn.note };
        problems = validateProduct(files);
      }

      const kind = detectKind(files);
      job.results.push({
        label: request.slice(0, 60) || "build",
        files,
        kind,
        note: turn.note,
        iterations,
        remainingErrors: problems,
      });
      history = [
        ...history,
        { role: "user", content: request },
        { role: "assistant", content: turn.note || "Applied." },
      ];
      job.product = files;
      touch(job, "generating", `Request ${i + 1} of ${job.requests.length} complete.`);
      await persist(job);
    }

    job.status = "done";
    touch(job, "done", "All requests processed.");
  } catch (err) {
    job.status = "error";
    const message = err instanceof Error ? err.message : String(err);
    job.error = ac.signal.aborted ? "Cancelled." : message;
    touch(job, "error", job.error);
  } finally {
    buffers.delete(id);
    secrets.delete(id); // drop credentials the moment work ends
    aborts.delete(id);
    if (jobs.has(id)) await persist(job);
  }
}
