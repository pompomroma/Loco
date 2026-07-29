// Server-only NVIDIA (OpenAI-compatible) configuration helper.
// Never import this from a client component — it reads secret env vars.

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

export interface NvidiaConfig {
  apiKey: string | undefined;
  baseURL: string;
  model: string;
}

export function getNvidiaConfig(): NvidiaConfig {
  return {
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: process.env.NVIDIA_BASE_URL || DEFAULT_BASE_URL,
    model: process.env.NVIDIA_MODEL || DEFAULT_MODEL,
  };
}

export function isConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}

// ---------------------------------------------------------------------------
// Generation parameters — the app-side performance levers, maxed by default.
// The model's raw speed/intelligence belong to NVIDIA's serving; what we
// control is not artificially capping it: a high max_tokens prevents silent
// truncation of large multi-file products (many endpoints default to 1-2k),
// and a low temperature keeps code generation precise.
// ---------------------------------------------------------------------------

export interface GenParams {
  /** Requested output budget. If a model's ceiling is lower, callers retry
   *  once without it so the model's own maximum applies. */
  maxTokens: number;
  temperature: number;
  /** Llama-Nemotron reasoning toggle: "on" | "off" | null (model default).
   *  The one real intelligence-vs-speed trade-off — left to the operator. */
  reasoning: "on" | "off" | null;
}

export function getGenParams(): GenParams {
  const maxTokens = Number(process.env.NVIDIA_MAX_TOKENS) || 8192;
  const temperature = Number(process.env.NVIDIA_TEMPERATURE);
  const reasoningRaw = (process.env.NVIDIA_REASONING || "").toLowerCase();
  return {
    maxTokens: Math.max(256, maxTokens),
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    reasoning: reasoningRaw === "on" ? "on" : reasoningRaw === "off" ? "off" : null,
  };
}

/** The Llama-Nemotron convention system line for the reasoning toggle. */
export function reasoningSystemLine(reasoning: "on" | "off"): string {
  return `detailed thinking ${reasoning}`;
}
