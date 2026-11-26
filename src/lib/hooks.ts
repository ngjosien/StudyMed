import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { api, db, type Filter, type Row } from "./api";
import { toast } from "../stores/toast";

/** Rows from a table. Every mutation invalidates all queries, so lists stay in sync. */
export function useRows<T = Row>(table: string, filter?: Filter, order?: string, enabled = true) {
  const q = useQuery({
    queryKey: ["rows", table, filter ?? null, order ?? null],
    queryFn: () => db.list<T>(table, filter, order),
    enabled,
  });
  return { ...q, rows: (q.data ?? []) as T[] };
}

export function useRow<T = Row>(table: string, id: number | null | undefined) {
  return useQuery({
    queryKey: ["row", table, id],
    queryFn: () => db.get<T>(table, id!),
    enabled: id != null,
  });
}

export function useNamed<T = Row>(name: string, params: unknown[] = [], enabled = true) {
  const q = useQuery({
    queryKey: ["named", name, params],
    queryFn: () => db.named<T>(name, params),
    enabled,
  });
  return { ...q, rows: (q.data ?? []) as T[] };
}

/** Run a write, surface errors as a toast, then refresh everything that's on screen. */
export function useMutate() {
  const qc = useQueryClient();
  return useCallback(
    async <T,>(p: Promise<T> | (() => Promise<T>)): Promise<T> => {
      try {
        const r = await (typeof p === "function" ? p() : p);
        await qc.invalidateQueries();
        return r;
      } catch (e) {
        toast.error(String(e));
        throw e;
      }
    },
    [qc],
  );
}

/** Refresh queries when the backend says reminders changed (e.g. one just fired). */
export function useReminderEvents() {
  const qc = useQueryClient();
  useEffect(() => {
    const un = listen("reminders-changed", () => qc.invalidateQueries({ queryKey: ["reminders"] }));
    return () => {
      un.then((f) => f());
    };
  }, [qc]);
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Tag names per entity id for one scope, plus all tag names (for select options). */
export function useTagsBy(entityType: string, scope: string) {
  const assignments = useRows("entity_tags", { entity_type: entityType }).rows;
  const defs = useRows("tags", { scope }, "name").rows;
  return useMemo(() => {
    const names = new Map(defs.map((t) => [t.id as number, t.name as string]));
    const by = new Map<number, string[]>();
    assignments.forEach((r) => {
      const n = names.get(r.tag_id);
      if (n) by.set(r.entity_id, [...(by.get(r.entity_id) ?? []), n]);
    });
    return { by, names: defs.map((t) => t.name as string) };
  }, [assignments, defs]);
}

export function useAppInfo() {
  return useQuery({ queryKey: ["appInfo"], queryFn: api.appInfo, staleTime: Infinity });
}

/** Re-render once a minute so countdowns/“now” lines stay current. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
