import Image from "next/image";
import { cn } from "@/lib/utils";

// Brand artwork made in Canva and processed by docs/brand/make_assets.py (see docs/brand/).
const WORDMARK_RATIO = 1450 / 335; // width / height of the trimmed wordmark PNGs

/** The Normie icon: a lime hand-drawn "m" on a rounded ink tile. Used where space is square. */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return <Image src="/brand/icon-192.png" alt="" aria-hidden width={size} height={size} className={cn("shrink-0", className)} priority />;
}

/**
 * The "nor·m·ie" wordmark.
 * tone="auto" follows the theme (ink + violet on light surfaces, off-white + lime on dark ones);
 * "light" / "dark" force one version for surfaces whose colour never changes (e.g. the footer).
 */
export function Wordmark({
  height = 22,
  tone = "auto",
  className,
}: {
  height?: number;
  tone?: "auto" | "light" | "dark";
  className?: string;
}) {
  const width = Math.round(height * WORDMARK_RATIO);
  const img = (src: string, extra?: string) => (
    <Image src={src} alt="normie" width={width} height={height} className={cn("shrink-0 select-none", extra)} draggable={false} priority />
  );
  return (
    <span className={cn("inline-flex items-center", className)}>
      {tone !== "dark" && img("/brand/wordmark-light.png", tone === "auto" ? "theme-light-only" : undefined)}
      {tone !== "light" && img("/brand/wordmark-dark.png", tone === "auto" ? "theme-dark-only" : undefined)}
    </span>
  );
}
