// The study garden. Plant seeds on the island; your study time (focus sessions and
// logged study) grows the plant first in line. Stop whenever you like: a plant keeps
// its progress and carries on next session. Laurels buy decorations and more land.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, Lock, MoveRight, RotateCw, Shovel, Sprout, Timer, Undo2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { fmtDate } from "../../lib/dates";
import { cx, fmtMinutes } from "../../lib/format";
import { useSetting } from "../../stores/ui";
import { toast } from "../../stores/toast";
import { focusMs, useFocusRun, useTick } from "../../lib/focus";
import { Button, Card, ConfirmDelete, MilestoneBar, Page, PageHeader, Segmented } from "../../components/ui";
import { Beats, useBeats } from "../../components/beats";
import { COLS, DECOR, decorById, expandCost, MAX_ROWS, MIN_ROWS, SPECIES, speciesById, STAGE_NAMES, stageOf } from "./catalog";
import type { Cell } from "./scene";

const m = (n: number) => fmtMinutes(Math.round(n)) || "0m";

/** Pictures of each plant and decoration, rendered from the 3D models once per session. */
let thumbCache: Record<string, string> | null = null;
let thumbJob: Promise<Record<string, string>> | null = null;
export function useThumbs() {
  const [t, setT] = useState<Record<string, string>>(thumbCache ?? {});
  useEffect(() => {
    if (thumbCache) return;
    thumbJob ??= import("./scene").then((s) => s.renderThumbs());
    let alive = true;
    thumbJob
      .then((r) => {
        thumbCache = r;
        if (alive) setT(r);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return t;
}
export function Thumb({ src, size = 40, className }: { src?: string; size?: number; className?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(180deg,#e3f4ff,#f4f9e8)]", className)} style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" className="h-full w-full object-contain" draggable={false} /> : <Sprout size={size * 0.4} className="text-[#6aa84f]" />}
    </span>
  );
}

/** The 3D view is loaded only when the garden is opened. */
function Island({ cols, rows, cells, selected, onPick }: { cols: number; rows: number; cells: Cell[]; selected: number | null; onPick: (p: number | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<import("./scene").GardenScene | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ cols, rows, cells, selected });
  latest.current = { cols, rows, cells, selected };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import("./scene")
      .then(({ GardenScene }) => {
        if (!alive || !host.current) return;
        try {
          const s = new GardenScene(host.current, (p) => pick.current(p));
          const l = latest.current;
          s.setSize(l.cols, l.rows);
          s.setCells(l.cells);
          s.setSelected(l.selected);
          scene.current = s;
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      alive = false;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => scene.current?.setSize(cols, rows), [cols, rows]);
  useEffect(() => scene.current?.setCells(cells), [cells]);
  useEffect(() => scene.current?.setSelected(selected), [selected]);

  return (
    <div ref={host} className="absolute inset-0">
      {failed && <p className="p-10 text-center text-sm text-muted">The 3D garden couldn't start on this computer (WebGL is unavailable).</p>}
    </div>
  );
}

export default function GardenPage() {
  const mutate = useMutate();
  const plants = useRows("garden_plants", undefined, "queue, id").rows;
  const decor = useRows("garden_decor", undefined, "id").rows;
  const { balance } = useBeats();
  const [rows, setRows] = useSetting<number>("garden.rows", MIN_ROWS);
  const [selected, setSelected] = useState<number | null>(null);
  const [moving, setMoving] = useState<{ kind: "plant" | "decor"; id: number } | null>(null);
  const [tab, setTab] = useState<"seeds" | "decor">("seeds");
  const thumbs = useThumbs();

  // A focus session on a module counts toward the growing plant live.
  const run = useFocusRun();
  const now = useTick(!!run && run.endedAt == null && run.kind === "academic");
  const live = run && run.kind === "academic" && run.moduleId ? Math.floor(focusMs(run, now) / 60_000) : 0;

  const growingPlant = plants.find((p) => !p.grown_at) ?? null;
  const queue = plants.filter((p) => !p.grown_at);
  const grown = plants.filter((p) => p.grown_at);
  const at = useMemo(() => {
    const map = new Map<number, { kind: "plant" | "decor"; row: Row }>();
    plants.forEach((p) => map.set(p.plot, { kind: "plant", row: p }));
    decor.forEach((d) => map.set(d.plot, { kind: "decor", row: d }));
    return map;
  }, [plants, decor]);
  const progressOf = (p: Row) => Math.min(1, (Number(p.minutes) + (growingPlant?.id === p.id ? live : 0)) / Number(p.need_minutes));

  const cells: Cell[] = useMemo(
    () => [
      ...plants.map((p) => {
        const g = progressOf(p);
        return {
          key: `p${p.id}:${p.species}:${Math.round(g * 40)}`,
          plot: p.plot,
          kind: "plant" as const,
          species: p.species,
          g,
          seed: p.id * 31 + 7,
          growing: growingPlant?.id === p.id,
        };
      }),
      ...decor.map((d) => ({ key: `d${d.id}:${d.kind}:${d.rot}`, plot: d.plot, kind: "decor" as const, decor: d.kind, rot: d.rot, seed: d.id * 17 + 3 })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plants, decor, live, growingPlant?.id],
  );

  const plots = COLS * rows;
  const sel = selected != null ? at.get(selected) : undefined;

  const pickPlot = async (p: number | null) => {
    if (moving && p != null && !at.has(p)) {
      await mutate(db.update(moving.kind === "plant" ? "garden_plants" : "garden_decor", moving.id, { plot: p }));
      setMoving(null);
      setSelected(p);
      return;
    }
    setMoving(null);
    setSelected(p);
  };

  const plant = async (speciesId: string) => {
    if (selected == null) return;
    const s = speciesById.get(speciesId)!;
    const maxQ = plants.reduce((q, p) => Math.max(q, Number(p.queue)), 0);
    await mutate(db.insert("garden_plants", { species: s.id, plot: selected, need_minutes: s.minutes, queue: maxQ + 1 }));
    toast.success(growingPlant ? `${s.name} planted. It grows after the plants ahead of it.` : `${s.name} planted. Study to make it grow.`);
  };
  const place = async (kind: string) => {
    if (selected == null) return;
    const d = decorById.get(kind)!;
    if (balance < d.cost) return toast.error(`You need ${d.cost - balance} more laurels`);
    await mutate(async () => {
      const row = await db.insert("garden_decor", { kind, plot: selected });
      await db.insert("beats", { amount: -d.cost, reason: `Garden · ${d.name}`, source_type: "garden", source_id: row.id });
    });
  };
  const growNext = (p: Row) => {
    const minQ = plants.reduce((q, x) => Math.min(q, Number(x.queue)), 0);
    return mutate(db.update("garden_plants", p.id, { queue: minQ - 1 }));
  };
  const removeDecor = (d: Row) =>
    mutate(async () => {
      await db.remove("garden_decor", d.id);
      await db.removeWhere("beats", { source_type: "garden", source_id: d.id });
    });
  const expand = async () => {
    const cost = expandCost(rows);
    if (balance < cost) return toast.error(`You need ${cost - balance} more laurels`);
    await mutate(db.insert("beats", { amount: -cost, reason: `Garden · more land (row ${rows + 1})`, source_type: "garden_land", source_id: rows + 1 }));
    setRows(rows + 1);
    toast.success("Your garden grew by a row of plots");
  };

  const totalGrownMinutes = plants.reduce((s, p) => s + Number(p.minutes), 0);
  const counts = new Map<string, number>();
  grown.forEach((p) => counts.set(p.species, (counts.get(p.species) ?? 0) + 1));

  return (
    <>
      <PageHeader
        title="Garden"
        icon={Sprout}
        subtitle="Plant a seed, then study to grow it. Stop any time; it keeps growing next session."
        actions={
          <span className="flex items-center gap-3 text-sm">
            <Beats n={balance} />
            <Link to="/focus" className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
              <Timer size={15} /> Study now
            </Link>
          </span>
        }
      />
      <Page className="pt-2">
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
          <div className="glass relative h-[min(68vh,720px)] min-h-[460px] overflow-hidden rounded-[22px]" style={{ background: "linear-gradient(180deg, #bfe6ff 0%, #dff3ff 45%, #fff6dc 100%)" }}>
            <Island cols={COLS} rows={rows} cells={cells} selected={selected} onPick={pickPlot} />
            {growingPlant && (
              <div className="pointer-events-none absolute top-3 left-3 rounded-2xl bg-white/75 px-3.5 py-2 text-[#2d3a2a] shadow-lg backdrop-blur">
                <p className="text-[10px] font-semibold tracking-widest uppercase opacity-60">{live ? "Growing while you focus" : "Growing now"}</p>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Thumb src={thumbs[`plant:${growingPlant.species}`]} size={26} className="!rounded-lg" />
                  {speciesById.get(growingPlant.species)?.name}
                </p>
                <p className="text-xs opacity-70">
                  {m(Number(growingPlant.minutes) + live)} of {m(growingPlant.need_minutes)}
                </p>
              </div>
            )}
            {moving && (
              <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-[#2d3a2a] shadow">
                <MoveRight size={13} /> Click an empty plot to move it
                <button type="button" className="underline" onClick={() => setMoving(null)}>
                  Cancel
                </button>
              </div>
            )}
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/60 px-3 py-1 text-[11px] text-[#2d3a2a]/80 backdrop-blur">
              Drag to turn · scroll to zoom · click a plot
            </p>
          </div>

          <div className="space-y-4">
            {selected != null && selected < plots ? (
              <Card className="p-5">
                {!sel && (
                  <>
                    <div className="mb-3 flex items-center gap-2">
                      <h2 className="flex-1 font-semibold">Empty plot</h2>
                      <Segmented<"seeds" | "decor">
                        value={tab}
                        onChange={setTab}
                        options={[
                          { value: "seeds", label: "Seeds" },
                          { value: "decor", label: "Decorate" },
                        ]}
                      />
                    </div>
                    {tab === "seeds" ? (
                      <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
                        {SPECIES.map((s) => {
                          const locked = grown.length < s.unlock;
                          return (
                            <button
                              type="button"
                              key={s.id}
                              disabled={locked}
                              onClick={() => plant(s.id)}
                              className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left hover:bg-surface-2 disabled:opacity-45 disabled:hover:bg-transparent"
                            >
                              {locked ? (
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                                  <Lock size={15} className="text-muted" />
                                </span>
                              ) : (
                                <Thumb src={thumbs[`plant:${s.id}`]} size={48} />
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="flex items-baseline gap-2">
                                  <span className="font-medium">{s.name}</span>
                                  <span className="ml-auto shrink-0 text-xs text-muted">{m(s.minutes)}</span>
                                </span>
                                <span className="block text-xs text-muted">{locked ? `Grow ${s.unlock - grown.length} more plant${s.unlock - grown.length > 1 ? "s" : ""} to unlock` : s.blurb}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid max-h-[52vh] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                        {DECOR.map((d) => (
                          <button
                            type="button"
                            key={d.id}
                            disabled={balance < d.cost}
                            onClick={() => place(d.id)}
                            className="flex flex-col items-start rounded-2xl border border-line px-3 py-2.5 text-left hover:bg-surface-2 disabled:opacity-45"
                          >
                            <Thumb src={thumbs[`decor:${d.id}`]} size={56} className="mb-1" />
                            <span className="text-sm font-medium">{d.name}</span>
                            <Beats n={d.cost} unit={false} className="text-xs" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {sel?.kind === "plant" && <PlantPanel thumb={thumbs[`plant:${sel.row.species}`]} p={sel.row} progress={progressOf(sel.row)} live={growingPlant?.id === sel.row.id ? live : 0} position={queue.findIndex((q) => q.id === sel.row.id)} onGrowNext={growNext} onMove={() => setMoving({ kind: "plant", id: sel.row.id })} />}
                {sel?.kind === "decor" && (
                  <div>
                    <p className="eyebrow !text-[9.5px]">Decoration</p>
                    <h2 className="font-display flex items-center gap-3 text-xl">
                      <Thumb src={thumbs[`decor:${sel.row.kind}`]} size={52} />
                      {decorById.get(sel.row.kind)?.name}
                    </h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" icon={RotateCw} onClick={() => mutate(db.update("garden_decor", sel.row.id, { rot: (Number(sel.row.rot) + 1) % 4 }))}>
                        Turn
                      </Button>
                      <Button size="sm" icon={ArrowRightLeft} onClick={() => setMoving({ kind: "decor", id: sel.row.id })}>
                        Move
                      </Button>
                      <Button size="sm" variant="ghost" icon={Undo2} onClick={() => removeDecor(sel.row)}>
                        Put away (refund)
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-5">
                <p className="eyebrow !text-[9.5px]">Growing now</p>
                {growingPlant ? (
                  <>
                    <h2 className="font-display mt-1 flex items-center gap-3 text-xl">
                      <Thumb src={thumbs[`plant:${growingPlant.species}`]} size={52} />
                      {speciesById.get(growingPlant.species)?.name}
                    </h2>
                    <MilestoneBar className="mt-3" value={Number(growingPlant.minutes) + live} max={Number(growingPlant.need_minutes)} color="#7cc152" label="Growth" />
                    <p className="mt-2 text-sm text-muted">
                      {m(Math.max(0, Number(growingPlant.need_minutes) - Number(growingPlant.minutes) - live))} more study to bloom · {STAGE_NAMES[stageOf(progressOf(growingPlant))]}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">Nothing growing. Click an empty plot on the island and pick a seed.</p>
                )}
                {queue.length > 1 && (
                  <div className="mt-4">
                    <p className="eyebrow mb-1 !text-[9.5px]">Up next</p>
                    {queue.slice(1, 6).map((p, i) => (
                      <button type="button" key={p.id} onClick={() => setSelected(p.plot)} className="flex w-full items-center gap-2 rounded-xl px-1.5 py-1 text-left text-sm hover:bg-surface-2">
                        <span className="w-4 text-xs text-muted">{i + 2}</span>
                        <Thumb src={thumbs[`plant:${p.species}`]} size={26} className="!rounded-lg" />
                        <span className="flex-1">{speciesById.get(p.species)?.name}</span>
                        <span className="text-xs text-muted">
                          {m(p.minutes)} / {m(p.need_minutes)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-4 text-xs text-muted">Every minute of study grows it: focus sessions on a module and time you log under Routine. When it blooms, extra minutes move on to the next plant.</p>
              </Card>
            )}

            <Card className="p-5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="In bloom" value={String(grown.length)} />
                <Stat label="Growing" value={String(queue.length)} />
                <Stat label="Grown by study" value={m(totalGrownMinutes)} />
              </div>
              <p className="eyebrow mt-5 mb-2 !text-[9.5px]">Collection</p>
              <div className="grid grid-cols-7 gap-1.5">
                {SPECIES.map((s) => {
                  const n = counts.get(s.id) ?? 0;
                  return (
                    <span
                      key={s.id}
                      title={`${s.name}: ${n ? `${n} grown` : grown.length < s.unlock ? `unlocks after ${s.unlock} plants` : "not grown yet"}`}
                      className={cx("relative flex aspect-square items-center justify-center rounded-xl", n ? "" : "opacity-35 grayscale")}
                    >
                      <Thumb src={thumbs[`plant:${s.id}`]} size={44} className="!h-full !w-full" />
                      {n > 1 && <span className="absolute -right-1 -bottom-1 rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-fg">{n}</span>}
                    </span>
                  );
                })}
              </div>
              {rows < MAX_ROWS && (
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-surface-2/60 px-3 py-2.5 text-sm">
                  <Shovel size={15} className="text-accent" />
                  <span className="flex-1">More land: one more row of {COLS} plots</span>
                  <Button size="sm" disabled={balance < expandCost(rows)} onClick={expand}>
                    <Beats n={expandCost(rows)} unit={false} />
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 px-2 py-3">
      <div className="font-display tabular text-lg">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function PlantPanel({ p, thumb, progress, live, position, onGrowNext, onMove }: { p: Row; thumb?: string; progress: number; live: number; position: number; onGrowNext: (p: Row) => void; onMove: () => void }) {
  const mutate = useMutate();
  const s = speciesById.get(p.species);
  const done = Number(p.minutes) + live;
  return (
    <div>
      <p className="eyebrow !text-[9.5px]">{p.grown_at ? `In bloom since ${fmtDate(String(p.grown_at).slice(0, 10))}` : position === 0 ? "Growing now" : `Waiting · number ${position + 1} in line`}</p>
      <h2 className="font-display mt-1 flex items-center gap-3 text-xl">
        <Thumb src={thumb} size={52} />
        {s?.name}
      </h2>
      <p className="text-sm text-muted">{STAGE_NAMES[stageOf(progress)]}</p>
      <MilestoneBar className="mt-3" value={done} max={Number(p.need_minutes)} color="#7cc152" label="Growth" />
      <p className="mt-2 text-sm text-muted">
        {m(Math.min(done, Number(p.need_minutes)))} of {m(p.need_minutes)} studied
        {!p.grown_at && ` · ${m(Math.max(0, Number(p.need_minutes) - done))} to go`}
      </p>
      <p className="mt-1 text-xs text-muted">Planted {fmtDate(String(p.planted_at).slice(0, 10))}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!p.grown_at && position > 0 && (
          <Button size="sm" variant="primary" icon={Sprout} onClick={() => onGrowNext(p)}>
            Grow this now
          </Button>
        )}
        <Button size="sm" icon={ArrowRightLeft} onClick={onMove}>
          Move
        </Button>
        <ConfirmDelete label={p.grown_at ? "Dig up" : "Dig up (loses its progress)"} size="sm" onConfirm={() => mutate(db.remove("garden_plants", p.id))} />
      </div>
      {!p.grown_at && position > 0 && <p className="mt-3 text-xs text-muted">"Grow this now" pauses the current plant; it keeps its progress.</p>}
    </div>
  );
}
