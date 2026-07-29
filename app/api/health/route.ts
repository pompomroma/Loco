import { getNvidiaConfig, isConfigured } from "@/lib/nvidia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports whether the server can talk to Nemotron, without ever leaking the key.
export async function GET() {
  const cfg = getNvidiaConfig();
  return Response.json({
    ok: isConfigured(),
    model: cfg.model,
    baseURL: cfg.baseURL,
    hasWorker: Boolean(process.env.EXECUTION_WORKER_URL),
  });
}
