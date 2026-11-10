import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Home } from "lucide-react";

export default function ErpHubBrand({
  title,
  description,
  breadcrumbs,
  action,
}: {
  title: string;
  description?: string;
  breadcrumbs?: { title: string; to?: string }[];
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xs sm:mb-5">
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
        <div className="min-w-0 space-y-1">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <ol
              className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
              aria-label="Breadcrumb"
            >
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <li
                    key={`${item.title}-${index}`}
                    className="flex items-center gap-1"
                  >
                    {index === 0 && (
                      <Home className="size-3 shrink-0 text-primary" />
                    )}
                    {item.to && !isLast ? (
                      <Link
                        href={item.to}
                        className="font-medium text-muted-foreground transition hover:text-primary"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span
                        className="font-semibold text-foreground/85"
                        aria-current={isLast ? "page" : undefined}
                      >
                        {item.title}
                      </span>
                    )}
                    {!isLast && (
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
              {title}
            </h1>
          </div>
          {description && (
            <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">
              {description}
            </p>
          )}
        </div>

        {action && (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {action}
          </div>
        )}
      </div>
    </header>
  );
}
