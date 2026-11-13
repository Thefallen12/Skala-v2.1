import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { Login } from "@/app/components/auth/Login";
import { getRoleHomePath, sanitizeCallbackUrl } from "@/lib/role-home";

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
    return <Login callbackUrl={safeCallbackUrl ?? undefined} />;
}

export default page;