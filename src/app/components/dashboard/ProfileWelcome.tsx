import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserRole } from "@prisma/client";
import CurrentLocation from "./CurrentLocation";

const roleLabels: Record<UserRole, string> = {
  [UserRole.DIRECTOR]: "Direktur Utama",
  [UserRole.DEPUTY_DIRECTOR]: "Wakil Direktur",
  [UserRole.DRAFTER]: "Tim Drafter (DED)",
  [UserRole.FINANCE]: "Divisi Keuangan",
  [UserRole.LOGISTICS]: "Divisi Logistik & Armada",
  [UserRole.KOORDINATOR]: "Koordinator Lapangan",
  [UserRole.FIELD_TEAM]: "Tim Lapangan & Mandor",
  [UserRole.MOVER]: "Tim Pengiriman (Mover)",
  [UserRole.ADMINISTRATIONS]: "Administrator Sistem",
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
    hour12: false,
  }).format(now);
  const currentDate = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className="flex min-w-0 flex-row items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex min-w-0 flex-1 items-center gap-3.5 sm:gap-4">
        <Avatar className="size-11 shrink-0 rounded-lg border border-slate-200 sm:size-14 dark:border-slate-700">
          <AvatarImage src={profilePhotoUrl ?? undefined} alt={name} className="object-cover" />
          <AvatarFallback className="rounded-lg bg-[#0F2C59] font-bold text-white text-sm">
            {initials || "SP"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Portal Operasional</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#F26522]">{roleLabels[role]}</span>
          </div>
          <h1 className="truncate text-base font-bold text-slate-900 dark:text-white sm:text-xl">
            {name}
          </h1>
          <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
            Sistem Pemantauan Proyek, Tiket &amp; Logistik PT Skala Prioritas Engineering
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white sm:text-lg">
          {currentTime} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">WIB</span>
        </p>
        <CurrentLocation />
        <p className="mt-0.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
          {currentDate}
        </p>
      </div>
    </div>
  );
};

export default ProfileWelcome;
