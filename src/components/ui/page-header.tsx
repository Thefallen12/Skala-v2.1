import * as React from "react";
import Link from "next/link";
import { Home } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface PageHeaderBreadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: PageHeaderBreadcrumb[];
  badge?: React.ReactNode;
  variant?: "card" | "plain";
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  badge,
  variant = "card",
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        variant === "card"
          ? "mb-3 rounded-xl border border-border bg-card px-3 py-2.5 text-card-foreground shadow-2xs sm:mb-5 sm:px-5 sm:py-4"
          : "mb-3 border-b border-border pb-3 sm:mb-5 sm:pb-4",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <Breadcrumb>
              <BreadcrumbList className="type-p3 gap-1 sm:gap-1.5">
                {breadcrumbs.map((item, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={`${item.label}-${index}`}>
                      <BreadcrumbItem>
                        {index === 0 ? (
                          <Home
                            className="size-3.5 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                        ) : null}
                        {item.href && !isLast ? (
                          <BreadcrumbLink asChild>
                            <Link href={item.href}>{item.label}</Link>
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage className="font-semibold">
                            {item.label}
                          </BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                      {!isLast ? <BreadcrumbSeparator /> : null}
                    </React.Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="type-h1 truncate text-foreground">{title}</h1>
            {badge}
          </div>

          {description ? (
            <p className="type-p2 line-clamp-2 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="grid w-full shrink-0 grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2 sm:justify-end [&>*:only-child]:col-span-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*]:flex-initial">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
