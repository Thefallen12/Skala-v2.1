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
  const currentTime = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(".", ":");
  const currentDate = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className="flex min-w-0 flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xs sm:p-5">
      <div className="flex min-w-0 flex-1 items-center gap-3.5 sm:gap-4">
        <Avatar className="size-11 shrink-0 rounded-lg border border-border sm:size-14">
          <AvatarImage src={profilePhotoUrl ?? undefined} alt={name} className="object-cover" />
          <AvatarFallback className="type-p2 rounded-lg bg-[#0F2C59] font-bold text-white">
            {initials || "SP"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="type-p3 flex items-center gap-2 text-muted-foreground">
            <span>Portal Operasional</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-primary">{roleLabels[role]}</span>
          </div>
          <h1 className="type-h1 truncate text-foreground">
            {name}
          </h1>
          <p className="type-p3 hidden text-muted-foreground sm:block">
            Sistem Pemantauan Proyek, Tiket &amp; Logistik PT Skala Prioritas Engineering
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="type-kpi font-mono text-foreground">
          {currentTime}{" "}
          <span className="type-p3 font-sans font-normal text-muted-foreground">
            WIB
          </span>
        </p>
        <CurrentLocation />
        <p className="type-p3 mt-0.5 whitespace-nowrap text-muted-foreground">
          {currentDate}
        </p>
      </div>
    </div>
  );
};

export default ProfileWelcome;
