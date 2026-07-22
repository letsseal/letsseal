import { serif } from "./ui";

export function XowxWordmark({ className = "text-[19px]" }: { className?: string }) {
  return (
    <span className={`${serif} inline-flex flex-col uppercase leading-[0.95] ${className}`} aria-label="Experimental Open Works">
      <span className="text-[0.328em] font-medium leading-none tracking-[0.02em]">Experimental</span>
      <span className="mt-[0.18em] text-[1em] font-medium tracking-tight">Open</span>
      <span className="text-[1em] font-medium tracking-tight">Works</span>
    </span>
  );
}
