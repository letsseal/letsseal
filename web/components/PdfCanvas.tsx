"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PenLine, Type, Calendar, CheckSquare, Baseline, X } from "lucide-react";
import { recipientColor, FIELD_TYPES, type RecipientColor } from "@/lib/signers";

export type FieldBox = {
  id?: string;
  type: string;
  label?: string | null; 
  page: number; 
  x: number; 
  y: number;
  w: number;
  h: number;
  signerIndex?: number;
  value?: string | null;
};

const SNAP = 0.006;
type Sib = { x: number; y: number; w: number; h: number };
function snapToSiblings(x: number, y: number, w: number, h: number, sibs: Sib[]) {
  const vGuides: number[] = [];
  const hGuides: number[] = [];
  const myX = [x, x + w / 2, x + w]; 
  const offX = [0, w / 2, w];
  let bestX: { d: number; nx: number; line: number } | null = null;
  for (const s of sibs) {
    for (const sx of [s.x, s.x + s.w / 2, s.x + s.w]) {
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(myX[k] - sx);
        if (d < SNAP && (!bestX || d < bestX.d)) bestX = { d, nx: sx - offX[k], line: sx };
      }
    }
  }
  let bestY: { d: number; ny: number; line: number } | null = null;
  const myY = [y, y + h / 2, y + h];
  const offY = [0, h / 2, h];
  for (const s of sibs) {
    for (const sy of [s.y, s.y + s.h / 2, s.y + s.h]) {
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(myY[k] - sy);
        if (d < SNAP && (!bestY || d < bestY.d)) bestY = { d, ny: sy - offY[k], line: sy };
      }
    }
  }
  if (bestX) { x = bestX.nx; vGuides.push(bestX.line); }
  if (bestY) { y = bestY.ny; hGuides.push(bestY.line); }
  return { x, y, vGuides, hGuides };
}

const FIELD_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  signature: PenLine,
  initials: Baseline,
  date: Calendar,
  text: Type,
  checkbox: CheckSquare,
};
const FIELD_LABEL = Object.fromEntries(FIELD_TYPES.map((f) => [f.type, f.label]));
const sizeFor = (t: string) => FIELD_TYPES.find((f) => f.type === t)?.size ?? [0.15, 0.04];

type Props = {
  fileUrl: string;
  fields: FieldBox[];
  mode: "build" | "sign" | "view";
  docId?: string; 
  armedType?: string | null;
  armedSignerIndex?: number;
  selectedId?: string | null;
  onPlace?: (page: number, x: number, y: number) => void;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onResize?: (id: string, w: number, h: number) => void;
  onDelete?: (id: string) => void;
  activeSignerIndex?: number;
  pointerFieldId?: string; 
  onFieldClick?: (f: FieldBox) => void;
};

type DragState = {
  id: string;
  kind: "move" | "resize";
  startX: number;
  startY: number;
  orig: { x: number; y: number; w: number; h: number };
  rect: DOMRect;
  page: number;
  sibs: Sib[]; 
};

export default function PdfCanvas(props: Props) {
  const { fileUrl, fields, mode } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [ghost, setGhost] = useState<{ page: number; cx: number; cy: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ page: number; v: number[]; h: number[] } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!fileUrl) return;
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        if (cancelled) return;
        setNumPages(doc.numPages);
        const container = containerRef.current;
        if (!container) return;
        const RENDER_WIDTH = 1100;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
          const wrap = container.querySelector<HTMLDivElement>(`[data-pagewrap="${i - 1}"]`);
          if (!wrap) continue;
          wrap.querySelectorAll("canvas").forEach((c) => c.remove());
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.display = "block";
          wrap.prepend(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    movedRef.current = true;
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    if (d.kind === "move") {
      let x = Math.min(Math.max(d.orig.x + dx, 0), 1 - d.orig.w);
      let y = Math.min(Math.max(d.orig.y + dy, 0), 1 - d.orig.h);
      const snap = snapToSiblings(x, y, d.orig.w, d.orig.h, d.sibs);
      x = snap.x; y = snap.y;
      setGuides(snap.vGuides.length || snap.hGuides.length ? { page: d.page, v: snap.vGuides, h: snap.hGuides } : null);
      props.onMove?.(d.id, x, y);
    } else {
      const w = Math.min(Math.max(d.orig.w + dx, 0.02), 1 - d.orig.x);
      const h = Math.min(Math.max(d.orig.h + dy, 0.015), 1 - d.orig.y);
      props.onResize?.(d.id, w, h);
    }
  }, [props]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setGuides(null);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    setTimeout(() => (movedRef.current = false), 0);
  }, [onPointerMove]);

  function startDrag(e: React.PointerEvent, f: FieldBox, kind: "move" | "resize") {
    if (mode !== "build" || !f.id) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).closest("[data-pagewrap]")!.getBoundingClientRect();
    const sibs = fields.filter((o) => o.page === f.page && o.id !== f.id).map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
    dragRef.current = { id: f.id, kind, startX: e.clientX, startY: e.clientY, orig: { x: f.x, y: f.y, w: f.w, h: f.h }, rect, page: f.page, sibs };
    movedRef.current = false;
    props.onSelect?.(f.id);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  }

  function pageMouseMove(e: React.MouseEvent, page: number) {
    if (mode !== "build" || !props.armedType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setGhost({ page, cx: (e.clientX - rect.left) / rect.width, cy: (e.clientY - rect.top) / rect.height });
  }

  function pageClick(e: React.MouseEvent, page: number) {
    if (mode !== "build" || !props.armedType) { props.onSelect?.(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const [w, h] = sizeFor(props.armedType);
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width - w / 2, 0), 1 - w);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height - h / 2, 0), 1 - h);
    props.onPlace?.(page, x, y);
  }

  if (error) return <div className="text-destructive text-sm p-4">PDF render error: {error}</div>;
  const pages = numPages || 1;
  const armedColor = props.armedType ? recipientColor(props.armedSignerIndex ?? 0) : null;
  const [gw, gh] = props.armedType ? sizeFor(props.armedType) : [0, 0];

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center gap-6">
      {Array.from({ length: pages }).map((_, p) => (
        <div
          key={p}
          data-pagewrap={p}
          onMouseMove={(e) => pageMouseMove(e, p)}
          onMouseLeave={() => setGhost(null)}
          onClick={(e) => pageClick(e, p)}
          className={`relative w-full bg-white rounded-md ring-1 ring-black/10 shadow-sm overflow-hidden ${
            mode === "build" && props.armedType ? "cursor-crosshair" : ""
          }`}
        >
          {props.docId && p === 0 && (
            <div className="pointer-events-none absolute top-2 left-3 z-10 text-[9px] font-mono tracking-tight text-neutral-400 select-none">
              Let&apos;s Seal Envelope ID: {props.docId.toUpperCase()}
            </div>
          )}

          {mode === "build" && props.armedType && ghost?.page === p && armedColor && (
            <FieldGhost cx={ghost.cx} cy={ghost.cy} w={gw} h={gh} type={props.armedType} color={armedColor} />
          )}

          {guides?.page === p && (
            <>
              {guides.v.map((gx, i) => (
                <div key={`v${i}`} className="pointer-events-none absolute top-0 bottom-0 z-20"
                     style={{ left: `${gx * 100}%`, width: 1, background: "#ec4899" }} />
              ))}
              {guides.h.map((gy, i) => (
                <div key={`h${i}`} className="pointer-events-none absolute left-0 right-0 z-20"
                     style={{ top: `${gy * 100}%`, height: 1, background: "#ec4899" }} />
              ))}
            </>
          )}

          {fields.filter((f) => f.page === p).map((f, i) => {
            const color = recipientColor(f.signerIndex ?? 0);
            const selected = props.selectedId === f.id;
            const mine = mode !== "sign" || props.activeSignerIndex === undefined || f.signerIndex === props.activeSignerIndex;
            return (
              <FieldTab
                key={f.id ?? i}
                f={f}
                color={color}
                mode={mode}
                selected={selected}
                mine={mine}
                isNext={props.pointerFieldId === f.id}
                onSelect={() => mode === "build" && props.onSelect?.(f.id ?? null)}
                onStartMove={(e) => startDrag(e, f, "move")}
                onStartResize={(e) => startDrag(e, f, "resize")}
                onDelete={() => f.id && props.onDelete?.(f.id)}
                onClick={() => {
                  if (mode === "sign" && mine && !movedRef.current) props.onFieldClick?.(f);
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FieldGhost({ cx, cy, w, h, type, color }: { cx: number; cy: number; w: number; h: number; type: string; color: RecipientColor }) {
  const Icon = FIELD_ICON[type] ?? PenLine;
  return (
    <div
      className="pointer-events-none absolute rounded border-2 border-dashed flex items-center justify-center gap-1 text-[11px] font-medium"
      style={{
        left: `${(cx - w / 2) * 100}%`, top: `${(cy - h / 2) * 100}%`,
        width: `${w * 100}%`, height: `${h * 100}%`,
        borderColor: color.border, background: color.fillActive, color: color.text,
      }}
    >
      <Icon className="h-3 w-3" /> {FIELD_LABEL[type]}
    </div>
  );
}

function FieldTab({
  f, color, mode, selected, mine, isNext, onSelect, onStartMove, onStartResize, onDelete, onClick,
}: {
  f: FieldBox; color: RecipientColor; mode: string; selected: boolean; mine: boolean; isNext: boolean;
  onSelect: () => void; onStartMove: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent) => void; onDelete: () => void; onClick: () => void;
}) {
  const Icon = FIELD_ICON[f.type] ?? PenLine;
  const filled = f.value != null && f.value !== "";
  const showArrow = isNext && mode === "sign" && mine && !filled;
  const arrowLeft = f.x > 0.18; // enough room on the left, else point from the right
  return (
    <div
      data-field-id={f.id}
      onPointerDown={(e) => mode === "build" && onStartMove(e)}
      onClick={(e) => { e.stopPropagation(); onSelect(); onClick(); }}
      style={{
        left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`,
        borderColor: color.border,
        borderWidth: 1.5,
        borderStyle: filled ? "solid" : "dashed",
        background: filled ? "rgba(255,255,255,0.96)" : selected || (mode === "sign" && mine) ? color.fillActive : color.fill,
        boxShadow: selected ? `0 0 0 2px ${color.solid}` : (mode === "sign" && mine && !filled) ? `0 0 0 3px ${color.fill}` : undefined,
        opacity: mode === "sign" && !mine ? 0.4 : 1,
        cursor: mode === "build" ? "move" : mine ? "pointer" : "default",
      }}
      className="absolute rounded flex items-center justify-center select-none transition-colors"
    >
      {showArrow && (
        <div
          className="absolute top-1/2 -translate-y-1/2 z-10 flex items-center pointer-events-none animate-pulse"
          style={arrowLeft ? { right: "100%", marginRight: 6, flexDirection: "row" } : { left: "100%", marginLeft: 6, flexDirection: "row-reverse" }}
        >
          <span className="whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-md"
                style={{ background: color.solid }}>
            Sign here
          </span>
          <span style={{
            width: 0, height: 0,
            borderTop: "6px solid transparent", borderBottom: "6px solid transparent",
            ...(arrowLeft ? { borderLeft: `7px solid ${color.solid}` } : { borderRight: `7px solid ${color.solid}` }),
          }} />
        </div>
      )}
      {!filled && f.h > 0.03 && (
        <span className="absolute top-0 left-0 flex items-center justify-center rounded-br"
              style={{ background: color.solid, width: 15, height: 15 }}>
          <Icon className="h-2.5 w-2.5 text-white" />
        </span>
      )}
      {filled && f.type === "signature" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.value!} alt="signature" className="max-h-full max-w-full object-contain" />
      ) : filled ? (
        <span className="px-1 text-xs truncate" style={{ color: "#111827" }}>{f.value}</span>
      ) : (
        <span className="flex items-center gap-1 pl-3.5 pr-1 text-[10px] font-medium truncate" style={{ color: color.text }}>
          <span className="truncate">{f.label || FIELD_LABEL[f.type]}</span>
        </span>
      )}

      {mode === "build" && selected && (
        <>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-neutral-800 text-white flex items-center justify-center shadow"
            aria-label="Delete field"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <span
            onPointerDown={onStartResize}
            className="absolute -bottom-1 -right-1 h-3 w-3 rounded-sm border border-white cursor-nwse-resize"
            style={{ background: color.solid }}
          />
        </>
      )}
    </div>
  );
}
