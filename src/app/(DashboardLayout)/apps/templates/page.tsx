import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { auth } from "../../../../../auth";
import { canManageUsers } from "@/lib/user-access";
import { prisma } from "@/lib/prisma";
import BreadcrumbComp from "../../layout/shared/breadcrumb/BreadcrumbComp";
import TemplateEditorHub from "@/app/components/apps/templates/TemplateEditorHub";

export const metadata: Metadata = {
  title: "Template Dokumen",
};

const templateRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.LOGISTICS,
  UserRole.FINANCE,
  UserRole.DRAFTER,
  UserRole.KOORDINATOR,
];

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!templateRoles.includes(session.user.role) && !canManageUsers(session.user.role)) {
    redirect("/");
  }

  const [{ edit }, templates] = await Promise.all([
    searchParams,
    prisma.documentTemplate.findMany({
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
        variables: true,
        updatedAt: true,
      },
    }),
  ]);
  const initialTemplate = edit
    ? await prisma.documentTemplate.findUnique({
        where: { id: edit },
        select: {
          id: true,
          name: true,
          type: true,
          contentHtml: true,
        },
      })
    : null;

  return (
    <>
      <BreadcrumbComp
        title="Template Dokumen"
        items={[
          { to: "/", title: "Beranda" },
          { title: "Document Generator & Template Editor" },
        ]}
      />
      <TemplateEditorHub
        templates={templates.map((template) => ({
          ...template,
          updatedAt: template.updatedAt.toISOString(),
        }))}
        initialEditId={edit}
        initialTemplate={initialTemplate ?? undefined}
      />
    </>
  );
}
