import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserRole } from "@prisma/client";

const roleLabels: Record<UserRole, string> = {
  [UserRole.DIRECTOR]: "Direktur",
  [UserRole.DEPUTY_DIRECTOR]: "Wakil Direktur",
  [UserRole.DRAFTER]: "Administrasi Dokumen",
  [UserRole.FINANCE]: "Keuangan",
  [UserRole.LOGISTICS]: "Logistik",
  [UserRole.KOORDINATOR]: "Koordinator Lapangan",
  [UserRole.FIELD_TEAM]: "Tim Lapangan",
  [UserRole.MOVER]: "Pengiriman",
  [UserRole.ADMINISTRATIONS]: "Administrasi",
};

const ProfileWelcome = ({
  name,
  role,
  profilePhotoUrl,
}: {
  name: string;
  role: UserRole;
  profilePhotoUrl: string | null;
}) => {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("id-ID");
  const now = new Date();
  const currentTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const currentDate = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className="dashboard-enter flex min-w-0 flex-col gap-4 rounded-2xl border border-orange-200 bg-gradient-to-r from-white via-orange-50 to-indigo-50 p-4 shadow-sm dark:border-slate-700/80 dark:from-[#1e293b] dark:via-[#1e293b] dark:to-[#1e1b4b] sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-6">
      <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-5">
        <div className="relative shrink-0">
          <Avatar className="size-12 border-2 border-orange-500/50 sm:size-16">
            <AvatarImage src={profilePhotoUrl ?? undefined} alt={name} />
            <AvatarFallback className="bg-orange-500/10 font-semibold text-orange-600 dark:text-orange-300">
              {initials || "SP"}
            </AvatarFallback>
          </Avatar>
          <span
            className="absolute bottom-0 right-0 size-4 rounded-full border-2 border-white bg-emerald-500 dark:border-[#1e293b]"
            aria-label="Aktif"
          />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 break-words text-base font-bold leading-snug text-slate-900 dark:text-white sm:text-xl">
              Selamat datang, {name}
            </h1>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
              Aktif
            </span>
          </div>
          <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            {roleLabels[role]} · Ringkasan operasional konstruksi
          </p>
        </div>
      </div>
      <div className="w-full min-w-0 sm:ml-auto sm:w-auto sm:text-right">
        <p className="text-lg font-bold text-slate-900 dark:text-white">
          {currentTime} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">WIB</span>
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {currentDate}
        </p>
      </div>
    </div>
  );
};

export default ProfileWelcome;
