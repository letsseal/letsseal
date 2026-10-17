import { Wordmark } from "@/components/brand/Wordmark";

export function TopBar({
  right,
  href = "/app",
}: { right?: React.ReactNode; href?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
        <Wordmark href={href} size="md" />
        {right}
      </div>
    </header>
  );
}
