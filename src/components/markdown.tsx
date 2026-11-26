import { useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListChecks,
  Table,
  Quote,
  Code,
  Sigma,
  Image as ImageIcon,
  Columns2,
  Eye,
  PenLine,
  Link2,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import { useAppInfo } from "../lib/hooks";
import { localSrc } from "./shared";
import { IconButton } from "./ui";
import { cx } from "../lib/format";
import { toast } from "../stores/toast";

const CALLOUTS: Record<string, string> = {
  NOTE: "border-sky-500 bg-sky-500/10",
  TIP: "border-emerald-500 bg-emerald-500/10",
  IMPORTANT: "border-violet-500 bg-violet-500/10",
  WARNING: "border-amber-500 bg-amber-500/10",
  CAUTION: "border-red-500 bg-red-500/10",
};

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const info = useAppInfo();
  const components: Components = {
    // Strip the "[!NOTE]" marker from the first line of a callout.
    p: ({ children }) => {
      const arr = Array.isArray(children) ? [...children] : [children];
      if (typeof arr[0] === "string") {
        const m = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(arr[0]);
        if (m) {
          arr[0] = arr[0].slice(m[0].length);
          if (arr.every((c) => typeof c === "string" && !c.trim())) return null;
        }
      }
      return <p>{arr}</p>;
    },
    a:({ href, children }) => (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          if (href) openUrl(href).catch((err) => toast.error(String(err)));
        }}
      >
        {children}
      </a>
    ),
    img: ({ src, alt }) => {
      const s = typeof src === "string" ? src : "";
      const resolved = s.startsWith("files/") && info.data ? localSrc(info.data.dataDir, s) : s;
      return <img src={resolved} alt={alt ?? ""} className="max-h-[480px] rounded-lg" />;
    },
    blockquote: ({ children }) => {
      const t = textOf(children).trim();
      const m = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.exec(t);
      if (m) {
        const kind = m[1].toUpperCase();
        return (
          <div className={cx("my-3 rounded-r-lg border-l-4 px-4 py-2", CALLOUTS[kind])}>
            <div className="mb-1 text-xs font-bold tracking-wide">{kind}</div>
            <div className="callout-body">{children}</div>
          </div>
        );
      }
      return <blockquote>{children}</blockquote>;
    },
  };
  return (
    <div className={cx("md", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {source || ""}
      </ReactMarkdown>
    </div>
  );
}

type Mode = "write" | "split" | "preview";

/**
 * Markdown editor with toolbar, live preview, and image paste/insert.
 * Images are copied into app storage and referenced as files/<subdir>/… paths.
 */
export function MarkdownEditor({
  value,
  onChange,
  subdir = "notes",
  minHeight = 280,
  placeholder,
  defaultMode = "write",
  onSelectionAction,
  selectionActionLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  subdir?: string;
  minHeight?: number;
  placeholder?: string;
  defaultMode?: Mode;
  onSelectionAction?: (selected: string) => void;
  selectionActionLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>(defaultMode);

  const wrap = (before: string, after = before, fallback = "text") => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = value.slice(s, e) || fallback;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };

  const insert = (text: string) => {
    const ta = ref.current;
    const pos = ta ? ta.selectionStart : value.length;
    const end = ta ? ta.selectionEnd : value.length;
    const needsNl = pos > 0 && value[pos - 1] !== "\n" && text.startsWith("\n") === false && /^[#>|\-$`]/.test(text);
    const t = (needsNl ? "\n" : "") + text;
    onChange(value.slice(0, pos) + t + value.slice(end));
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(pos + t.length, pos + t.length);
    });
  };

  const linePrefix = (prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const s = value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    onChange(value.slice(0, s) + prefix + value.slice(s));
    requestAnimationFrame(() => ta.focus());
  };

  const saveImage = async (bytes: Uint8Array, name: string) => {
    try {
      const rel = await api.fileSaveBytes(bytes, name, subdir);
      insert(`![${name}](${rel})\n`);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const ext = file.type.split("/")[1] || "png";
    await saveImage(new Uint8Array(await file.arrayBuffer()), `pasted.${ext}`);
  };

  const pickImage = async () => {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }],
    });
    if (typeof path !== "string") return;
    try {
      const rel = await api.fileImport(path, subdir);
      insert(`![image](${rel})\n`);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const selected = () => {
    const ta = ref.current;
    return ta ? value.slice(ta.selectionStart, ta.selectionEnd) : "";
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-2/60 px-1.5 py-1">
        <IconButton icon={Heading2} label="Heading" onClick={() => linePrefix("## ")} />
        <IconButton icon={Bold} label="Bold" onClick={() => wrap("**")} />
        <IconButton icon={Italic} label="Italic" onClick={() => wrap("*")} />
        <IconButton icon={Link2} label="Link" onClick={() => wrap("[", "](https://)", "link text")} />
        <IconButton icon={List} label="Bullet list" onClick={() => linePrefix("- ")} />
        <IconButton icon={ListChecks} label="Checklist" onClick={() => linePrefix("- [ ] ")} />
        <IconButton icon={Quote} label="Callout" onClick={() => insert("> [!NOTE]\n> ")} />
        <IconButton
          icon={Table}
          label="Table"
          onClick={() => insert("| Column | Column |\n| --- | --- |\n| | |\n")}
        />
        <IconButton icon={Code} label="Code block" onClick={() => wrap("```\n", "\n```", "code")} />
        <IconButton icon={Sigma} label="Math block" onClick={() => wrap("$$\n", "\n$$", "E = mc^2")} />
        <IconButton icon={ImageIcon} label="Insert image (or paste one)" onClick={pickImage} />
        {onSelectionAction && (
          <button
            type="button"
            className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
            onClick={() => {
              const s = selected();
              if (!s.trim()) toast.info("Highlight some text in the editor first");
              else onSelectionAction(s);
            }}
          >
            {selectionActionLabel}
          </button>
        )}
        <div className="ml-auto flex items-center">
          <IconButton icon={PenLine} label="Write" active={mode === "write"} onClick={() => setMode("write")} />
          <IconButton icon={Columns2} label="Split" active={mode === "split"} onClick={() => setMode("split")} />
          <IconButton icon={Eye} label="Preview" active={mode === "preview"} onClick={() => setMode("preview")} />
        </div>
      </div>
      <div className={cx("grid", mode === "split" && "grid-cols-2 divide-x divide-line")}>
        {mode !== "preview" && (
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
            placeholder={placeholder ?? "Write in Markdown… paste images directly"}
            spellCheck
            className="w-full resize-y bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed outline-none"
            style={{ minHeight }}
          />
        )}
        {mode !== "write" && (
          <div className="overflow-y-auto px-5 py-3" style={{ minHeight, maxHeight: mode === "split" ? 640 : undefined }}>
            {value.trim() ? <MarkdownView source={value} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
