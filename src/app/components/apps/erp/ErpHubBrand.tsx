import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

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
    <header className="mb-6 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="h-1.5 bg-secondary" />
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Image
            src="/images/logos/icont%20logo%201.svg"
            alt="Skala Prioritas Engineering"
            width={53}
            height={48}
            priority
            className="h-12 w-[53px] shrink-0 object-contain"
          />
          <div className="min-w-0 border-l-2 border-secondary pl-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Skala Prioritas Engineering
            </p>
            <h1 className="mt-1 text-xl font-bold text-primary">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {description ??
                "Sistem operasional konstruksi dan logistik Skala Prioritas."}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
          <p className="font-semibold tracking-wide text-secondary">
            ADAPT, IMPROVISE AND FINISH
          </p>
          <p className="mt-1">Takengon, Aceh</p>
        </div>
      </div>
      {(breadcrumbs?.length || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
          {breadcrumbs?.length ? (
            <ol
              className="flex flex-wrap items-center gap-y-2"
              aria-label="Breadcrumb"
            >
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;

                return (
                  <li key={`${item.title}-${index}`} className="flex items-center">
                    {item.to && !isLast ? (
                      <Link
                        href={item.to}
                        className="text-sm text-muted-foreground hover:underline"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span
                        className="text-sm text-muted-foreground"
                        aria-current={isLast ? "page" : undefined}
                      >
                        {item.title}
                      </span>
                    )}
                    {!isLast && (
                      <span className="mx-2.5 h-1 w-1 rounded-full bg-muted-foreground" />
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
    </header>
  );
}
