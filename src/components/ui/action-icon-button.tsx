import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ActionIconButtonProps = {
  label: string;
  tooltip?: string;
  icon: LucideIcon;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  onLinkClick?: React.MouseEventHandler<HTMLAnchorElement>;
  href?: string;
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;
  disabled?: boolean;
  "aria-pressed"?: boolean;
  variant?: ButtonProps["variant"];
  className?: string;
  type?: ButtonProps["type"];
};

export function ActionIconButton({
  label,
  tooltip,
  icon: Icon,
  onClick,
  onLinkClick,
  href,
  target,
  rel,
  disabled,
  "aria-pressed": ariaPressed,
  variant = "outline",
  className,
  type = "button",
}: ActionIconButtonProps) {
  const resolvedTooltip = tooltip ?? label;
  const trigger = href ? (
    <Button
      asChild
      type={type}
      size="icon"
      variant={variant}
      disabled={disabled}
      className={cn(
        "h-10 w-10 rounded-md border border-primary/75 bg-transparent text-primary transition-colors hover:bg-primary hover:text-primary-foreground",
        className,
      )}
    >
      <Link
        href={href}
        target={target}
        rel={rel}
        aria-label={label}
        onClick={onLinkClick}
      >
        <Icon className="size-4" aria-hidden="true" />
      </Link>
    </Button>
  ) : (
    <Button
      type={type}
      size="icon"
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={ariaPressed}
      className={cn(
        "h-10 w-10 rounded-md border border-primary/75 bg-transparent text-primary transition-colors hover:bg-primary hover:text-primary-foreground",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent>{resolvedTooltip}</TooltipContent>
    </Tooltip>
  );
}
