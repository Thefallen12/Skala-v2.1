import type { Metadata } from "next";
import { auth } from "../../auth";
import { loadAuthenticatedShellProps } from "@/lib/authenticated-shell-data";
import { PUBLIC_PAGES, absoluteUrl } from "@/lib/site-config";
import DashboardLayoutClient from "./(DashboardLayout)/DashboardLayoutClient";
import { DashboardHomeView } from "./components/dashboard/DashboardHomeView";
import { PublicHomePage } from "@/components/public/PublicHomePage";

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  if (session?.user?.id) {
    return {
      title: "Beranda",
      alternates: { canonical: absoluteUrl("/") },
    };
  }

  return {
    title: { absolute: PUBLIC_PAGES[0].title },
    description: PUBLIC_PAGES[0].description,
    alternates: { canonical: absoluteUrl("/") },
  };
}

export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) {
    const shellProps = await loadAuthenticatedShellProps(session.user);
    if (shellProps) {
      return (
        <DashboardLayoutClient {...shellProps}>
          <DashboardHomeView
            userId={session.user.id}
            userRole={session.user.role}
          />
        </DashboardLayoutClient>
      );
    }
  }

  return <PublicHomePage />;
}
