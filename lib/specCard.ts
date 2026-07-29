// The AI "spec card" is a DISPLAY-ONLY branding panel — a fun stat sheet for the
// assistant persona. It is NOT a hardware measurement.
//
// Why TOPS is branding, not a number we can derive: TOPS (Tera-Operations-Per-
// Second) is a spec of AI accelerator *chips*, not of a language model. A model
// like Claude Opus 5 has no published TOPS, so there is no real value to take
// "twice a digit" of, and an API key is just an auth token you cannot compute
// stats from. So these values are chosen for flavor and are fully editable here.

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
  stats: SpecStat[];
  /** Small print that keeps us honest in the UI. */
  disclaimer: string;
}

export const SPEC_CARD: SpecCard = {
  name: "Loco",
  tagline: "vibe programming co-pilot",
  tops: 20,
  stats: [
    { label: "TOPS", value: "20", hint: "Branding stat — models have no real TOPS (that's a chip metric)." },
    { label: "Languages", value: "∞", hint: "No language whitelist — generates in whatever the task needs." },
    { label: "Workspaces", value: "Unlimited", hint: "Add as many session slots as you like." },
    { label: "Usage cost", value: "$0", hint: "No app-level metering or paywall." },
    { label: "Fix loop", value: "Auto", hint: "Generates, previews, and re-fixes until web checks pass (capped)." },
    { label: "Engine", value: "Nemotron", hint: "Runs on NVIDIA's OpenAI-compatible Nemotron endpoint." },
  ],
  disclaimer:
    "Spec card is cosmetic. TOPS is a hardware-chip metric, not a model property; these numbers are branding, not measurements.",
};
