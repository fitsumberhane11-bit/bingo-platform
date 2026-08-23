import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { TestMoneyBanner } from "@/components/layout/TestMoneyBanner";
import { MaintenanceBanner } from "@/components/layout/MaintenanceBanner";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TestMoneyBanner />
      <MaintenanceBanner />
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <BrandMark />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost">
              Log in
            </Link>
            <Link href="/register" className="btn-primary">
              Sign up
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>&copy; {new Date().getFullYear()} Ethiopia Bingo. All rights reserved.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/legal/terms" className="hover:text-slate-800">
              Terms
            </Link>
            <Link href="/legal/privacy" className="hover:text-slate-800">
              Privacy
            </Link>
            <Link href="/legal/responsible-gaming" className="hover:text-slate-800">
              Responsible Gaming
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
