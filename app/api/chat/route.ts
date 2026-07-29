import OpenAI from "openai";
import { getNvidiaConfig, getGenParams, reasoningSystemLine } from "@/lib/nvidia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
}

// Streaming proxy to NVIDIA's OpenAI-compatible Nemotron endpoint.
// Key resolution: a per-request user key (entered in the in-app settings box,
// carried in the x-nvidia-key header) takes precedence; the server env var is
// the fallback. Neither is ever logged or echoed back to the browser.
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

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "`messages` must be a non-empty array." }, { status: 400 });
  }

  // Optional per-user model override (chosen in the in-app settings panel).
  const userModel = req.headers.get("x-nvidia-model")?.trim() || "";
  if (userModel && !/^[A-Za-z0-9._/-]{1,128}$/.test(userModel)) {
    return Response.json({ error: "Invalid model slug." }, { status: 400 });
  }
  const model = userModel || cfg.model;

  const client = new OpenAI({ apiKey, baseURL: cfg.baseURL });
  const gen = getGenParams();
  const messages = gen.reasoning
    ? [
        { role: "system" as const, content: reasoningSystemLine(gen.reasoning) },
        ...body.messages,
      ]
    : body.messages;

  try {
    let stream;
    try {
      stream = await client.chat.completions.create({
        model,
        messages,
        temperature:
          typeof body.temperature === "number" ? body.temperature : gen.temperature,
        max_tokens: gen.maxTokens,
        stream: true,
      });
    } catch (err: unknown) {
      // If this model's output ceiling is below our budget, retry without
      // max_tokens so the model's own maximum applies.
      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : String(err);
      if (status === 400 && /max_?tokens|maximum.*tokens|length/i.test(msg)) {
        stream = await client.chat.completions.create({
          model,
          messages,
          temperature:
            typeof body.temperature === "number" ? body.temperature : gen.temperature,
          stream: true,
        });
      } else {
        throw err;
      }
    }

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
    const status = (err as { status?: number })?.status;
    // Map the common upstream failures to something the user can act on.
    let hint = "";
    if (status === 404) {
      hint =
        ` The model "${model}" was not found on this endpoint — open the API key panel, ` +
        `click "Load models", and pick one from the list.`;
    } else if (status === 401 || status === 403) {
      hint = " The API key was rejected — re-paste or rotate it in the API key panel.";
    } else if (status === 429) {
      hint = " Rate limit or quota exceeded for this key — wait a bit or use another key.";
    }
    return Response.json(
      { error: `Upstream Nemotron request failed: ${message}.${hint}` },
      { status: 502 },
    );
  }
}
