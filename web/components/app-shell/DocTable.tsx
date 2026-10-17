import Link from "next/link";
import { FileText, Stamp, Award } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, type StatusTone } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { type DocRow, type DocTone, relativeDate } from "@/lib/org-docs";

const TONE: Record<DocTone, StatusTone> = { green: "success", amber: "warning", gray: "neutral", red: "destructive" };
const KIND_ICON = { contract: FileText, seal: Stamp, credential: Award } as const;
const KIND_LABEL = { contract: "Signing request", seal: "Sealed file", credential: "Credential" } as const;

export function DocTable({ rows, empty }: { rows: DocRow[]; empty?: React.ReactNode }) {
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState icon={FileText} title="No documents yet" className="border-0" />}</>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden sm:table-cell">Signers</TableHead>
          <TableHead className="text-right">Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const Icon = KIND_ICON[r.kind];
          return (
            <TableRow key={r.id} className="relative">
              <TableCell className="max-w-0 w-full">
                <div className="flex items-center gap-3">
                  <Icon role="img" aria-label={KIND_LABEL[r.kind]} className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <Link href={r.href} className="block truncate font-medium after:absolute after:inset-0">
                      {r.title}
                    </Link>
                    {r.meta && <p className="truncate text-xs text-muted-foreground">{r.meta}</p>}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge tone={TONE[r.status.tone]}>{r.status.label}</StatusBadge>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {r.signers.length > 0 ? (
                  <div className="flex -space-x-1.5">
                    {r.signers.slice(0, 3).map((s, i) => (
                      <span key={i} className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-secondary text-[10px] font-medium">
                        {s.initials || "?"}
                      </span>
                    ))}
                    {r.signers.length > 3 && (
                      <span className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-secondary text-[10px] font-medium text-muted-foreground">
                        +{r.signers.length - 3}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">{relativeDate(r.date)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
