// The study garden: a flower garden with a new land every month (one bed per day).
// Plant a flower, then study to grow it: focus sessions and logged study grow the
// flower first in line, and it keeps its progress between sessions. The fewer
// sessions a flower takes to bloom, the rarer its colour. Bloomed flowers give laurels to
// collect, more for longer flowers and rarer colours. Laurels buy decorations.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, ChevronLeft, ChevronRight, Lock, MoveRight, RotateCw, Sprout, Star, Timer, Undo2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { fmtDate } from "../../lib/dates";
import { cx, fmtMinutes } from "../../lib/format";
import { toast } from "../../stores/toast";
import { focusMs, useFocusRun, useTick } from "../../lib/focus";
import { Button, Card, ConfirmDelete, MilestoneBar, Page, PageHeader, Segmented } from "../../components/ui";
import { Beats, useBeats } from "../../components/beats";
import { bedsIn, bloomLaurels, countSessions, DECOR, decorById, LAND_CELLS, landName, landOf, LEGACY_TIER, RARITY, SPECIES, speciesById, STAGE_NAMES, stageOf, TIER_RULE, tierOf, type Species } from "./catalog";
import type { Cell } from "./scene";

const m = (n: number) => fmtMinutes(Math.round(n)) || "0m";
type Credit = { log_id: number; date: string; minutes: number };

/** Pictures of each flower colour and decoration, rendered from the 3D models once per session. */
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

function Stars({ tier, className }: { tier: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-0.5", className)} title={RARITY[tier]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={11} className={i <= tier ? "fill-[var(--beat)] text-[var(--beat)]" : "text-line"} />
      ))}
    </span>
  );
}
function Swatch({ color, size = 12, ring }: { color: string; size?: number; ring?: boolean }) {
  return <span className={cx("inline-block shrink-0 rounded-full border border-black/10", ring && "ring-2 ring-[var(--beat)] ring-offset-1 ring-offset-[var(--surface)]")} style={{ width: size, height: size, background: color }} />;
}

/** A little burst of petals when laurels are collected. */
function Burst({ color, onDone }: { color: string; onDone: () => void }) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const kids = [...el.children] as HTMLElement[];
    kids.forEach((k, i) => {
      const a = (i / kids.length) * Math.PI * 2 + Math.random() * 0.4;
      const d = 34 + Math.random() * 26;
      k.animate(
        [
          { transform: "translate(-50%,-50%) rotate(0deg) scale(0.4)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 10}px)) rotate(${a * 90}deg) scale(1)`, opacity: 0 },
        ],
        { duration: 850, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
      );
    });
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <span ref={host} className="pointer-events-none absolute top-1/2 left-1/2 z-10">
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className="absolute h-2.5 w-1.5 rounded-full" style={{ background: i % 3 ? color : "var(--beat)" }} />
      ))}
    </span>
  );
}

/** The 3D view is loaded only when the garden is opened. */
function Island({ beds, cells, selected, onPick }: { beds: number; cells: Cell[]; selected: number | null; onPick: (p: number | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<import("./scene").GardenScene | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ beds, cells, selected });
  latest.current = { beds, cells, selected };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import("./scene")
      .then(({ GardenScene }) => {
        if (!alive || !host.current) return;
        try {
          const s = new GardenScene(host.current, (p) => pick.current(p));
          const l = latest.current;
          s.setBeds(l.beds);
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
  useEffect(() => scene.current?.setBeds(beds), [beds]);
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
  const creditRows = useRows<Credit & { plant_id: number }>("garden_credits", undefined, "id").rows;
  const { balance } = useBeats();
  const current = landOf();
  const [land, setLand] = useState(current);
  const [selected, setSelected] = useState<number | null>(null);
  const [moving, setMoving] = useState<{ kind: "plant" | "decor"; id: number } | null>(null);
  const [tab, setTab] = useState<"seeds" | "decor">("seeds");
  const thumbs = useThumbs();

  // A focus session on a module counts toward the growing flower live.
  const run = useFocusRun();
  const now = useTick(!!run && run.endedAt == null && run.kind === "academic");
  const live = run && run.kind === "academic" && run.moduleId ? Math.floor(focusMs(run, now) / 60_000) : 0;

  const credits = useMemo(() => {
    const map = new Map<number, Credit[]>();
    for (const c of creditRows) map.set(c.plant_id, [...(map.get(c.plant_id) ?? []), c]);
    return map;
  }, [creditRows]);
  const sessionsOf = (p: Row) => countSessions(credits.get(p.id) ?? []);
  /** The colour a flower has (bloomed) or would have if it bloomed in its next session. */
  const tierFor = (p: Row) => {
    const cs = credits.get(p.id) ?? [];
    if (p.grown_at) return cs.length ? tierOf(Math.max(1, countSessions(cs))) : LEGACY_TIER;
    return tierOf(countSessions(cs) + 1);
  };
  const rewardFor = (p: Row) => bloomLaurels(Number(p.need_minutes), tierFor(p));

  const lands = useMemo(() => [...new Set([current, ...plants.map((p) => p.land ?? current), ...decor.map((d) => d.land ?? current)])].sort(), [plants, decor, current]);
  const li = lands.indexOf(land);
  const beds = bedsIn(land);
  const isCurrent = land === current;
  const here = plants.filter((p) => (p.land ?? current) === land);
  const hereDecor = decor.filter((d) => (d.land ?? current) === land);

  // Study grows the flower first in line (or the one picked for the running focus session).
  const queue = plants.filter((p) => !p.grown_at);
  const picked = run && run.kind === "academic" && run.moduleId ? queue.find((p) => p.id === run.plantId) : undefined;
  const growingPlant = picked ?? queue[0] ?? null;
  const positionOf = (p: Row) => (p.id === growingPlant?.id ? 0 : queue.filter((q) => q.id !== growingPlant?.id).findIndex((q) => q.id === p.id) + 1);
  const grown = plants.filter((p) => p.grown_at);
  const toCollect = grown.filter((p) => p.claimed == null);
  const at = useMemo(() => {
    const map = new Map<number, { kind: "plant" | "decor"; row: Row }>();
    here.forEach((p) => map.set(p.plot, { kind: "plant", row: p }));
    hereDecor.forEach((d) => map.set(d.plot, { kind: "decor", row: d }));
    return map;
  }, [here, hereDecor]);
  const progressOf = (p: Row) => Math.min(1, (Number(p.minutes) + (growingPlant?.id === p.id ? live : 0)) / Number(p.need_minutes));

  const cells: Cell[] = useMemo(
    () => [
      ...here.map((p) => {
        const g = progressOf(p);
        const tier = tierFor(p);
        return {
          key: `p${p.id}:${p.species}:${Math.round(g * 40)}:${stageOf(g) >= 4 ? tier : ""}`,
          plot: p.plot,
          kind: "plant" as const,
          species: p.species,
          g,
          tier,
          seed: p.id * 31 + 7,
          growing: growingPlant?.id === p.id,
          claim: !!p.grown_at && p.claimed == null,
        };
      }),
      ...hereDecor.map((d) => ({ key: `d${d.id}:${d.kind}:${d.rot}`, plot: d.plot, kind: "decor" as const, decor: d.kind, rot: d.rot, seed: d.id * 17 + 3 })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [here, hereDecor, live, growingPlant?.id, credits],
  );

  const sel = selected != null ? at.get(selected) : undefined;
  const goLand = (l: string) => {
    setLand(l);
    setSelected(null);
    setMoving(null);
  };

  const pickPlot = async (p: number | null) => {
    if (moving && p != null && !at.has(p)) {
      if (moving.kind === "plant" && p >= beds) return toast.error("Flowers need a soil bed");
      await mutate(db.update(moving.kind === "plant" ? "garden_plants" : "garden_decor", moving.id, { plot: p }));
      setMoving(null);
      setSelected(p);
      return;
    }
    setMoving(null);
    setSelected(p);
    if (p != null && p >= beds) setTab("decor");
  };

  const plant = async (s: Species) => {
    if (selected == null) return;
    const maxQ = plants.reduce((q, p) => Math.max(q, Number(p.queue)), 0);
    await mutate(db.insert("garden_plants", { species: s.id, land, plot: selected, need_minutes: s.minutes, queue: maxQ + 1 }));
    toast.success(queue.length ? `${s.name} planted. It grows after the flowers ahead of it.` : `${s.name} planted. Study to make it grow.`);
  };
  const place = async (kind: string) => {
    if (selected == null) return;
    const d = decorById.get(kind)!;
    if (balance < d.cost) return toast.error(`You need ${d.cost - balance} more laurels`);
    await mutate(async () => {
      const row = await db.insert("garden_decor", { kind, land, plot: selected });
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
  const collect = async (list: Row[]) => {
    let total = 0;
    await mutate(async () => {
      for (const p of list) {
        const s = speciesById.get(p.species);
        const tier = tierFor(p);
        const n = bloomLaurels(Number(p.need_minutes), tier);
        total += n;
        await db.insert("beats", { amount: n, reason: `Garden · ${s?.hues[tier].name ?? ""} ${s?.name ?? "flower"} bloomed`, source_type: "garden_bloom", source_id: p.id });
        await db.update("garden_plants", p.id, { claimed: n });
      }
    });
    toast.success(list.length === 1 ? `+${total} laurels collected` : `+${total} laurels from ${list.length} flowers`);
  };

  const totalGrownMinutes = plants.reduce((s, p) => s + Number(p.minutes), 0);
  const earned = grown.reduce((s, p) => s + Number(p.claimed ?? 0), 0);
  const book = new Map<string, number>();
  grown.forEach((p) => {
    const k = `${p.species}:${tierFor(p)}`;
    book.set(k, (book.get(k) ?? 0) + 1);
  });
  const planted = here.length;

  return (
    <>
      <PageHeader
        title="Garden"
        icon={Sprout}
        subtitle="Plant a flower, then study to grow it. The fewer sessions it takes to bloom, the rarer its colour."
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
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="glass relative h-[min(72vh,760px)] min-h-[480px] overflow-hidden rounded-[22px]" style={{ background: "linear-gradient(180deg, #bfe6ff 0%, #dff3ff 45%, #fff6dc 100%)" }}>
            <Island beds={beds} cells={cells} selected={selected} onPick={pickPlot} />
            <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/80 p-1 text-[#2d3a2a] shadow-lg backdrop-blur">
              <button type="button" disabled={li <= 0} onClick={() => goLand(lands[li - 1])} className="rounded-full p-1.5 hover:bg-black/5 disabled:opacity-30" aria-label="Earlier month">
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-36 px-1 text-center">
                <span className="block text-sm font-semibold">{landName(land)}</span>
                <span className="block text-[10.5px] opacity-65">
                  {isCurrent ? "This month" : "Past land"} · {planted} of {beds} beds
                </span>
              </span>
              <button type="button" disabled={li >= lands.length - 1} onClick={() => goLand(lands[li + 1])} className="rounded-full p-1.5 hover:bg-black/5 disabled:opacity-30" aria-label="Later month">
                <ChevronRight size={16} />
              </button>
            </div>
            {growingPlant && (
              <div className="pointer-events-none absolute bottom-3 left-3 hidden rounded-2xl bg-white/80 px-3.5 py-2 text-[#2d3a2a] shadow-lg backdrop-blur sm:block">
                <p className="text-[10px] font-semibold tracking-widest uppercase opacity-60">{live ? "Growing while you focus" : "Growing now"}</p>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Thumb src={thumbs[`flower:${growingPlant.species}:${tierFor(growingPlant)}`]} size={26} className="!rounded-lg" />
                  {speciesById.get(growingPlant.species)?.name}
                </p>
                <p className="text-xs opacity-70">
                  {m(Number(growingPlant.minutes) + live)} of {m(growingPlant.need_minutes)}
                </p>
              </div>
            )}
            {moving && (
              <div className="absolute top-16 right-3 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-[#2d3a2a] shadow">
                <MoveRight size={13} /> Click an empty {moving.kind === "plant" ? "bed" : "spot"} to move it
                <button type="button" className="underline" onClick={() => setMoving(null)}>
                  Cancel
                </button>
              </div>
            )}
            <p className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-white/60 px-3 py-1 text-[11px] text-[#2d3a2a]/80 backdrop-blur">Drag to turn · scroll to zoom · click a bed</p>
          </div>

          <div className="space-y-4">
            {selected != null && selected < LAND_CELLS ? (
              <Card className="p-5">
                {!sel && (
                  <>
                    <div className="mb-3 flex items-center gap-2">
                      <h2 className="flex-1 font-semibold">{selected < beds ? `Bed ${selected + 1}` : "Lawn"}</h2>
                      {selected < beds && (
                        <Segmented<"seeds" | "decor">
                          value={tab}
                          onChange={setTab}
                          options={[
                            { value: "seeds", label: "Flowers" },
                            { value: "decor", label: "Decorate" },
                          ]}
                        />
                      )}
                    </div>
                    {tab === "seeds" && selected < beds ? (
                      isCurrent ? (
                        <>
                        <div className="max-h-[56vh] space-y-1 overflow-y-auto pr-1">
                          {SPECIES.map((s) => {
                            const locked = grown.length < s.unlock;
                            return (
                              <button
                                type="button"
                                key={s.id}
                                disabled={locked}
                                onClick={() => plant(s)}
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
                                    <span className="ml-auto shrink-0 text-xs text-muted">{m(s.minutes)} to bloom</span>
                                  </span>
                                  <span className="mt-0.5 flex items-center gap-1">
                                    {s.hues.map((h) => (
                                      <Swatch key={h.name} color={h.petal} size={10} />
                                    ))}
                                    <span className="ml-auto text-[11px] text-muted">
                                      <Beats n={bloomLaurels(s.minutes, 0)} unit={false} className="!font-medium" /> to <Beats n={bloomLaurels(s.minutes, 4)} unit={false} className="!font-medium" />
                                    </span>
                                  </span>
                                  <span className="block text-xs text-muted">{locked ? `Bloom ${s.unlock - grown.length} more flower${s.unlock - grown.length > 1 ? "s" : ""} to unlock` : s.blurb}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        </>
                      ) : (
                        <div className="text-sm text-muted">
                          <p>This land is from a past month and stays as a keepsake. New flowers go in this month's land.</p>
                          <Button size="sm" className="mt-3" onClick={() => goLand(current)}>
                            Go to {landName(current)}
                          </Button>
                        </div>
                      )
                    ) : (
                      <div className="grid max-h-[56vh] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
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
                {sel?.kind === "plant" && (
                  <FlowerPanel
                    p={sel.row}
                    thumbs={thumbs}
                    tier={tierFor(sel.row)}
                    sessions={sessionsOf(sel.row)}
                    reward={rewardFor(sel.row)}
                    progress={progressOf(sel.row)}
                    live={growingPlant?.id === sel.row.id ? live : 0}
                    position={positionOf(sel.row)}
                    onGrowNext={growNext}
                    onMove={() => setMoving({ kind: "plant", id: sel.row.id })}
                    onCollect={() => collect([sel.row])}
                  />
                )}
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
                <p className="eyebrow !text-[9.5px]">{live ? "Growing while you focus" : "Growing now"}</p>
                {growingPlant ? (
                  <>
                    <h2 className="font-display mt-1 flex items-center gap-3 text-xl">
                      <Thumb src={thumbs[`flower:${growingPlant.species}:${tierFor(growingPlant)}`]} size={52} />
                      {speciesById.get(growingPlant.species)?.name}
                    </h2>
                    <MilestoneBar className="mt-3" value={Number(growingPlant.minutes) + live} max={Number(growingPlant.need_minutes)} color="#7cc152" label="Growth" />
                    <p className="mt-2 text-sm text-muted">
                      {m(Math.max(0, Number(growingPlant.need_minutes) - Number(growingPlant.minutes) - live))} more study to bloom · {STAGE_NAMES[stageOf(progressOf(growingPlant))]}
                    </p>
                    <ColourHint s={speciesById.get(growingPlant.species)} tier={tierFor(growingPlant)} sessions={sessionsOf(growingPlant)} reward={rewardFor(growingPlant)} />
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">Nothing growing. Click an empty bed on the land and pick a flower.</p>
                )}
                {queue.length > 1 && (
                  <div className="mt-4">
                    <p className="eyebrow mb-1 !text-[9.5px]">Up next</p>
                    {queue.filter((p) => p.id !== growingPlant?.id).slice(0, 5).map((p, i) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          if ((p.land ?? current) !== land) setLand(p.land ?? current);
                          setSelected(p.plot);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-1.5 py-1 text-left text-sm hover:bg-surface-2"
                      >
                        <span className="w-4 text-xs text-muted">{i + 1}</span>
                        <Thumb src={thumbs[`plant:${p.species}`]} size={26} className="!rounded-lg" />
                        <span className="flex-1">{speciesById.get(p.species)?.name}</span>
                        <span className="text-xs text-muted">
                          {m(p.minutes)} / {m(p.need_minutes)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {toCollect.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-[color-mix(in_srgb,var(--beat)_12%,transparent)] p-3">
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm font-medium">
                        {toCollect.length} flower{toCollect.length > 1 ? "s" : ""} ready to collect
                      </p>
                      <CollectButton n={toCollect.reduce((s, p) => s + rewardFor(p), 0)} color="#ffb3cb" onCollect={() => collect(toCollect)} label="Collect all" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {toCollect.slice(0, 12).map((p) => (
                        <Thumb key={p.id} src={thumbs[`flower:${p.species}:${tierFor(p)}`]} size={30} className="!rounded-lg" />
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-4 text-xs text-muted">Every minute of study grows it: focus sessions on a module and time you log under Routine. When it blooms, extra minutes move on to the next flower.</p>
              </Card>
            )}

            <Card className="p-5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Bloomed" value={String(grown.length)} />
                <Stat label="Laurels from flowers" value={String(earned)} />
                <Stat label="Grown by study" value={m(totalGrownMinutes)} />
              </div>
              <p className="eyebrow mt-5 mb-2 !text-[9.5px]">How it works</p>
              <ol className="space-y-2 text-sm">
                {[
                  ["Plant", "Pick an empty bed and a flower, here or when you set up a focus session."],
                  ["Study", "Focus sessions and logged study grow it. Stop whenever; it carries on next time."],
                  ["Bloom", "Its colour depends on how many sessions it took. Bloom it in one session for the rarest colour."],
                  ["Collect", "Tap the golden token to collect laurels. Rarer colours and longer flowers give more."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">{i + 1}</span>
                    <span>
                      <b className="font-semibold">{t}.</b> <span className="text-muted">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">The flower guide below shows every colour, the sessions it needs and the laurels it gives.</p>
            </Card>
          </div>
        </div>

        <Card className="mt-4 p-5">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
            <h2 className="font-display text-lg">Flower guide</h2>
            <span className="text-sm text-muted">
              {book.size} of {SPECIES.length * 5} colours found
            </span>
          </div>
          <p className="mb-4 text-sm text-muted">
            Every flower comes in five colours. The fewer study sessions it takes to bloom, the rarer the colour and the more laurels it gives. A session counts when it gives the flower at least 10 minutes.
          </p>
          <div className="mb-3 hidden grid-cols-[8rem_repeat(5,minmax(0,1fr))] gap-2 text-center text-[11px] text-muted md:grid">
            <span />
            {[0, 1, 2, 3, 4].map((t) => (
              <span key={t} className="flex flex-col items-center gap-0.5">
                <Stars tier={t} />
                <span>
                  {RARITY[t]} · {TIER_RULE[t]}
                </span>
              </span>
            ))}
          </div>
          <div className="space-y-3">
            {SPECIES.map((s) => (
              <div key={s.id} className="grid grid-cols-[6rem_repeat(5,minmax(0,1fr))] items-center gap-2 md:grid-cols-[8rem_repeat(5,minmax(0,1fr))]">
                <span>
                  <span className="block text-sm font-medium">{s.name}</span>
                  <span className="block text-xs text-muted">{m(s.minutes)} of study</span>
                </span>
                {s.hues.map((h, t) => {
                  const n = book.get(`${s.id}:${t}`) ?? 0;
                  return (
                    <span key={t} title={`${h.name} ${s.name} · ${RARITY[t]} · bloom in ${TIER_RULE[t]}${n ? ` · ${n} grown` : " · not found yet"}`} className="flex flex-col items-center rounded-2xl bg-surface-2/50 p-1.5 text-center">
                      <span className={cx("relative w-full max-w-24", !n && "opacity-40 grayscale")}>
                        <Thumb src={thumbs[`flower:${s.id}:${t}`]} size={48} className="!h-auto !w-full aspect-square" />
                        {n > 1 && <span className="absolute -right-1 -bottom-1 rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-fg">{n}</span>}
                      </span>
                      <span className="mt-1 text-[11px] leading-tight font-medium">{h.name}</span>
                      <span className="text-[10.5px] leading-tight text-muted md:hidden">{TIER_RULE[t]}</span>
                      <Beats n={bloomLaurels(s.minutes, t)} unit={false} sign className="text-[11px]" />
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      </Page>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 px-2 py-3">
      <div className="font-display tabular text-lg">{value}</div>
      <div className="text-[11px] leading-tight text-muted">{label}</div>
    </div>
  );
}

function CollectButton({ n, color, onCollect, label = "Collect" }: { n: number; color: string; onCollect: () => Promise<void>; label?: string }) {
  const [burst, setBurst] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <span className="relative inline-flex">
      <Button
        size="sm"
        variant="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setBurst(true);
          try {
            await onCollect();
          } finally {
            setBusy(false);
          }
        }}
      >
        {label} <Beats n={n} unit={false} sign className="!text-accent-fg" />
      </Button>
      {burst && <Burst color={color} onDone={() => setBurst(false)} />}
    </span>
  );
}

/** What colour a growing flower is heading for. */
function ColourHint({ s, tier, sessions, reward }: { s?: Species; tier: number; sessions: number; reward: number }) {
  if (!s) return null;
  const hue = s.hues[tier];
  return (
    <div className="mt-3 rounded-2xl bg-surface-2/60 p-3 text-sm">
      <div className="flex items-center gap-1.5">
        {s.hues.map((h, t) => (
          <Swatch key={t} color={h.petal} size={t === tier ? 16 : 12} ring={t === tier} />
        ))}
        <Stars tier={tier} className="ml-auto" />
      </div>
      <p className="mt-2">
        {sessions > 0 ? `Grown over ${sessions} session${sessions > 1 ? "s" : ""} so far. ` : ""}
        Bloom it in {sessions > 0 ? "your next session" : "one session"} for a <b>{hue.name.toLowerCase()}</b> {s.name.toLowerCase()} ({RARITY[tier].toLowerCase()}) and <Beats n={reward} />.
      </p>
    </div>
  );
}

function FlowerPanel({
  p,
  thumbs,
  tier,
  sessions,
  reward,
  progress,
  live,
  position,
  onGrowNext,
  onMove,
  onCollect,
}: {
  p: Row;
  thumbs: Record<string, string>;
  tier: number;
  sessions: number;
  reward: number;
  progress: number;
  live: number;
  position: number;
  onGrowNext: (p: Row) => void;
  onMove: () => void;
  onCollect: () => Promise<void>;
}) {
  const mutate = useMutate();
  const s = speciesById.get(p.species);
  const done = Number(p.minutes) + live;
  const hue = s?.hues[tier];
  return (
    <div>
      <p className="eyebrow !text-[9.5px]">{p.grown_at ? `In bloom since ${fmtDate(String(p.grown_at).slice(0, 10))}` : position === 0 ? "Growing now" : `Waiting · number ${position + 1} in line`}</p>
      <h2 className="font-display mt-1 flex items-center gap-3 text-xl">
        <Thumb src={thumbs[p.grown_at ? `flower:${p.species}:${tier}` : `plant:${p.species}`]} size={56} />
        <span>
          {p.grown_at && hue ? `${hue.name} ${s?.name.toLowerCase()}` : s?.name}
          {p.grown_at && <Stars tier={tier} className="mt-1 flex" />}
        </span>
      </h2>
      {p.grown_at ? (
        <div className="mt-3 text-sm">
          <p className="text-muted">
            {RARITY[tier]} · {sessions > 0 ? `bloomed in ${sessions} session${sessions > 1 ? "s" : ""}` : "grown before colours were kept"} · {m(p.need_minutes)} of study
          </p>
          <div className="mt-3">{p.claimed == null ? <CollectButton n={reward} color={hue?.petal ?? "#ffb3cb"} onCollect={onCollect} /> : <span className="text-muted">Collected <Beats n={Number(p.claimed)} /></span>}</div>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">{STAGE_NAMES[stageOf(progress)]}</p>
          <MilestoneBar className="mt-3" value={done} max={Number(p.need_minutes)} color="#7cc152" label="Growth" />
          <p className="mt-2 text-sm text-muted">
            {m(Math.min(done, Number(p.need_minutes)))} of {m(p.need_minutes)} studied · {m(Math.max(0, Number(p.need_minutes) - done))} to go
          </p>
          <ColourHint s={s} tier={tier} sessions={sessions} reward={reward} />
        </>
      )}
      <p className="mt-2 text-xs text-muted">Planted {fmtDate(String(p.planted_at).slice(0, 10))}</p>
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
      {!p.grown_at && position > 0 && <p className="mt-3 text-xs text-muted">"Grow this now" pauses the current flower; it keeps its progress.</p>}
    </div>
  );
}
