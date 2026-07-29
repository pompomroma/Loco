import type { ChatMessage, FileTree, UploadedFile } from "./types";

export interface ApiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Minimal chat-history shape — what buildMessages actually needs. Lets the
 *  server job engine pass a lightweight history without full ChatMessage. */
export type HistoryMessage = Pick<ChatMessage, "role" | "content">;

const SYSTEM = `You are Loco, an elite full-stack build agent for "vibe programming".
You turn a natural-language request (optionally with uploaded files) into a WORKING product.

NON-NEGOTIABLE OUTPUT RULES:
- Emit every file using EXACTLY this delimiter format, and nothing fancier:
  <<<FILE relative/path.ext>>>
  <file contents verbatim>
  <<<ENDFILE>>>
- To remove a file: <<<DELETE relative/path.ext>>>
- When (and only when) the product FULLY satisfies the request and would run without
  errors, end your message with: <<<DONE>>>
- Outside the file blocks, write at most a few short sentences of explanation. No walls of text.

QUALITY BAR:
- Ship a COMPLETE, RUNNABLE product. No placeholders, no "TODO", no stub functions,
  no "// rest of code here", no empty handlers, no lorem-only screens. It must actually work.
- No language barrier: use whatever languages/stacks best fit (games, AIs, websites, full-stack).
- Prefer self-contained output. For anything meant to run in a browser, make a single
  index.html that inlines its CSS and JS (or uses only relative-path files that you also emit),
  so it renders with no build step. Do not rely on external network resources or CDNs that
  could be blocked; inline what you can.
- Keep it correct AND minimal — the smallest code that fully meets the request.
- If the user uploads a product to modify, treat their files as the starting point and edit them;
  re-emit only the files you change (plus any new ones).

FIXING:
- When given an error report, find the real root cause and emit corrected files. Do not apologize
  at length; just fix it and re-emit the changed files. Only emit <<<DONE>>> once it truly works.`;

export function systemMessage(): ApiMessage {
  return { role: "system", content: SYSTEM };
}

/** Serialize the current product tree so the model can adjust it. */
export function productContext(files: FileTree): string | null {
  const paths = Object.keys(files);
  if (paths.length === 0) return null;
  const parts = [
    `CURRENT PRODUCT (${paths.length} file${paths.length === 1 ? "" : "s"}). Adjust these in place:`,
  ];
  for (const p of paths.sort()) {
    parts.push(`<<<FILE ${p}>>>\n${files[p]}\n<<<ENDFILE>>>`);
  }
  return parts.join("\n\n");
}

/** Serialize uploaded files as readable context. */
export function attachmentsContext(attachments: UploadedFile[]): string | null {
  if (!attachments || attachments.length === 0) return null;
  const parts: string[] = ["UPLOADED FILES:"];
  for (const a of attachments) {
    if (a.isText && a.text != null) {
      parts.push(`--- ${a.name} (${a.mime || "text"}, ${a.size} bytes) ---\n${a.text}`);
    } else if (a.archiveEntries) {
      parts.push(`--- ${a.name} (archive, expanded) ---`);
      for (const [p, c] of Object.entries(a.archiveEntries)) {
        parts.push(`  [${p}]\n${c}`);
      }
    } else {
      parts.push(
        `--- ${a.name} (${a.mime || "binary"}, ${a.size} bytes) ---\n` +
          `[binary file — not inlined. ${a.note || "Full binary editing requires the execution worker."}]`,
      );
    }
  }
  return parts.join("\n\n");
}

/**
 * Build the message array for a generation/adjustment turn.
 * - history: prior chat (user text + assistant prose notes)
 * - request: the new user request text
 * - product: current file tree (for adjustments/stacking)
 * - attachments: files uploaded with this request
 */
export function buildMessages(opts: {
  history: HistoryMessage[];
  request: string;
  product: FileTree;
  attachments?: UploadedFile[];
}): ApiMessage[] {
  const msgs: ApiMessage[] = [systemMessage()];

  // Compress prior chat into alternating turns (prose only; product is re-sent fresh).
  for (const m of opts.history) {
    if (m.role === "system") continue;
    const content = m.content?.trim();
    if (!content) continue;
    msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content });
  }

  const ctxParts: string[] = [];
  const product = productContext(opts.product);
  if (product) ctxParts.push(product);
  const att = attachmentsContext(opts.attachments || []);
  if (att) ctxParts.push(att);
  ctxParts.push(`REQUEST:\n${opts.request}`);

  msgs.push({ role: "user", content: ctxParts.join("\n\n") });
  return msgs;
}

/** Build the follow-up message that reports runtime errors for the fix loop. */
export function buildFixMessage(errors: string[], product: FileTree): ApiMessage[] {
  const msgs: ApiMessage[] = [systemMessage()];
  const product_ctx = productContext(product);
  if (product_ctx) msgs.push({ role: "user", content: product_ctx });
  msgs.push({
    role: "user",
    content:
      `The current product produced these errors when it ran in the browser preview:\n\n` +
      errors.map((e, i) => `${i + 1}. ${e}`).join("\n") +
      `\n\nFix the ROOT CAUSE and re-emit only the changed files. Emit <<<DONE>>> only once it runs cleanly.`,
  });
  return msgs;
}
