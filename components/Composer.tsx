"use client";

import { useRef, useState } from "react";
import {
  Paperclip,
  ArrowUp,
  Square,
  Layers,
  X,
  Play,
} from "lucide-react";

interface Props {
  running: boolean;
  queue: string[];
  onSend: (text: string, files: File[]) => void;
  onQueue: (text: string) => void;
  onStop: () => void;
  onRemoveQueued: (index: number) => void;
  onRunQueue: () => void;
}

export default function Composer({
  running,
  queue,
  onSend,
  onQueue,
  onStop,
  onRemoveQueued,
  onRunQueue,
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  function send() {
    const t = text.trim();
    if (!t || running) return;
    onSend(t, files);
    setText("");
    setFiles([]);
  }

  function queueIt() {
    const t = text.trim();
    if (!t) return;
    onQueue(t);
    setText("");
  }

  return (
    <div className="border-t border-white/10 bg-[#0c0c12] px-4 py-3">
      {queue.length > 0 && (
        <div className="mx-auto mb-2 max-w-3xl rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-white/60">
              <Layers className="h-3.5 w-3.5" /> Stacked adjustments ({queue.length})
            </div>
            <button
              onClick={onRunQueue}
              disabled={running}
              className="flex items-center gap-1 rounded bg-emerald-600/90 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              <Play className="h-3 w-3" /> Apply all
            </button>
          </div>
          <ol className="space-y-1">
            {queue.map((q, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded bg-black/30 px-2 py-1 text-xs text-white/70"
              >
                <span className="text-white/30">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{q}</span>
                <button
                  onClick={() => onRemoveQueued(i)}
                  className="text-white/30 hover:text-red-400"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {files.length > 0 && (
        <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-white/70"
            >
              <Paperclip className="h-3 w-3" />
              {f.name}
              <button
                onClick={() => setFiles(files.filter((_, x) => x !== i))}
                className="text-white/40 hover:text-red-400"
                aria-label="Remove file"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-white/10 bg-[#14141c] p-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          className="mb-0.5 rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Attach files"
          title="Attach a file to upgrade or modify"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Describe what to build — or attach a file and say how to change it…"
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-white/30"
        />

        <button
          onClick={queueIt}
          disabled={!text.trim() || running}
          title="Add this as a stacked adjustment instead of sending now"
          className="mb-0.5 hidden items-center gap-1 rounded-lg px-2 py-2 text-xs text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30 sm:flex"
        >
          <Layers className="h-4 w-4" /> Stack
        </button>

        {running ? (
          <button
            onClick={onStop}
            className="mb-0.5 grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-white hover:bg-white/25"
            aria-label="Stop"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!text.trim()}
            className="mb-0.5 grid h-9 w-9 place-items-center rounded-lg bg-fuchsia-600 text-white hover:bg-fuchsia-500 disabled:opacity-30"
            aria-label="Send"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
