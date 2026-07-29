"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";

// User settings that live ONLY in this browser (localStorage). The API key is
// sent per-request to this app's own /api/chat proxy (NVIDIA's API doesn't
// allow direct browser calls), never anywhere else, and never logged.

interface SettingsState {
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: "",
      setApiKey: (key) => set({ apiKey: key.trim() }),
      clearApiKey: () => set({ apiKey: "" }),
    }),
    {
      name: "loco-settings-v1",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : noopStorage,
      ),
    },
  ),
);

/** Header used to carry the user's key to our own proxy route. */
export const KEY_HEADER = "x-nvidia-key";
