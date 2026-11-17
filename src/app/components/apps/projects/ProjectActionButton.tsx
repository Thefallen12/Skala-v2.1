"use client";

import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProjectActionButtonProps extends Omit<ButtonProps, "children"> {
  label: string;
  icon: ReactNode;
}

export default function ProjectActionButton({
  label,
  icon,
  size = "sm",
  className,
  ...props
}: ProjectActionButtonProps) {
  return (
    <Button
      size={size}
      {...props}
      aria-label={props["aria-label"] ?? label}
      title={props.title ?? label}
      className={cn(
        "min-h-11 min-w-11 px-0 sm:min-h-8 sm:min-w-0 sm:px-3",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        {icon}
      </span>
      <span className="sr-only sm:not-sr-only">{label}</span>
    </Button>
  );
}
