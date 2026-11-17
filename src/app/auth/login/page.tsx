import type { Metadata } from "next";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { Login } from "@/app/components/auth/Login";
import { WebMcpProvider } from "@/components/public/WebMcpProvider";
import { getRoleHomePath, sanitizeCallbackUrl } from "@/lib/role-home";
import { absoluteUrl } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Masuk ke Sistem",
  description:
    "Portal autentikasi resmi karyawan, tim lapangan, logistik, keuangan, dan direksi PT Skala Prioritas Engineering.",
  alternates: {
    canonical: absoluteUrl("/auth/login"),
  },
};

const page = async ({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) => {
    const [{ callbackUrl }, session] = await Promise.all([
      searchParams,
      auth(),
    ]);
    const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl);
    if (session?.user) {
        redirect(safeCallbackUrl ?? getRoleHomePath(session.user.role));
    }
    return (
      <>
        <WebMcpProvider />
        <Login callbackUrl={safeCallbackUrl ?? undefined} />
      </>
    );
}

export default page;