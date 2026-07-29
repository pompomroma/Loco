import OpenAI from "openai";
import { getNvidiaConfig } from "@/lib/nvidia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
}

// Streaming proxy to NVIDIA's OpenAI-compatible Nemotron endpoint.
// The API key stays on the server and is never returned to the browser.
export async function POST(req: Request) {
  const cfg = getNvidiaConfig();
  if (!cfg.apiKey) {
    return Response.json(
      {
        error:
          "NVIDIA_API_KEY is not configured on the server. Set it in .env.local (local) or in your Vercel project's Environment Variables.",
      },
      { status: 503 },
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "`messages` must be a non-empty array." }, { status: 400 });
  }

  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });

  try {
    const stream = await client.chat.completions.create({
      model: cfg.model,
      messages: body.messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.3,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`\n\n<<<STREAM_ERROR>>> ${message}`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Common cause: wrong NVIDIA_MODEL slug or an invalid/rotated key.
    return Response.json(
      { error: `Upstream Nemotron request failed: ${message}` },
      { status: 502 },
    );
  }
}
