"use client";

import type { AgentTurn, FileTree, UploadedFile, ChatMessage } from "./types";
import { buildMessages, buildFixMessage, type ApiMessage } from "./prompt";
import { parseAgentTurn, applyTurn, detectKind } from "./protocol";
import { assemblePreview } from "./preview";
import { useSettings, KEY_HEADER } from "./settings";

const MAX_FIX_ITERATIONS = 4;
const MAX_EMPTY_RETRIES = 2;

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
}

/** POST to the streaming proxy and accumulate the full text, forwarding deltas. */
async function streamChat(
  messages: ApiMessage[],
  onToken: (d: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Bring-your-own-key: if the user saved a key in-app, send it to our proxy so
  // no .env configuration is needed. It goes only to this app's own server.
  const userKey = useSettings.getState().apiKey.trim();
  if (userKey) headers[KEY_HEADER] = userKey;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    onToken(chunk);
  }
  if (full.includes("<<<STREAM_ERROR>>>")) {
    const detail = full.split("<<<STREAM_ERROR>>>")[1]?.trim() || "unknown";
    throw new Error(`Streaming error from Nemotron: ${detail}`);
  }
  return full;
}

/** Generate one turn, retrying if the model emitted no file blocks. */
async function generateOnce(
  messages: ApiMessage[],
  cb: RunCallbacks,
): Promise<{ text: string; turn: AgentTurn }> {
  let attempt = 0;
  let msgs = messages;
  for (;;) {
    const text = await streamChat(msgs, cb.onToken, cb.signal);
    const turn = parseAgentTurn(text);
    const emitted = Object.keys(turn.files).length + turn.deletions.length;
    if (emitted > 0 || attempt >= MAX_EMPTY_RETRIES) return { text, turn };
    attempt++;
    cb.onPhase("generating", `No files detected — asking again (attempt ${attempt + 1}).`);
    msgs = [
      ...messages,
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

/**
 * Run the generated web product in a hidden sandboxed iframe and collect any
 * runtime errors/console errors it produces. Returns [] for non-web products.
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
    // allow-same-origin so apps using localStorage/canvas don't throw spuriously.
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
      // De-duplicate and cap the report.
      const seen = new Set<string>();
      const unique = errors.filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
      resolve(unique.slice(0, 12));
    }

    iframe.onload = () => setTimeout(finish, waitMs);
    // Hard timeout in case onload never fires.
    setTimeout(finish, waitMs + 3500);
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

/**
 * Full run: generate the product, then (for web products) iteratively fix runtime
 * errors until the preview runs clean or we hit the safety cap.
 */
export async function runAgent(opts: {
  history: ChatMessage[];
  request: string;
  product: FileTree;
  attachments?: UploadedFile[];
  callbacks: RunCallbacks;
}): Promise<RunResult> {
  const { callbacks: cb } = opts;

  cb.onPhase("generating");
  const messages = buildMessages({
    history: opts.history,
    request: opts.request,
    product: opts.product,
    attachments: opts.attachments,
  });
  const { turn } = await generateOnce(messages, cb);

  let files = applyTurn(opts.product, turn);
  let kind = detectKind(files);
  const note = turn.note;
  let done = turn.done;
  let remainingErrors: string[] = [];
  let iterations = 0;

  if (kind === "web") {
    for (; iterations < MAX_FIX_ITERATIONS; ) {
      cb.onPhase("building", `Running preview to check for errors (pass ${iterations + 1}).`);
      const errors = await collectPreviewErrors(files);
      if (errors.length === 0) {
        done = true;
        break;
      }
      remainingErrors = errors;
      iterations++;
      if (iterations >= MAX_FIX_ITERATIONS) break;
      cb.onPhase("fixing", `Found ${errors.length} issue(s) — fixing (pass ${iterations}).`);
      const fixMsgs = buildFixMessage(errors, files);
      const fixText = await streamChat(fixMsgs, cb.onToken, cb.signal);
      const fixTurn = parseAgentTurn(fixText);
      const changed = Object.keys(fixTurn.files).length + fixTurn.deletions.length;
      if (changed === 0) break; // model couldn't produce a fix; stop honestly
      files = applyTurn(files, fixTurn);
      kind = detectKind(files);
    }
    // Final clean check.
    if (remainingErrors.length > 0) {
      const finalErrors = await collectPreviewErrors(files);
      remainingErrors = finalErrors;
      if (finalErrors.length === 0) done = true;
    }
  }

  cb.onPhase("done");
  return { files, kind, note, done, remainingErrors, iterations };
}
