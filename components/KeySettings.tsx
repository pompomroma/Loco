"use client";

import { useState } from "react";
import {
  KeyRound,
  X,
  Eye,
  EyeOff,
  Trash2,
  ShieldAlert,
  Check,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { useSettings, KEY_HEADER } from "@/lib/settings";

export default function KeySettings({ onClose }: { onClose: () => void }) {
  const savedKey = useSettings((s) => s.apiKey);
  const savedModel = useSettings((s) => s.model);
  const setApiKey = useSettings((s) => s.setApiKey);
  const setModel = useSettings((s) => s.setModel);
  const clearApiKey = useSettings((s) => s.clearApiKey);

  const [draftKey, setDraftKey] = useState(savedKey);
  const [draftModel, setDraftModel] = useState(savedModel);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState<string>("");

  const dirty = draftKey.trim() !== savedKey || draftModel.trim() !== savedModel;

  function save() {
    setApiKey(draftKey);
    setModel(draftModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function loadModels() {
    setLoading(true);
    setLoadMsg("");
    try {
      const headers: Record<string, string> = {};
      const k = (draftKey || savedKey).trim();
      if (k) headers[KEY_HEADER] = k;
      const res = await fetch("/api/models", { headers, cache: "no-store" });
      const json = (await res.json()) as { models?: string[]; error?: string };
      if (!res.ok || !json.models) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setModels(json.models);
      setLoadMsg(
        json.models.length
          ? `${json.models.length} models available — pick one below.`
          : "The endpoint returned no models for this key.",
      );
    } catch (err) {
      setModels([]);
      setLoadMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute right-3 top-14 z-30 w-96 rounded-xl border border-white/10 bg-[#12121a] p-4 shadow-2xl">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <KeyRound className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-semibold leading-tight">NVIDIA API key &amp; model</div>
            <div className="text-xs text-white/50">
              Use your own key — no .env needed
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Close key settings"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="mb-1 block text-xs text-white/50" htmlFor="nvidia-key">
        Key (starts with <span className="mono">nvapi-</span>)
      </label>
      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2">
        <input
          id="nvidia-key"
          type={show ? "text" : "password"}
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="nvapi-…"
          autoComplete="off"
          spellCheck={false}
          className="mono min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-white/25"
        />
        <button
          onClick={() => setShow((v) => !v)}
          className="rounded p-1 text-white/40 hover:text-white"
          aria-label={show ? "Hide key" : "Show key"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-white/50" htmlFor="nvidia-model">
          <Cpu className="h-3.5 w-3.5" /> Model
        </label>
        <button
          onClick={loadModels}
          disabled={loading}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Load models
        </button>
      </div>
      <input
        id="nvidia-model"
        list="nvidia-model-list"
        value={draftModel}
        onChange={(e) => setDraftModel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="server default — or pick/type a slug"
        autoComplete="off"
        spellCheck={false}
        className="mono mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-sm outline-none placeholder:text-white/25"
      />
      <datalist id="nvidia-model-list">
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {loadMsg && (
        <div className="mt-1 text-[11px] leading-snug text-white/50">{loadMsg}</div>
      )}
      {models.length > 0 && (
        <div className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-white/5 bg-black/30">
          {models.slice(0, 40).map((m) => (
            <button
              key={m}
              onClick={() => setDraftModel(m)}
              className={`mono block w-full truncate px-2 py-1 text-left text-[11px] ${
                m === draftModel ? "bg-emerald-600/20 text-emerald-300" : "text-white/60 hover:bg-white/5"
              }`}
              title={m}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
          {saved ? "Saved" : "Save"}
        </button>
        {savedKey && (
          <button
            onClick={() => {
              clearApiKey();
              setDraftKey("");
            }}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove key
          </button>
        )}
        <span className="ml-auto text-xs text-white/40">
          {savedKey ? "Key saved ✓" : "No key saved"}
        </span>
      </div>

      <div className="mt-3 flex gap-2 rounded-lg bg-amber-400/10 p-2 text-[11px] leading-snug text-amber-200/90">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Getting a <b>404</b>? That means the model slug doesn&apos;t exist on the
          endpoint — click <b>Load models</b> and pick a real one. Your key is
          stored only in this browser, sent only to this app&apos;s own server, and
          never logged. Rotate it at build.nvidia.com if it ever leaks.
        </span>
      </div>
    </div>
  );
}
