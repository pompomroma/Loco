"use client";

import { Cpu, X, Info } from "lucide-react";
import { SPEC_CARD } from "@/lib/specCard";

export default function SpecCard({ onClose }: { onClose: () => void }) {
  const c = SPEC_CARD;
  return (
    <div className="absolute right-3 top-14 z-30 w-80 rounded-xl border border-white/10 bg-[#12121a] p-4 shadow-2xl">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600">
            <Cpu className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-semibold leading-tight">{c.name}</div>
            <div className="text-xs text-white/50">{c.tagline}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Close spec card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {c.stats.map((s) => (
          <div
            key={s.label}
            title={s.hint}
            className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
          >
            <div className="text-[10px] uppercase tracking-wide text-white/40">
              {s.label}
            </div>
            <div className="mono text-lg font-semibold text-fuchsia-300">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2 rounded-lg bg-amber-400/10 p-2 text-[11px] leading-snug text-amber-200/90">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{c.disclaimer}</span>
      </div>
    </div>
  );
}
