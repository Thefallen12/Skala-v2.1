import type { Metadata } from "next";
import { auth } from "../../auth";
import { loadAuthenticatedShellProps } from "@/lib/authenticated-shell-data";
import {
  absoluteUrl,
  buildHomepageJsonLd,
  getPublicPageMeta,
} from "@/lib/site-config";
import DashboardLayoutClient from "./(DashboardLayout)/DashboardLayoutClient";
import { DashboardHomeView } from "./components/dashboard/DashboardHomeView";
import { JsonLdScript } from "@/components/public/JsonLdScript";
import { PublicHomePage } from "@/components/public/PublicHomePage";
import { WebMcpProvider } from "@/components/public/WebMcpProvider";

export async function generateMetadata(): Promise<Metadata> {
  const homeMeta = getPublicPageMeta("/");
  return {
    title: { absolute: homeMeta.title },
    description: homeMeta.description,
    alternates: { canonical: absoluteUrl("/") },
  };
}

export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) {
    const shellProps = await loadAuthenticatedShellProps(session.user);
    if (shellProps) {
      return (
        <>
          <JsonLdScript data={buildHomepageJsonLd()} />
          <WebMcpProvider />
          <DashboardLayoutClient {...shellProps}>
            <DashboardHomeView
              userId={session.user.id}
              userRole={session.user.role}
            />
          </DashboardLayoutClient>
        </>
      );
    }
  }

  return <PublicHomePage />;
}
