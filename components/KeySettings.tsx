"use client";

import { useState } from "react";
import { KeyRound, X, Eye, EyeOff, Trash2, ShieldAlert, Check } from "lucide-react";
import { useSettings } from "@/lib/settings";

export default function KeySettings({ onClose }: { onClose: () => void }) {
  const savedKey = useSettings((s) => s.apiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const clearApiKey = useSettings((s) => s.clearApiKey);

  const [draft, setDraft] = useState(savedKey);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  function save() {
    setApiKey(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="absolute right-3 top-14 z-30 w-96 rounded-xl border border-white/10 bg-[#12121a] p-4 shadow-2xl">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <KeyRound className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-semibold leading-tight">NVIDIA API key</div>
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={save}
          disabled={!draft.trim() || draft.trim() === savedKey}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
          {saved ? "Saved" : "Save key"}
        </button>
        {savedKey && (
          <button
            onClick={() => {
              clearApiKey();
              setDraft("");
            }}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
        <span className="ml-auto text-xs text-white/40">
          {savedKey ? "Key saved ✓" : "No key saved"}
        </span>
      </div>

      <div className="mt-3 flex gap-2 rounded-lg bg-amber-400/10 p-2 text-[11px] leading-snug text-amber-200/90">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Stored only in this browser (localStorage) and sent only to this app&apos;s
          own server to call NVIDIA — never anywhere else, never logged. Anyone
          with the key can spend your NVIDIA quota, so avoid shared computers and
          rotate the key if it ever leaks. Get or rotate keys at build.nvidia.com.
        </span>
      </div>
    </div>
  );
}
