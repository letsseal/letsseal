import Link from "next/link";
import { FileText, Stamp, Award, Anchor, Clock } from "lucide-react";
import { type DocRow, relativeDate } from "@/lib/org-docs";

const TONE: Record<string, string> = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  gray: "bg-secondary text-muted-foreground",
  red: "bg-red-100 text-red-700",
};

const KIND_ICON = { contract: FileText, seal: Stamp, credential: Award } as const;

export function DocTable({ rows, emptyText }: { rows: DocRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return (
      <div className="p-12 text-center">
        <FileText className="mx-auto h-9 w-9 text-muted-foreground/40" />
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-5 py-3 font-semibold">Document</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold">Signers</th>
            <th className="px-3 py-3 font-semibold">Anchor</th>
            <th className="px-5 py-3 text-right font-semibold">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const Icon = KIND_ICON[r.kind];
            return (
              <tr key={r.id} className="group transition-colors hover:bg-secondary/50">
                <td className="px-5 py-3.5">
                  <Link href={r.href} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground group-hover:text-primary">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.meta}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONE[r.status.tone]}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                    {r.status.label}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  {r.signers.length > 0 ? (
                    <span className="flex -space-x-1.5">
                      {r.signers.slice(0, 3).map((s, i) => (
                        <span key={i} className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary ring-2 ring-card">
                          {s.initials || "?"}
                        </span>
                      ))}
                      {r.signers.length > 3 && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
                          +{r.signers.length - 3}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3.5 text-xs">
                  {r.anchor?.state === "confirmed" ? (
                    <span className="inline-flex items-center gap-1.5 text-orange-600"><Anchor className="h-3.5 w-3.5" />#{r.anchor.block}</span>
                  ) : r.anchor?.state === "pending" ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-600"><Clock className="h-3.5 w-3.5" />Confirming…</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">{relativeDate(r.date)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
