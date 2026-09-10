import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-black/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-xs font-bold text-black">
            Φ
          </span>
          <span>
            FONI MOU <span className="text-zinc-500 font-normal">· Η Φωνή Μου</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-zinc-400">
          <Link href="/app" className="hover:text-amber-400">
            Studio
          </Link>
          <Link href="/settings" className="hover:text-amber-400">
            Ρυθμίσεις
          </Link>
        </nav>
      </div>
    </header>
  );
}
