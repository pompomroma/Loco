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
