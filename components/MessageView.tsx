"use client";

import { Loader2, User, Sparkles, Paperclip, AlertTriangle } from "lucide-react";
import type { ChatMessage } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  streaming: "Generating…",
  building: "Running preview…",
  fixing: "Fixing errors…",
};

export default function MessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const busy =
    message.status === "streaming" ||
    message.status === "building" ||
    message.status === "fixing";

  return (
    <div className="flex gap-3 px-4 py-3">
      <div
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
          isUser ? "bg-white/10" : "bg-gradient-to-br from-fuchsia-500 to-violet-600"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white/70" />
        ) : (
          <Sparkles className="h-4 w-4 text-white" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-medium text-white/40">
          {isUser ? "You" : "Loco"}
        </div>

        {message.content && (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
            {message.content}
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-white/60"
                title={a.note}
              >
                <Paperclip className="h-3 w-3" />
                {a.name}
              </span>
            ))}
          </div>
        )}

        {busy && (
          <div className="mt-2 flex items-center gap-2 text-xs text-fuchsia-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {message.statusDetail || STATUS_LABEL[message.status!] || "Working…"}
          </div>
        )}

        {message.status === "error" && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message.statusDetail || "Something went wrong."}</span>
          </div>
        )}

        {message.status === "done" && message.statusDetail && (
          <div className="mt-2 text-xs text-white/45">{message.statusDetail}</div>
        )}
      </div>
    </div>
  );
}
