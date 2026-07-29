import { getNvidiaConfig } from "@/lib/nvidia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists the model slugs actually available on the NVIDIA endpoint for the
// key in use (user-provided header first, server env fallback), so users can
// pick a real model instead of guessing slugs (a wrong slug = upstream 404).
export async function GET(req: Request) {
  const cfg = getNvidiaConfig();
  const userKey = req.headers.get("x-nvidia-key")?.trim() || "";
  const apiKey = userKey || cfg.apiKey;
  if (!apiKey) {
    return Response.json(
      { error: "No NVIDIA API key available — paste yours in the API key panel first." },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${cfg.baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? " The API key was rejected — check it and try again."
          : "";
      return Response.json(
        { error: `NVIDIA model list failed: HTTP ${res.status}.${hint}` },
        { status: 502 },
      );
    }
    const json = (await res.json()) as { data?: { id?: unknown }[] };
    const ids = (json.data ?? [])
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    // Nemotron models first, then everything else alphabetically.
    ids.sort((a, b) => {
      const an = a.toLowerCase().includes("nemotron") ? 0 : 1;
      const bn = b.toLowerCase().includes("nemotron") ? 0 : 1;
      return an - bn || a.localeCompare(b);
    });
    return Response.json({ models: ids, default: cfg.model });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Could not reach the NVIDIA endpoint: ${message}` },
      { status: 502 },
    );
  }
}
