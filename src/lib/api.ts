import { isMobile } from "./platform";
import { invoke } from "@tauri-apps/api/core";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;
export type Filter = Record<string, unknown>;

export interface AppInfo {
  dataDir: string;
  dbPath: string;
  schemaVersion: number;
  version: string;
}

export interface VaultStatus {
  configured: boolean;
  unlocked: boolean;
  autoLockMin: number;
}

export interface ReminderInput {
  remindAt: string;
  title: string;
  body?: string | null;
}

/** Generic, validated CRUD over the local SQLite database. */
export const db = {
  list: <T = Row>(table: string, filter?: Filter, order?: string, limit?: number) =>
    invoke<T[]>("rows_list", { table, filter: filter ?? null, order: order ?? null, limit: limit ?? null }),
  get: <T = Row>(table: string, id: number) => invoke<T>("row_get", { table, id }),
  insert: <T = Row>(table: string, values: Row) => invoke<T>("row_insert", { table, values }),
  insertMany: (table: string, rows: Row[]) => invoke<Row[]>("rows_insert", { table, rows }),
  update: <T = Row>(table: string, id: number, values: Row) => invoke<T>("row_update", { table, id, values }),
  remove: (table: string, id: number) => invoke<void>("row_delete", { table, id }),
  removeWhere: (table: string, filter: Filter) => invoke<number>("rows_delete_where", { table, filter }),
  reorder: (table: string, ids: number[]) => invoke<void>("rows_reorder", { table, ids }),
  linksSet: (table: string, col: string, id: number, otherIds: number[]) =>
    invoke<void>("links_set", { table, col, id, otherIds }),
  tagsFor: (entityType: string, scope: string) =>
    invoke<{ entity_id: number; tag_id: number; name: string; color: string | null }[]>("entity_tags_list", {
      entityType,
      scope,
    }),
  tagsSet: (entityType: string, entityId: number, scope: string, names: string[]) =>
    invoke<void>("entity_tags_set", { entityType, entityId, scope, names }),
  named: <T = Row>(name: string, params: unknown[] = []) => invoke<T[]>("query_named", { name, params }),
  /** Set or clear (null) a custom property value. */
  valueSet: (database: string, rowId: number, propId: number, value: unknown) =>
    invoke<void>("db_value_set", { database, rowId, propId, value: value ?? null }),
};

export const parseJson = <T = unknown,>(s: unknown, fallback: T): T => {
  if (s === null || s === undefined || s === "") return fallback;
  try {
    return JSON.parse(String(s)) as T;
  } catch {
    return fallback;
  }
};

export const api = {
  settingsGetAll: () => invoke<Record<string, unknown>>("settings_get_all"),
  settingsSet: (key: string, value: unknown) => invoke<void>("settings_set", { key, value }),
  appInfo: () => invoke<AppInfo>("app_info"),

  calendarRange: (start: string, end: string) => invoke<Row[]>("calendar_range", { start, end }),
  search: (query: string, limit = 30) => invoke<Row[]>("search", { query, limit }),

  srsReview: (cardId: number, rating: number) => invoke<Row>("srs_review", { cardId, rating }),
  srsPreview: (cardId: number) => invoke<number[]>("srs_preview", { cardId }),
  srsDue: (deckId?: number | null, moduleId?: number | null) =>
    invoke<Row[]>("srs_due", { deckId: deckId ?? null, moduleId: moduleId ?? null }),

  remindersList: (includeFired: boolean) => invoke<Row[]>("reminders_list", { includeFired }),
  remindersFor: (entityType: string, entityId: number) => invoke<Row[]>("reminders_for", { entityType, entityId }),
  remindersSync: (entityType: string, entityId: number, items: ReminderInput[]) =>
    invoke<void>("reminders_sync", { entityType, entityId, items }),
  reminderCreate: (input: ReminderInput) => invoke<void>("reminder_create", { input }),
  reminderDelete: (id: number) => invoke<void>("reminder_delete", { id }),
  remindersClearFired: () => invoke<void>("reminders_clear_fired"),
  notifyNow: (title: string, body?: string) => invoke<void>("notify_now", { title, body: body ?? null }),

  fileImport: (src: string, subdir: string) => invoke<string>("file_import", { src, subdir }),
  fileSaveBytes: (bytes: Uint8Array, name: string, subdir: string) =>
    invoke<string>("file_save_bytes", bytes, { headers: { "x-name": encodeURIComponent(name), "x-subdir": subdir } }),
  fileDelete: (rel: string) => invoke<void>("file_delete", { rel }),
  fileWriteText: (path: string, content: string) => invoke<void>("file_write_text", { path, content }),
  backupCreate: (dest: string) => invoke<void>("backup_create", { dest }),
  /** The whole database as one file's bytes. */
  backupBytes: () => invoke<ArrayBuffer>("backup_bytes"),
  /** Replace all data with a backup file's bytes (the current data is kept in backups/ first). */
  backupRestore: (bytes: Uint8Array) => invoke<number>("backup_restore", isMobile ? Array.from(bytes) : bytes),

  vaultStatus: () => invoke<VaultStatus>("vault_status"),
  vaultSetup: (password: string, autoLockMin: number) => invoke<void>("vault_setup", { password, autoLockMin }),
  vaultUnlock: (password: string) => invoke<void>("vault_unlock", { password }),
  vaultLock: () => invoke<void>("vault_lock"),
  vaultTouch: () => invoke<boolean>("vault_touch"),
  vaultSetAutoLock: (minutes: number) => invoke<void>("vault_set_auto_lock", { minutes }),
  vaultChangePassword: (oldPassword: string, newPassword: string) =>
    invoke<void>("vault_change_password", { oldPassword, newPassword }),
  vaultEntries: () => invoke<Row[]>("vault_entries_list"),
  vaultEntrySave: (id: number | null, payload: Row) => invoke<number>("vault_entry_save", { id, payload }),
  vaultEntryDelete: (id: number) => invoke<void>("vault_entry_delete", { id }),
  noteLock: (id: number) => invoke<void>("note_lock", { id }),
  noteReadLocked: (id: number) => invoke<string>("note_read_locked", { id }),
  noteSaveLocked: (id: number, body: string) => invoke<void>("note_save_locked", { id, body }),
  noteUnlock: (id: number) => invoke<void>("note_unlock", { id }),
};

export const isVaultLocked = (e: unknown) => String(e).includes("VAULT_LOCKED");
