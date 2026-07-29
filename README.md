# Loco — a web-based AI for vibe programming

Loco turns a natural-language request (optionally with uploaded files) into a
**working** product: games, websites, tools, AI demos — in whatever language the
task needs. It organizes work into **workspaces (session slots)**, lets you
**stack multiple adjustments** onto one product, runs web output in a live
sandboxed preview, and keeps fixing runtime errors until the preview runs clean.

It runs on **NVIDIA's Nemotron** model through the OpenAI-compatible API.

---

## What it does today (MVP)

- **Workspaces / session slots** — add, name, switch, and delete independent
  workspaces. Each keeps its own chat, product, versions, and adjustment queue.
  Everything persists in your browser (localStorage) — no database required.
- **Any-language generation** — no language whitelist; the model emits a complete
  multi-file project.
- **Run-until-it-works loop** — for browser products, Loco renders the result in a
  hidden sandbox, catches runtime/console errors, and feeds them back for an
  automatic fix pass (capped, so it never loops forever). Residual issues are
  reported honestly instead of pretending everything works.
- **Stacked adjustments** — queue several change requests and apply them in order
  to the same product; every successful build is snapshotted as a version.
- **Upload to modify** — attach files (including `.zip` source archives, which are
  expanded) and ask Loco to upgrade/redesign them.
- **Deliverables** — download any product as a `.zip` (or individual files); web
  products also get a live preview + "open in new tab".
- **Spec card** — a cosmetic stat panel for the AI persona (see the honest note in
  the app: "TOPS" is a hardware-chip metric, not a model property).
- **No in-app usage limits or paywall.** Upstream Nemotron usage is billed to the
  server's API key.

### Honest scope / not-yet

Some originally requested features rest on category errors or need a separate
execution service; they are handled honestly rather than faked:

- **Modifying compiled `.exe` / `.gba` binaries** and **arbitrary "any format →
  any format"** conversion (e.g. `.ini` → `.exe`) require a separate always-on
  **execution worker** (Docker + Python tooling). Vercel's serverless runtime
  can't run Docker, so these degrade gracefully with a clear notice until the
  worker is deployed. Full edit/rebuild works today for **source projects and
  `.zip` archives**.
- The fix loop can execute and validate **browser** products in-app. Running
  arbitrary **backend** code (Python/Go/Rust servers, etc.) also needs the worker.

---

## Run it locally

Requirements: Node 18+ (Node 22 recommended).

```bash
# 1. install
pnpm install        # or: npm install

# 2. configure your key (this file is gitignored — never commit it)
cp .env.example .env.local
#   then edit .env.local and set:
#     NVIDIA_API_KEY=nvapi-...           # your key from https://build.nvidia.com
#     NVIDIA_MODEL=...                   # verify the exact Nemotron slug in the catalog

# 3. start
pnpm dev
# open http://localhost:3000
```

> **Verify the model slug.** `NVIDIA_MODEL` defaults to
> `nvidia/llama-3.1-nemotron-ultra-253b-v1`. Confirm the exact id you want at
> <https://build.nvidia.com/models> — slugs change between releases, and a wrong
> slug shows up as an "Upstream Nemotron request failed" error.

---

## Deploy to Vercel (public link)

1. Push this repo to GitHub (already on branch
   `claude/vibe-ai-file-handling-0opc9j`).
2. In Vercel: **Add New → Project → Import** this repository. Framework is
   auto-detected as Next.js; no build settings needed.
3. Add **Environment Variables** (Project → Settings → Environment Variables):
   - `NVIDIA_API_KEY` = your key
   - `NVIDIA_BASE_URL` = `https://integrate.api.nvidia.com/v1`
   - `NVIDIA_MODEL` = your verified Nemotron slug
4. **Deploy.** Vercel gives you a public `https://<project>.vercel.app` URL — that
   is your shareable "full AI access" link.

The key lives only in Vercel's encrypted env vars and is used server-side by
`app/api/chat/route.ts`; it is never sent to the browser.

### Optional: execution worker

To enable Docker-sandboxed backend execution and the file/format/binary tooling,
run a separate always-on host (a small VPS/container host) and set
`EXECUTION_WORKER_URL` in Vercel to its URL. Without it, those features show an
honest "needs execution worker" notice. (The worker service is not part of this
MVP.)

---

## Security

- **Never commit secrets.** `.env*` is gitignored; only `.env.example` (names, no
  values) is tracked.
- If an API key was ever shared in plaintext (chat, screenshot, commit), **rotate
  it** in the NVIDIA console.
- The live preview runs generated code in a sandboxed `iframe`. Because previews
  use `allow-same-origin` so apps can use `localStorage`/canvas, treat the preview
  as running **your own** generated code in your own session — don't paste in
  code you don't trust.

---

## How it works

```
Browser (Next.js client)
  ├─ Zustand store (workspaces, chat, product, versions, queue) → localStorage
  ├─ Agent loop (lib/agent.ts): stream → parse file ops → preview → collect errors → fix
  ├─ Preview assembler (lib/preview.ts): inline assets + error probe → sandboxed iframe
  └─ fetch('/api/chat')  ── streaming ──▶  Next.js route (server)
                                              └─ OpenAI SDK → NVIDIA Nemotron (key from env)
```

- **File protocol** (`lib/protocol.ts`): the model emits files as
  `<<<FILE path>>> … <<<ENDFILE>>>`, deletions as `<<<DELETE path>>>`, and
  `<<<DONE>>>` when complete. Reasoning `<think>…</think>` blocks are stripped.
- **Spec card** (`lib/specCard.ts`): edit the branding stats here.
