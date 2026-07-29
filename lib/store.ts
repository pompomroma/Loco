"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type {
  ChatMessage,
  FileTree,
  ProductVersion,
  Workspace,
} from "./types";

export function uid(prefix = ""): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

function newWorkspace(name: string): Workspace {
  const now = Date.now();
  return {
    id: uid("ws_"),
    name,
    messages: [],
    files: {},
    kind: "files",
    versions: [],
    queue: [],
    createdAt: now,
    updatedAt: now,
  };
}

interface StoreState {
  workspaces: Record<string, Workspace>;
  order: string[];
  activeId: string | null;

  // workspace lifecycle
  createWorkspace: (name?: string) => string;
  selectWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;

  // messages
  addMessage: (wsId: string, msg: ChatMessage) => void;
  updateMessage: (wsId: string, msgId: string, patch: Partial<ChatMessage>) => void;

  // product
  setProduct: (wsId: string, files: FileTree, kind: "web" | "files") => void;
  snapshotVersion: (wsId: string, label: string) => void;
  restoreVersion: (wsId: string, versionId: string) => void;

  // background job tracking
  setActiveJob: (wsId: string, jobId: string | null, messageId: string | null) => void;

  // stacked request queue
  enqueue: (wsId: string, request: string) => void;
  dequeue: (wsId: string) => string | null;
  removeQueued: (wsId: string, index: number) => void;
  clearQueue: (wsId: string) => void;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      workspaces: {},
      order: [],
      activeId: null,

      createWorkspace: (name) => {
        const ws = newWorkspace(name?.trim() || defaultName(get().order.length));
        set((s) => ({
          workspaces: { ...s.workspaces, [ws.id]: ws },
          order: [...s.order, ws.id],
          activeId: ws.id,
        }));
        return ws.id;
      },

      selectWorkspace: (id) => set({ activeId: id }),

      renameWorkspace: (id, name) =>
        set((s) => {
          const ws = s.workspaces[id];
          if (!ws) return s;
          return {
            workspaces: {
              ...s.workspaces,
              [id]: { ...ws, name: name.trim() || ws.name, updatedAt: Date.now() },
            },
          };
        }),

      deleteWorkspace: (id) =>
        set((s) => {
          if (!s.workspaces[id]) return s;
          const rest = { ...s.workspaces };
          delete rest[id];
          const order = s.order.filter((x) => x !== id);
          const activeId =
            s.activeId === id ? order[order.length - 1] ?? null : s.activeId;
          return { workspaces: rest, order, activeId };
        }),

      addMessage: (wsId, msg) =>
        set((s) => {
          const ws = s.workspaces[wsId];
          if (!ws) return s;
          return {
            workspaces: {
              ...s.workspaces,
              [wsId]: {
                ...ws,
                messages: [...ws.messages, msg],
                updatedAt: Date.now(),
              },
            },
          };
        }),

      updateMessage: (wsId, msgId, patch) =>
        set((s) => {
          const ws = s.workspaces[wsId];
          if (!ws) return s;
          return {
            workspaces: {
              ...s.workspaces,
              [wsId]: {
                ...ws,
                messages: ws.messages.map((m) =>
                  m.id === msgId ? { ...m, ...patch } : m,
                ),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      setProduct: (wsId, files, kind) =>
        set((s) => {
          const ws = s.workspaces[wsId];
          if (!ws) return s;
          return {
            workspaces: {
              ...s.workspaces,
              [wsId]: { ...ws, files, kind, updatedAt: Date.now() },
            },
          };
        }),

      snapshotVersion: (wsId, label) =>
        set((s) => {
          const ws = s.workspaces[wsId];
          if (!ws || Object.keys(ws.files).length === 0) return s;
          const version: ProductVersion = {
            id: uid("v_"),
            label,
            files: { ...ws.files },
            kind: ws.kind,
            createdAt: Date.now(),
          };
          // Keep only the most recent versions so localStorage stays healthy.
          const versions = [...ws.versions, version].slice(-12);
          return {
            workspaces: {
              ...s.workspaces,
              [wsId]: { ...ws, versions },
            },
          };
        }),

      restoreVersion: (wsId, versionId) =>
        set((s) => {
          const ws = s.workspaces[wsId];
          if (!ws) return s;
          const v = ws.versions.find((x) => x.id === versionId);
          if (!v) return s;
          return {
            workspaces: {
              ...s.workspaces,
              [wsId]: {
                ...ws,
                files: { ...v.files },
                kind: v.kind,
                updatedAt: Date.now(),
              },
            },
          };
        }),

      setActiveJob: (wsId, jobId, messageId) =>
        set((s) => {
          const ws = s.workspaces[wsId];
          if (!ws) return s;
          return {
            workspaces: {
              ...s.workspaces,
              [wsId]: {
                ...ws,
                activeJobId: jobId,
                activeJobMessageId: messageId,
                updatedAt: Date.now(),
              },
            },
          };
        }),

      enqueue: (wsId, request) =>
        set((s) => {
          const ws = s.workspaces[wsId];
          if (!ws || !request.trim()) return s;
          return {
            workspaces: {
              ...s.workspaces,
              [wsId]: { ...ws, queue: [...ws.queue, request.trim()] },
            },
          };
        }),

      dequeue: (wsId) => {
        const ws = get().workspaces[wsId];
        if (!ws || ws.queue.length === 0) return null;
        const [first, ...rest] = ws.queue;
        set((s) => ({
          workspaces: {
            ...s.workspaces,
            [wsId]: { ...s.workspaces[wsId], queue: rest },
          },
        }));
        return first;
      },

      removeQueued: (wsId, index) =>
        set((s) => {
          const ws = s.workspaces[wsId];
          if (!ws) return s;
          return {
            workspaces: {
              ...s.workspaces,
              [wsId]: { ...ws, queue: ws.queue.filter((_, i) => i !== index) },
            },
          };
        }),

      clearQueue: (wsId) =>
        set((s) => {
          const ws = s.workspaces[wsId];
          if (!ws) return s;
          return {
            workspaces: { ...s.workspaces, [wsId]: { ...ws, queue: [] } },
          };
        }),
    }),
    {
      name: "loco-store-v1",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : noopStorage,
      ),
      partialize: (s) => ({
        workspaces: s.workspaces,
        order: s.order,
        activeId: s.activeId,
      }),
    },
  ),
);

function defaultName(n: number): string {
  return `Workspace ${n + 1}`;
}
