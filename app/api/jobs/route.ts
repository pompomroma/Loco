import { after } from "next/server";
import { createJob, listJobs } from "@/lib/jobs";
import { getNvidiaConfig } from "@/lib/nvidia";
import type { FileTree, UploadedFile } from "@/lib/types";
import type { HistoryMessage } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface CreateBody {
  workspaceId: string;
  requests: string[];
  product?: FileTree;
  attachments?: UploadedFile[];
  history?: HistoryMessage[];
}

// Create a background generation job. The job keeps running server-side even
// if the browser tab closes; results are picked up via GET /api/jobs/[id].
export async function POST(req: Request) {
  const cfg = getNvidiaConfig();
  const userKey = req.headers.get("x-nvidia-key")?.trim() || "";
  const apiKey = userKey || cfg.apiKey;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "No NVIDIA API key available. Paste your key in the app's \"API key\" settings (top bar), or set NVIDIA_API_KEY on the server.",
      },
      { status: 503 },
    );
  }

  const userModel = req.headers.get("x-nvidia-model")?.trim() || "";
  if (userModel && !/^[A-Za-z0-9._/-]{1,128}$/.test(userModel)) {
    return Response.json({ error: "Invalid model slug." }, { status: 400 });
  }
  const model = userModel || cfg.model;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.workspaceId || typeof body.workspaceId !== "string") {
    return Response.json({ error: "`workspaceId` is required." }, { status: 400 });
  }
  const requests = (body.requests ?? []).filter(
    (r): r is string => typeof r === "string" && r.trim().length > 0,
  );
  if (requests.length === 0) {
    return Response.json({ error: "`requests` must contain at least one request." }, { status: 400 });
  }

  const job = await createJob({
    workspaceId: body.workspaceId,
    requests,
    product: body.product ?? {},
    attachments: body.attachments ?? [],
    history: (body.history ?? []).filter((m) => m && typeof m.content === "string"),
    apiKey,
    model,
  });

  // On serverless, after() asks the platform to keep the instance alive past
  // the response while the job runs (bounded by maxDuration — see README for
  // the honest limits). On a persistent Node server the job simply runs.
  after(async () => {
    // The runner was already started by createJob's workspace chain; awaiting
    // the chain here keeps the serverless instance alive until it settles.
    const { getJob } = await import("@/lib/jobs");
    for (;;) {
      const j = await getJob(job.id);
      if (!j || j.status === "done" || j.status === "error") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  });

  return Response.json({ job }, { status: 201 });
}

// List jobs for a workspace (status summaries, no file payloads).
export async function GET(req: Request) {
  const workspaceId = new URL(req.url).searchParams.get("workspaceId") ?? "";
  if (!workspaceId) {
    return Response.json({ error: "`workspaceId` query param is required." }, { status: 400 });
  }
  const jobsList = await listJobs(workspaceId);
  return Response.json({ jobs: jobsList });
}
