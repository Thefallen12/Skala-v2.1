import * as React from "react";
import { Inbox, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon | React.ReactNode;
  action?: React.ReactNode;
  variant?: "card" | "inline";
  className?: string;
}

function isRenderableIconComponent(
  value: unknown,
): value is LucideIcon {
  if (typeof value === "function") return true;
  if (typeof value === "object" && value !== null && "$$typeof" in value) {
    const candidate = value as { render?: unknown; type?: unknown };
    return (
      typeof candidate.render === "function" ||
      typeof candidate.type === "function"
    );
  }
  return false;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  variant = "card",
  className,
}: EmptyStateProps) {
  let renderedIcon: React.ReactNode;
  if (!icon) {
    renderedIcon = (
      <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
    );
  } else if (React.isValidElement(icon)) {
    renderedIcon = icon;
  } else if (isRenderableIconComponent(icon)) {
    const IconComponent = icon;
    renderedIcon = (
      <IconComponent
        className="size-6 text-muted-foreground"
        aria-hidden="true"
      />
    );
  } else {
    renderedIcon = null;
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "card"
          ? "rounded-xl border border-dashed border-border bg-card/60 px-4 py-8 sm:px-6 sm:py-10"
          : "px-4 py-8",
        className,
      )}
    >
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {renderedIcon}
      </div>
      <p className="type-h3 text-foreground">{title}</p>
      {description ? (
        <p className="type-p2 mt-1 max-w-md text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
