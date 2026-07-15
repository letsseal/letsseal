import { BadgeCheck, ShieldCheck, Anchor, ScrollText } from "lucide-react";
import type { Lane } from "./_data";

export function ProofPreview({ label, lane }: { label: string; lane: Lane }) {
  const kind = lane === "media" ? "Asset" : lane === "software" ? "Artifact" : "Document";
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-[12.5px] font-medium text-emerald-800">
        <BadgeCheck className="h-4 w-4 shrink-0" /> Issuer verified — controls letsseal.org
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">
          <ShieldCheck className="h-[18px] w-[18px] text-blue-600" /> Authentic &amp; unaltered
        </div>
        <dl className="mt-4 divide-y divide-stone-100 text-[13px]">
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-stone-500">{kind}</dt>
            <dd className="text-right font-medium text-stone-800">{label}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-stone-500">Issuer</dt>
            <dd className="flex flex-wrap items-center justify-end gap-1.5 text-right font-medium text-stone-800">
              Let&rsquo;s Seal Examples
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <BadgeCheck className="h-3 w-3" />letsseal.org
              </span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-stone-500">SHA-256</dt>
            <dd className="font-mono text-[12px] text-stone-400">64-hex fingerprint ✓</dd>
          </div>
        </dl>
        <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-3 text-[12.5px] text-stone-600">
          <p className="flex items-center gap-2"><Anchor className="h-3.5 w-3.5 text-blue-600" /> Anchored on Bitcoin</p>
          <p className="flex items-center gap-2"><ScrollText className="h-3.5 w-3.5 text-blue-600" /> Recorded in the public transparency log</p>
        </div>
      </div>
      <div className="border-t border-stone-100 bg-stone-50 px-4 py-2 text-[11.5px] text-stone-500">
        Public and free to verify — by anyone, with standard tools.
      </div>
    </div>
  );
}
