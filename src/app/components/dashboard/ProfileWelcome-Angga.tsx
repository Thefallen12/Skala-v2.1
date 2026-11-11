import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserRole } from "@prisma/client";
import CurrentLocation from "./CurrentLocation";

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
    <div className="dashboard-enter flex min-w-0 flex-row items-start justify-between gap-2 rounded-2xl border border-orange-200 bg-gradient-to-r from-white via-orange-50 to-indigo-50 px-3 py-4 shadow-sm dark:border-slate-700/80 dark:from-[#1e293b] dark:via-[#1e293b] dark:to-[#1e1b4b] sm:items-center sm:gap-5 sm:p-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-5">
        <div className="relative shrink-0">
          <Avatar className="size-10 border-2 border-orange-500/50 sm:size-16">
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
        <div className="flex h-10 min-w-0 flex-1 flex-col justify-between sm:h-auto sm:flex-none sm:justify-normal">
          <span className="block text-[9px] font-medium leading-3 text-slate-500 dark:text-slate-400 sm:hidden">
            Selamat datang
          </span>
          <h1 className="truncate !text-[11px] font-bold leading-4 text-slate-900 dark:text-white sm:whitespace-normal sm:!text-xl">
            <span className="hidden sm:inline">Selamat datang, </span>
            {name}
          </h1>
          <div className="flex min-w-0 items-center gap-1.5 sm:hidden">
            <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-medium leading-[10px] text-emerald-600 dark:text-emerald-300">
              Aktif
            </span>
            <span
              className="truncate text-[9px] leading-3 text-slate-500 dark:text-slate-400"
              title={roleLabels[role]}
            >
              {roleLabels[role]}
            </span>
          </div>
          <div className="hidden min-w-0 items-center gap-x-2 gap-y-1 sm:flex">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
              Aktif
            </span>
            <p className="break-words text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
              {roleLabels[role]} · Ringkasan operasional konstruksi
            </p>
          </div>
        </div>
      </div>
      <div className="w-[min(14rem,58vw)] shrink-0 text-right sm:ml-auto sm:w-auto">
        <p className="text-sm font-bold text-slate-900 dark:text-white sm:text-lg">
          {currentTime} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">WIB</span>
        </p>
        <CurrentLocation />
        <p className="mt-1 whitespace-nowrap text-[9px] leading-tight text-slate-500 dark:text-slate-400 sm:text-sm">
          {currentDate}
        </p>
      </div>
    </div>
  );
};

export default ProfileWelcome;
