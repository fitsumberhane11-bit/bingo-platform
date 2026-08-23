import Link from "next/link";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const textSize = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  const boxSize = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <span
        className={`flex ${boxSize} items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 font-black text-white shadow-sm`}
      >
        B
      </span>
      <span className={`font-extrabold tracking-tight text-ink-900 ${textSize}`}>
        Ethiopia<span className="text-brand-600">Bingo</span>
      </span>
    </Link>
  );
}
