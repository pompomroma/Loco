// The AI "spec card" is a DISPLAY-ONLY branding panel — a fun stat sheet for the
// assistant persona. It is NOT a hardware measurement or a benchmark result.
//
// Why these are branding, not derived numbers: TOPS (Tera-Operations-Per-
// Second) is a spec of AI accelerator *chips*, not of a language model, and a
// real SWE-bench score can only come from actually running that benchmark —
// neither can be computed from an API key or granted by editing this file.
// Every value here is chosen for flavor and is fully editable.

export interface SpecStat {
  label: string;
  value: string;
  hint?: string;
}

export interface SpecCard {
  name: string;
  tagline: string;
  /** Branding stat, editable. Default 20 (a chosen flourish). */
  tops: number;
  /** Branding stat, editable. Shown as a bonus ("+11") to match the TOPS vibe. */
  sweBenchBonus: number;
  stats: SpecStat[];
  /** Small print that keeps us honest in the UI. */
  disclaimer: string;
}

export const SPEC_CARD: SpecCard = {
  name: "Loco",
  tagline: "vibe programming co-pilot",
  tops: 20,
  sweBenchBonus: 11,
  stats: [
    { label: "TOPS", value: "20", hint: "Branding stat — models have no real TOPS (that's a chip metric)." },
    { label: "SWE-bench", value: "+11 pts", hint: "Branding stat — real SWE-bench scores come from running the benchmark, not from a config." },
    { label: "Fix passes", value: "Auto ×3", hint: "Server-side validate-and-fix passes per request, plus a runtime check in your browser." },
    { label: "Background", value: "Always on", hint: "Generation runs server-side and keeps going when you close the tab." },
    { label: "Languages", value: "∞", hint: "No language whitelist — generates in whatever the task needs." },
    { label: "Workspaces", value: "Unlimited", hint: "Add as many session slots as you like." },
    { label: "Usage cost", value: "$0", hint: "No app-level metering or paywall." },
    { label: "Engine", value: "Nemotron", hint: "Runs on NVIDIA's OpenAI-compatible endpoint — pick your model in the API key panel." },
  ],
  disclaimer:
    "Spec card is cosmetic. TOPS is a hardware-chip metric and SWE-bench is a benchmark you have to actually run — these numbers are branding, not measurements.",
};
