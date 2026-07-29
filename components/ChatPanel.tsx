"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/types";
import MessageView from "./MessageView";
import { Wand2 } from "lucide-react";

export default function ChatPanel({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600">
          <Wand2 className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-xl font-semibold">Describe what you want to build</h2>
        <p className="mt-2 max-w-md text-sm text-white/50">
          A playable game, a website, a tool, an AI demo — any language, any stack.
          Attach a file to upgrade or modify it. Loco generates it, runs it, and
          keeps fixing until it works.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-white/40">
          {[
            "Build a playable Snake game",
            "A neon landing page for a coffee app",
            "A Markdown-to-HTML converter tool",
          ].map((s) => (
            <span key={s} className="rounded-full border border-white/10 px-3 py-1">
              {s}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl divide-y divide-white/5">
        {messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
