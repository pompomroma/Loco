# Loco — a web-based AI for vibe programming

Loco turns a natural-language request (optionally with uploaded files) into a
**working** product: games, websites, tools, AI demos — in whatever language the
task needs. It organizes work into **workspaces (session slots)**, lets you
**stack multiple adjustments** onto one product, runs web output in a live
sandboxed preview, and keeps fixing runtime errors until the preview runs clean.

It runs on **NVIDIA's Nemotron** model through the OpenAI-compatible API.

---

## Get your permanent link

A Codespace URL (`…app.github.dev`) is temporary by design: it stops working
when the Codespace sleeps, changes per Codespace, and needs your GitHub login.
For a link that is **always accessible**, deploy once to Vercel (free tier is
fine, ~2 minutes, zero configuration — no env vars are required because users
paste their NVIDIA key in the app itself):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpompomroma%2FLoco)

Or manually: [vercel.com/new](https://vercel.com/new) → **Import** this
repository → **Deploy**. The work branch is the repo's default branch, so the
right code builds automatically. Your permanent URL is the
`https://<project>.vercel.app` address Vercel shows when the build finishes —
it stays up as long as the Vercel project exists, no Codespace needed.

**Fully automated alternative (one secret):** create a token at
[vercel.com/account/settings/tokens](https://vercel.com/account/settings/tokens)
and add it as the `VERCEL_TOKEN` repository secret on GitHub (Settings →
Secrets and variables → Actions). The `Deploy to Vercel` workflow then does
everything on the next push or manual run — creates the Vercel project,
builds, deploys to production, and prints your permanent URL in the run
summary. (`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` secrets are optional — set them
only to pin an existing project.) Until the token exists, the workflow prints
a setup notice and stays green.

Honest note: on Vercel, background jobs are best-effort within serverless time
limits (see the support matrix below) — the Codespace remains the full-power
host, while the Vercel URL is the always-reachable one.

---

## What it does today (MVP)

- **Workspaces / session slots** — add, name, switch, and delete independent
  workspaces. Each keeps its own chat, product, versions, and adjustment queue.
  Everything persists in your browser (localStorage) — no database required.
- **Any-language generation** — no language whitelist; the model emits a complete
  multi-file project.
- **Background generation** — every request runs as a **server-side job**, so
  generation keeps going even if you close the tab, lock your phone, or walk
  away. When you come back, finished work is merged into the workspace
  automatically (chat message, product files, version snapshot). Progress shows
  "Running in background — safe to close this tab" while a job is live.
- **Run-until-it-works loop** — the server statically validates each build
  (JS syntax compile, missing-asset checks) and auto-fixes in capped passes;
  when you're present, the browser additionally runs the product in a hidden
  sandbox and chains a fix round for any runtime errors it catches. Residual
  issues are reported honestly instead of pretending everything works.
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

### Performance defaults (maxed out of the box)

The app ships with every app-side performance lever at its maximum useful
setting: an **8192-token output budget** per turn (with an automatic retry
without the cap if a model's own ceiling is lower — so results are never
artificially truncated), **temperature 0.2** for precise code, **1-second live
progress polling**, and a transient-failure retry in the background runner.
Override via `NVIDIA_MAX_TOKENS` / `NVIDIA_TEMPERATURE` if you want different
behavior.

Two honest notes: the model's raw generation speed and capability are set by
NVIDIA's serving and the model you pick — no app setting can raise them. And
the one real quality↔speed dial, Llama-Nemotron's reasoning mode
(`NVIDIA_REASONING=on|off`), is a trade-off: "on" thinks harder and responds
slower, "off" is fastest. It defaults to the model's own behavior because both
maxima can't be had at once.

### Background jobs: what to expect where

- **Persistent Node server** (GitHub Codespace, VPS, `pnpm start`/`pnpm dev`
  anywhere): full support. Jobs run to completion regardless of the browser;
  finished results are persisted to `data/jobs/` and picked up when you return.
- **Vercel serverless**: best-effort. The jobs route asks the platform to keep
  the instance alive (`after()`, up to `maxDuration` = 300s), but very long jobs
  can be cut off, and results may not survive across instances. The UI detects a
  stalled/vanished job and tells you to resend rather than spinning forever.
- **Your API key is never written to disk.** A job interrupted by a server
  restart cannot resume (the key was memory-only) and is marked accordingly.
- Results are merged into the browser profile that owns the workspace
  (workspaces live in localStorage), so return on the same browser/device.

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

## API key: two ways to provide it

1. **In the app (easiest, no .env needed):** click **API key** in the top bar and
   paste your `nvapi-…` key. It's stored only in your browser (localStorage) and
   sent per-request to this app's own server proxy — never anywhere else, never
   logged. Anyone with the key can spend your NVIDIA quota, so avoid shared
   computers and rotate it at <https://build.nvidia.com> if it ever leaks.
2. **Server-side env var (for a shared deployment):** set `NVIDIA_API_KEY` in
   `.env.local` (locally) or in Vercel's Environment Variables. A key entered in
   the app takes precedence over the env var.

## Run it locally

Requirements: Node 18+ (Node 22 recommended).

```bash
# 1. install
pnpm install        # or: npm install

# 2. start — no key setup required; paste your key in the app's "API key" box.
#    (Optionally: cp .env.example .env.local and set NVIDIA_API_KEY instead.)
pnpm dev
# open http://localhost:3000
```

> **Seeing "Upstream Nemotron request failed: 404"?** The model slug doesn't
> exist on the endpoint. Open the **API key** panel and click **Load models** —
> it fetches the live list your key can access — then pick one and Save. (The
> `NVIDIA_MODEL` env var is only a server-side default; a model picked in-app
> takes precedence.)

---

## Deploy to Vercel (public link)

1. Push this repo to GitHub (already on branch
   `claude/vibe-ai-file-handling-0opc9j`).
2. In Vercel: **Add New → Project → Import** this repository. Framework is
   auto-detected as Next.js; no build settings needed.
3. (Optional) Add **Environment Variables** (Project → Settings → Environment
   Variables) if you want a shared server key so visitors don't need their own:
   - `NVIDIA_API_KEY` = your key
   - `NVIDIA_BASE_URL` = `https://integrate.api.nvidia.com/v1`
   - `NVIDIA_MODEL` = your verified Nemotron slug
   Without these, every visitor pastes their own key via the in-app box.
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
