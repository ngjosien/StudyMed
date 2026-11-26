import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { db, type Row } from "./api";

interface Openable {
  openNew: (defaults?: Row) => void;
  openEdit: (r: Row) => void;
}

/** Open a record's form from ?id= / ?new= (deep links from calendar, search, palette). */
export function useDeepLinkForm(table: string, form: Openable, newDefaults?: () => Row, onOpen?: (r: Row) => void) {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const isNew = params.get("new");
  useEffect(() => {
    if (id) {
      db.get(table, Number(id))
        .then((r) => (onOpen ? onOpen(r) : form.openEdit(r)))
        .catch(() => undefined);
      const next = new URLSearchParams(params);
      next.delete("id");
      setParams(next, { replace: true });
    } else if (isNew) {
      form.openNew(newDefaults?.());
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  }, [id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps
}
