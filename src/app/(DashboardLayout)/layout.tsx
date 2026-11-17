import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { loadAuthenticatedShellProps } from "@/lib/authenticated-shell-data";
import DashboardLayoutClient from "./DashboardLayoutClient";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/login");
  }

  const shellProps = await loadAuthenticatedShellProps(session.user);
  if (!shellProps) {
    redirect("/auth/login");
  }

  return <DashboardLayoutClient {...shellProps}>{children}</DashboardLayoutClient>;
}
