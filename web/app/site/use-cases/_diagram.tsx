import { FileText, Stamp, Anchor, Globe, ShieldCheck } from "lucide-react";

export function SealFlow({ input, form }: { input: string; form: string }) {
  const stages = [
    { icon: FileText, k: "Your file", d: input, tone: "ink" },
    { icon: Stamp, k: "Seal", d: `Signed over every byte · ${form}`, tone: "blue" },
    { icon: Anchor, k: "Anchor", d: "Bitcoin timestamp + public transparency log", tone: "blue" },
    { icon: Globe, k: "Proof page", d: "A permanent /d/… link travels with the file", tone: "ink" },
    { icon: ShieldCheck, k: "Anyone verifies", d: "Free, public, offline-capable — for anyone", tone: "green" },
  ] as const;

  return (
    <figure className="my-2">
      <div className="flex flex-col gap-0 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7 lg:flex-row lg:items-stretch lg:gap-0">
        {stages.map((s, i) => {
          const Icon = s.icon;
          const ring =
            s.tone === "blue"
              ? "bg-blue-50 text-blue-600 ring-blue-100"
              : s.tone === "green"
              ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
              : "bg-stone-100 text-stone-600 ring-stone-200";
          return (
            <div key={s.k} className="flex flex-1 items-stretch">
              <div className="flex flex-1 flex-col items-center gap-2.5 px-2 py-3 text-center">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-inset ${ring}`}>
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div>
                  <div className="text-[13.5px] font-semibold text-stone-900">{s.k}</div>
                  <div className="mt-1 text-[12.5px] leading-snug text-stone-500">{s.d}</div>
                </div>
              </div>
              {i < stages.length - 1 && (
                <>
                  <div className="hidden items-center lg:flex" aria-hidden>
                    <svg width="26" height="12" viewBox="0 0 26 12" className="text-stone-300">
                      <path d="M0 6h20M16 2l5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="flex w-full justify-center lg:hidden" aria-hidden>
                    <svg width="12" height="22" viewBox="0 0 12 22" className="text-stone-300">
                      <path d="M6 0v16M2 12l4 5 4-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <figcaption className="mt-3 text-center text-[13px] text-stone-500">
        The proof travels inside the file. Verification stands on the published root, the transparency log, and the
        Bitcoin ledger — so a court, a bank, or a counterparty can check it independently, forever.
      </figcaption>
    </figure>
  );
}
