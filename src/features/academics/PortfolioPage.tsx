import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Award, Briefcase, FileDown, FlaskConical, HeartHandshake, Medal, Pencil, Plus, Printer, ShieldCheck, Sparkles, Star, Stethoscope, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, db, type Row } from "../../lib/api";
import { useRows, useTagsBy } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { fmtDate } from "../../lib/dates";
import { Badge, Button, Card, Drawer, Empty, Page, PageHeader } from "../../components/ui";
import { useFormState } from "../../components/form";
import { AttachmentList } from "../../components/shared";
import { MarkdownView } from "../../components/markdown";
import { Connections } from "../../components/connections";
import { LinkChips, LinkedSections } from "../../components/linked";
import { KIND_NAMES, ModuleChip, PORTFOLIO_KINDS, useModules } from "./common";
import { PortfolioForm } from "./forms";
import { toast } from "../../stores/toast";
import { fmtHours, HOUR_KINDS, HoursBoard, HoursDetail, LogHoursModal, useActivityHours, type Hours } from "./hours";

const KIND_ICON: Record<string, LucideIcon> = {
  Volunteering: HeartHandshake,
  CCA: Medal,
  "Clinical & shadowing": Stethoscope,
  "Important events": Sparkles,
  Leadership: UsersRound,
  Research: FlaskConical,
  Awards: Award,
  Certifications: ShieldCheck,
};
const kindOf = (e: Row): string => (KIND_NAMES.includes(e.kind) ? e.kind : "Important events");
const KINDS = ["events", "people", "modules", "moments", "todos"];
const plain = (md: string) => md.replace(/[#*_>`]/g, "");

const range = (e: Row) => [fmtDate(e.start_date), fmtDate(e.end_date)].filter(Boolean).join(" – ");
const details = (e: Row, byId: Map<number, Row>, hours?: Map<number, Hours>) =>
  [range(e), e.role, e.organisation, (hours?.get(e.id)?.total ?? Number(e.hours || 0)) > 0 && fmtHours(hours?.get(e.id)?.total ?? Number(e.hours)), e.referee && `Referee: ${e.referee}`, byId.get(e.module_id)?.code].filter(Boolean).join(" · ");

function toMarkdown(entries: Row[], skills: Map<number, string[]>, byId: Map<number, Row>, attachments: Row[], hours: Map<number, Hours>) {
  const out = ["# Portfolio", "", `_Exported ${new Date().toLocaleDateString()}_`, ""];
  for (const cat of KIND_NAMES) {
    const list = entries.filter((e) => kindOf(e) === cat);
    if (!list.length) continue;
    out.push(`## ${cat}`, "");
    for (const e of list) {
      out.push(`### ${e.title}`);
      const meta = details(e, byId, hours);
      if (meta) out.push(`*${meta}*`);
      out.push("");
      if (e.summary_md) out.push(e.summary_md, "");
      if (e.reflection_md) out.push("**Why it matters for medicine**", "", e.reflection_md, "");
      const sk = skills.get(e.id);
      if (sk?.length) out.push(`**Skills:** ${sk.join(", ")}`, "");
      const att = attachments.filter((a) => a.entity_id === e.id);
      if (att.length) {
        out.push("**Artifacts:**");
        att.forEach((a) => out.push(`- ${a.kind === "link" ? `[${a.label}](${a.path_or_url})` : a.label}`));
        out.push("");
      }
    }
  }
  return out.join("\n");
}

function PrintView({ entries, skills, byId, hours, onDone }: { entries: Row[]; skills: Map<number, string[]>; byId: Map<number, Row>; hours: Map<number, Hours>; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.print();
      onDone();
    }, 300);
    return () => clearTimeout(t);
  }, [onDone]);
  return createPortal(
    <div className="print-root fixed inset-0 z-[100] overflow-auto bg-white p-12 text-black">
      <h1 className="mb-1 text-2xl font-bold">Portfolio</h1>
      <p className="mb-8 text-sm text-gray-500">Exported {new Date().toLocaleDateString()}</p>
      {KIND_NAMES.map((cat) => {
        const list = entries.filter((e) => kindOf(e) === cat);
        if (!list.length) return null;
        return (
          <section key={cat} className="mb-8">
            <h2 className="mb-3 border-b border-gray-300 pb-1 text-xl font-semibold">{cat}</h2>
            {list.map((e) => (
              <article key={e.id} className="mb-5 break-inside-avoid">
                <h3 className="text-lg font-semibold">{e.title}</h3>
                <p className="mb-2 text-sm text-gray-600">{details(e, byId, hours)}</p>
                {e.summary_md && <MarkdownView source={e.summary_md} />}
                {e.reflection_md && (
                  <>
                    <p className="mt-2 text-sm font-semibold">Why it matters for medicine</p>
                    <MarkdownView source={e.reflection_md} />
                  </>
                )}
                {skills.get(e.id)?.length ? <p className="mt-2 text-sm"><strong>Skills:</strong> {skills.get(e.id)!.join(", ")}</p> : null}
              </article>
            ))}
          </section>
        );
      })}
    </div>,
    document.body,
  );
}

function Hero({ rows, totals }: { rows: Row[]; totals: Map<number, Hours> }) {
  const hours = (k?: string) => Math.round(rows.filter((e) => !k || kindOf(e) === k).reduce((s, e) => s + (totals.get(e.id)?.total ?? 0), 0) * 10) / 10;
  const stats = [
    [String(rows.length), "experiences"],
    [String(rows.filter((e) => !e.end_date || e.end_date >= new Date().toISOString().slice(0, 10)).length), "still ongoing"],
    [String(rows.filter((e) => e.highlight).length), "highlights"],
    [String(hours()), "hours in all"],
  ];
  return (
    <div
      className="glass anim-item relative overflow-hidden rounded-[22px] p-8"
      style={{ backgroundImage: "linear-gradient(125deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent) 6%, transparent) 55%, color-mix(in srgb, var(--accent) 14%, transparent))" }}
    >
      <Stethoscope size={210} strokeWidth={1.1} className="pointer-events-none absolute -top-6 -right-6 rotate-12 text-accent opacity-15" />
      <p className="eyebrow !text-accent">Portfolio</p>
      <h1 className="font-display mt-1 text-4xl leading-tight">My road to medicine</h1>
      <div className="relative mt-7 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {stats.map(([n, label]) => (
          <div key={label} className="rounded-[16px] border border-line bg-surface-solid/40 px-4 py-3">
            <div className="font-display text-2xl">{n}</div>
            <div className="text-xs opacity-75">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const { byId } = useModules();
  const [openId, setOpenId] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const form = useFormState();
  useDeepLinkForm("portfolio_entries", form, undefined, (r) => setOpenId(r.id));
  const { rows } = useRows("portfolio_entries", undefined, "start_date desc, id desc");
  const skills = useTagsBy("portfolio_entries", "skill").by;
  const open = rows.find((r) => r.id === openId);
  const starred = rows.filter((r) => r.highlight);
  const totals = useActivityHours(rows);
  const [logFor, setLogFor] = useState<number | null | undefined>(undefined);

  const exportMd = async () => {
    const dest = await saveDialog({ defaultPath: "Portfolio.md", filters: [{ name: "Markdown", extensions: ["md"] }] });
    if (!dest) return;
    try {
      const att = await db.list("attachments", { entity_type: "portfolio_entries" });
      await api.fileWriteText(dest, toMarkdown(rows, skills, byId, att, totals));
      toast.success("Portfolio exported");
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <>
      <PageHeader
        title=""
        actions={
          <>
            <Button icon={FileDown} onClick={exportMd} disabled={!rows.length}>
              Markdown
            </Button>
            <Button icon={Printer} onClick={() => setPrinting(true)} disabled={!rows.length}>
              PDF
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => form.openNew()}>
              Add experience
            </Button>
          </>
        }
      />
      <Page className="space-y-7 pt-0">
        <Hero rows={rows} totals={totals} />
        <HoursBoard entries={rows} hours={totals} onOpen={setOpenId} onLog={(id) => setLogFor(id ?? null)} />
        {starred.length > 0 && (
          <section>
            <h2 className="font-display mb-3 flex items-center gap-2 px-1 text-xl">
              <Star size={16} className="text-accent" /> Highlights
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {starred.map((e) => {
                const Icon = KIND_ICON[kindOf(e)];
                const color = PORTFOLIO_KINDS[kindOf(e)];
                return (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => setOpenId(e.id)}
                    className="anim-item relative min-h-44 overflow-hidden rounded-[22px] p-6 text-left hover:-translate-y-0.5"
                    style={{ background: `linear-gradient(140deg, ${color}, color-mix(in srgb, ${color} 35%, #fffaf4))`, color: "#3a2330" }}
                  >
                    <Icon size={110} strokeWidth={1.2} className="absolute -right-3 -bottom-4 opacity-15" />
                    <p className="text-[11px] tracking-widest uppercase opacity-70">{kindOf(e)}</p>
                    <p className="font-display mt-2 text-xl leading-tight">{e.title}</p>
                    <p className="mt-1 text-xs opacity-75">{[e.organisation, range(e)].filter(Boolean).join(" · ")}</p>
                    {e.reflection_md && <p className="mt-3 line-clamp-3 text-sm italic">{plain(e.reflection_md)}</p>}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        <LinkedSections
          type="portfolio_entries"
          rows={rows}
          kinds={KINDS}
          heading={(e) => (e.start_date ? String(e.start_date).slice(0, 4) : "Undated")}
          grid="ml-5 space-y-3 border-l-2 border-accent/25 pl-8"
          empty={
            <Empty icon={Briefcase} title="Your story starts here">
              Log CCAs, volunteering, shadowing and the moments that made you want medicine, while they're still fresh.
            </Empty>
          }
          render={(e) => {
            const kind = kindOf(e);
            const Icon = KIND_ICON[kind];
            return (
              <div className="relative">
                <span className="absolute top-4 -left-[52px] flex h-10 w-10 items-center justify-center rounded-full shadow-md" style={{ background: PORTFOLIO_KINDS[kind], color: "#3a2330" }}>
                  <Icon size={17} />
                </span>
                <Card onClick={() => setOpenId(e.id)} className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={PORTFOLIO_KINDS[kind]}>{kind}</Badge>
                    {(totals.get(e.id)?.total ?? 0) > 0 ? <Badge>{fmtHours(totals.get(e.id)!.total)}</Badge> : null}
                    <span className="ml-auto text-xs text-muted">{range(e)}</span>
                  </div>
                  <div className="font-display mt-2 text-xl">{e.title}</div>
                  <div className="text-sm text-muted">{[e.role, e.organisation].filter(Boolean).join(", ")}</div>
                  {e.summary_md && <p className="mt-2 line-clamp-3 text-sm">{plain(e.summary_md)}</p>}
                  {skills.get(e.id)?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {skills.get(e.id)!.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  ) : null}
                  <LinkChips type="portfolio_entries" id={e.id} />
                </Card>
              </div>
            );
          }}
        />
      </Page>
      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.title}
        width="w-[640px]"
        actions={
          open && (
            <Button size="sm" icon={Pencil} onClick={() => form.openEdit(open)}>
              Edit
            </Button>
          )
        }
      >
        {open && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <Badge color={PORTFOLIO_KINDS[kindOf(open)]}>{kindOf(open)}</Badge>
              <ModuleChip module={byId.get(open.module_id)} />
              {details(open, byId, totals)}
            </div>
            {(HOUR_KINDS.includes(kindOf(open)) || open.count_events || (totals.get(open.id)?.total ?? 0) > 0) && (
              <HoursDetail entry={open} h={totals.get(open.id)} onLog={() => setLogFor(open.id)} />
            )}
            {open.summary_md && <MarkdownView source={open.summary_md} />}
            {open.reflection_md && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Why it matters for medicine</h3>
                <MarkdownView source={open.reflection_md} />
              </div>
            )}
            {skills.get(open.id)?.length ? (
              <div className="flex flex-wrap gap-1">
                {skills.get(open.id)!.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            ) : null}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Attached artifacts</h3>
              <AttachmentList entityType="portfolio_entries" entityId={open.id} subdir="portfolio" />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Connected pages</h3>
              <Connections type="portfolio_entries" id={open.id} />
            </div>
          </div>
        )}
      </Drawer>
      <PortfolioForm state={form} />
      {printing && <PrintView entries={rows} skills={skills} byId={byId} hours={totals} onDone={() => setPrinting(false)} />}
      {logFor !== undefined && (
        <LogHoursModal
          entries={rows.filter((e) => HOUR_KINDS.includes(kindOf(e)) || e.count_events || (totals.get(e.id)?.logged ?? 0) > 0)}
          entryId={logFor ?? undefined}
          onClose={() => setLogFor(undefined)}
        />
      )}
    </>
  );
}
