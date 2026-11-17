import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";

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
    <PageHeader
      title={title}
      description={description}
      breadcrumbs={breadcrumbs?.map((item) => ({
        label: item.title,
        href: item.to,
      }))}
      actions={action}
    />
  );
}
