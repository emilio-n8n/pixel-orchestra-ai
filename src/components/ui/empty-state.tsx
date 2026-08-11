import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center text-center ${
        compact ? "gap-2 p-6" : "gap-3 p-10"
      }`}
    >
      {Icon ? (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-dim)]">
          <Icon size={17} strokeWidth={1.6} />
        </div>
      ) : null}
      <div className="text-[13px] font-medium text-[var(--text)]">{title}</div>
      {description ? (
        <p className="max-w-[34ch] text-[12px] leading-relaxed text-[var(--text-dim)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}