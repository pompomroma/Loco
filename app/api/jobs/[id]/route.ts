import { getJob, deleteJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full job detail: status, phase, live partial prose, and (when done) the
// result file trees ready to merge into the workspace.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
  return Response.json({ job });
}

// Cancel a running job, or clean up a finished one after its results were merged.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteJob(id);
  if (!ok) return Response.json({ error: "Job not found." }, { status: 404 });
  return Response.json({ ok: true });
}
