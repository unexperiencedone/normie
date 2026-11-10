import { cn } from "@/lib/utils";

// macOS window controls, left to right: close (red), minimise (yellow-orange), expand (green).
const LIGHTS = [
  { label: "Close", color: "#ff5f57", edge: "#e0443e", glyph: "M3 3l4 4M7 3L3 7" },
  { label: "Minimise", color: "#febc2e", edge: "#dea123", glyph: "M2.5 5h5" },
  { label: "Expand", color: "#28c840", edge: "#1aab29", glyph: "M5 2.5v5M2.5 5h5" },
];

/**
 * Decorative window controls. Grey at rest; they take their colours when the pointer is over the
 * surrounding window (an ancestor with the `group/window` class), like a Mac window gaining focus,
 * and show their ×, −, + symbols when the pointer is on the controls themselves.
 */
export function TrafficLights({ size = 11, rest = "bg-border-strong", className }: { size?: number; rest?: string; className?: string }) {
  return (
    <div aria-hidden className={cn("group/lights flex gap-1.5", className)}>
      {LIGHTS.map((l) => (
        <span
          key={l.label}
          className={cn("grid place-items-center rounded-full transition-[background-color,box-shadow] duration-200 group-hover/window:bg-[var(--light)] group-hover/window:shadow-[inset_0_0_0_0.5px_var(--edge)]", rest)}
          style={{ width: size, height: size, ["--light" as string]: l.color, ["--edge" as string]: l.edge }}
        >
          <svg viewBox="0 0 10 10" className="size-[70%] opacity-0 transition-opacity duration-150 group-hover/lights:opacity-100" fill="none" stroke="rgb(0 0 0 / 0.55)" strokeWidth="1.3" strokeLinecap="round">
            <path d={l.glyph} />
          </svg>
        </span>
      ))}
    </div>
  );
}
