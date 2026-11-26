import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "error" | "success" | "info";
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push(kind: Toast["kind"], text: string): void;
  dismiss(id: number): void;
}

let seq = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(kind, text) {
    const id = seq++;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === "error" ? 7000 : 3000);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  error: (t: string) => useToasts.getState().push("error", t.replace(/^Error:\s*/, "")),
  success: (t: string) => useToasts.getState().push("success", t),
  info: (t: string) => useToasts.getState().push("info", t),
};
