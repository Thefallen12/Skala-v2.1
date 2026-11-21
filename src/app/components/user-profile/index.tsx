"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  FolderKanban,
  Pencil,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  ProjectStatus,
  TicketStatus,
  TicketType,
  WorkTaskStatus,
} from "@prisma/client";
import {
  changeMyPassword,
  updateMyProfile,
  type ProfileActionResult,
} from "@/app/actions/profile";
import CardBox from "@/app/components/shared/CardBox";
import PushNotificationSettings from "./PushNotificationSettings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { DialogFooter } from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProfileProject = {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  leader: string | null;
  updatedAt: string;
};

type ProfileTask = {
  id: string;
  title: string;
  status: WorkTaskStatus;
  updatedAt: string;
  projectId: string;
  projectName: string;
};

type ProfileTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  type: TicketType;
  status: TicketStatus;
  totalAmount: string | null;
  createdAt: string;
  projectName: string | null;
};

export type UserProfileData = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  taskCount: number;
  completedTaskCount: number;
  completedProjectCount: number;
  projects: ProfileProject[];
  tasks: ProfileTask[];
  tickets: ProfileTicket[];
};

const roleLabels: Record<string, string> = {
  DIRECTOR: "Direktur",
  DEPUTY_DIRECTOR: "Wakil Direktur",
  DRAFTER: "Drafter",
  FINANCE: "Keuangan",
  LOGISTICS: "Koordinator Logistik",
  KOORDINATOR: "Koordinator Lapangan",
  FIELD_TEAM: "Tim Lapangan",
  MOVER: "Mover",
  ADMINISTRATIONS: "Administrasi",
};

const projectStatusLabels: Record<ProjectStatus, string> = {
  PENDING_SETUP: "Menunggu Setup",
  RUNNING: "Berjalan",
  PENDING: "Menunggu Setup",
  ON_PROGRESS: "Berjalan",
  TERHAMBAT: "Terhambat",
  DONE: "Selesai",
  PLANNED: "Menunggu Setup",
  ACTIVE: "Berjalan",
  ON_HOLD: "Ditunda",
  COMPLETED: "Selesai",
};

const taskStatusLabels: Record<WorkTaskStatus, string> = {
  TODO: "Belum dimulai",
  IN_PROGRESS: "Berjalan",
  DONE: "Selesai",
};

const ticketStatusLabels: Record<TicketStatus, string> = {
  DRAFT: "Draft",
  PENDING_DIRECTOR: "Menunggu Direktur",
  APPROVED_DIR: "Disetujui Direktur",
  PROCESSED_FINANCE: "Diproses Keuangan",
  PROCESSED_LOGISTIC: "Diproses Logistik",
  PENDING_LOGISTIK: "Menunggu Logistik",
  ASSIGNED_TO_MOVER: "Ditugaskan ke Mover",
  IN_TRANSIT: "Dalam perjalanan (ekspedisi)",
  WAITING_FINANCE_PAYMENT: "Menunggu Pembayaran",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
};

const ticketTypeLabels: Record<TicketType, string> = {
  MATERIAL: "Material",
  COST: "Biaya",
  OPERATIONAL: "Operasional",
};

function formatCurrency(value: string | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("id-ID") ?? "")
    .join("");
}

function formatActivityTime(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date));
}

const VALID_USER_PROFILE_TABS = new Set([
  "account",
  "security",
  "billing",
  "notifications",
  "connections",
]);

export default function UserProfile({
  profile,
  initialTab = "account",
}: {
  profile: UserProfileData;
  initialTab?: string;
}) {
  const defaultTab = VALID_USER_PROFILE_TABS.has(initialTab)
    ? initialTab
    : "account";
  const [projectQuery, setProjectQuery] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [profileMessage, setProfileMessage] =
    useState<ProfileActionResult | null>(null);
  const [passwordMessage, setPasswordMessage] =
    useState<ProfileActionResult | null>(null);
  const [passwordVisibility, setPasswordVisibility] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [isSavingProfile, startProfileTransition] = useTransition();
  const [isSavingPassword, startPasswordTransition] = useTransition();
  const router = useRouter();
  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLocaleLowerCase("id-ID");
    if (!query) return profile.projects;
    return profile.projects.filter((project) =>
      `${project.name} ${project.code}`.toLocaleLowerCase("id-ID").includes(query),
    );
  }, [profile.projects, projectQuery]);

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileMessage(null);
    const formData = new FormData(event.currentTarget);
    if (photoFiles[0]) {
      formData.set("profilePhoto", photoFiles[0]);
    }
    startProfileTransition(async () => {
      const result = await updateMyProfile(formData);
      setProfileMessage(result);
      if (result.success) {
        toast.success(result.message);
        setPhotoFiles([]);
        setEditOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    startPasswordTransition(async () => {
      const result = await changeMyPassword(formData);
      setPasswordMessage(result);
      if (result.success) {
        toast.success(result.message);
        form.reset();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <>
    <div className="my-4 grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)]">
      <CardBox className="h-fit p-5">
        <div className="flex flex-col items-center text-center">
          <Avatar className="size-20 border border-border bg-muted">
            <AvatarImage
              src={profile.profilePhotoUrl ?? "/images/profile/user-1.jpg"}
              alt=""
            />
            <AvatarFallback className="text-xl font-semibold text-primary">
              {getInitials(profile.name)}
            </AvatarFallback>
          </Avatar>
          <h2 className="type-h2 mt-3 text-foreground">{profile.name}</h2>
          <Badge variant="secondary" className="mt-1">
            {roleLabels[profile.role] ?? profile.role}
          </Badge>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border p-3 text-center">
            <CheckCircle2 className="mx-auto size-4 text-success" aria-hidden="true" />
            <p className="type-kpi mt-1 text-foreground">
              {profile.completedTaskCount}
            </p>
            <p className="type-p3 text-muted-foreground">Tugas selesai</p>
          </div>
          <div className="rounded-md border border-border p-3 text-center">
            <BriefcaseBusiness className="mx-auto size-4 text-primary" aria-hidden="true" />
            <p className="type-kpi mt-1 text-foreground">
              {profile.completedProjectCount}
            </p>
            <p className="type-p3 text-muted-foreground">Proyek selesai</p>
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <h3 className="type-h3 text-foreground">Detail akun</h3>
          <dl className="type-p3 mt-3 space-y-3">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Nama pengguna</dt>
              <dd className="max-w-[58%] truncate text-right" title={profile.name}>
                {profile.name}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="max-w-[58%] truncate text-right" title={profile.email}>
                {profile.email}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="flex items-center gap-1.5">
                <span
                  className={`size-1.5 rounded-full ${
                    profile.isActive ? "bg-success" : "bg-warning"
                  }`}
                />
                {profile.isActive ? "Aktif" : "Nonaktif"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Telepon</dt>
              <dd>{profile.phone || "Belum diisi"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Terdaftar</dt>
              <dd>
                {new Intl.DateTimeFormat("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Asia/Jakarta",
                }).format(new Date(profile.createdAt))}
              </dd>
            </div>
          </dl>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-5 w-full"
            onClick={() => {
              setProfileMessage(null);
              setPhotoFiles([]);
              setEditOpen(true);
            }}
          >
            <Pencil className="mr-2 size-3.5" aria-hidden="true" />
            Edit profil
          </Button>
          {profileMessage?.success && (
            <p role="status" className="type-p3 mt-2 text-center text-success">
              {profileMessage.message}
            </p>
          )}
        </div>
      </CardBox>

      <Tabs defaultValue={defaultTab} className="min-w-0 space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted p-1 sm:grid-cols-5">
          <TabsTrigger value="account">Akun</TabsTrigger>
          <TabsTrigger value="security">Keamanan</TabsTrigger>
          <TabsTrigger value="billing">Rekening &amp; Tiket</TabsTrigger>
          <TabsTrigger value="notifications">Notifikasi</TabsTrigger>
          <TabsTrigger value="connections">Koneksi</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-0 space-y-4">
          <CardBox className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="type-h3 text-foreground">Daftar proyek</h2>
                <p className="type-p3 mt-0.5 text-muted-foreground">
                  Proyek yang ditugaskan kepada Anda
                </p>
              </div>
              <div className="relative w-full sm:w-52">
                <Input
                  aria-label="Cari proyek"
                  placeholder="Cari proyek"
                  value={projectQuery}
                  onChange={(event) => setProjectQuery(event.target.value)}
                />
              </div>
            </div>
            {filteredProjects.length ? (
              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proyek</TableHead>
                    <TableHead className="hidden md:table-cell">PIC</TableHead>
                    <TableHead className="min-w-32">Status &amp; progres</TableHead>
                    <TableHead className="w-12 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.slice(0, 8).map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="max-w-56">
                        <p className="type-p2 truncate font-medium" title={project.name}>
                          {project.name}
                        </p>
                        <p className="type-p3 mt-0.5 text-muted-foreground">
                          {project.code}
                        </p>
                      </TableCell>
                      <TableCell className="type-p3 hidden text-muted-foreground md:table-cell">
                        {project.leader || "Belum ditentukan"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={project.progress} className="h-1.5" />
                          <span className="type-p3 w-9 text-right text-muted-foreground">
                            {Math.round(project.progress)}%
                          </span>
                        </div>
                        <p className="type-p3 mt-1 text-muted-foreground">
                          {projectStatusLabels[project.status]}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        <ActionIconButton
                          label={`Buka proyek ${project.name}`}
                          tooltip={`Buka proyek ${project.name}`}
                          icon={FolderKanban}
                          href="/apps/habits?tab=calendar"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4">
                <EmptyState
                  variant="inline"
                  icon={FolderKanban}
                  title={
                    projectQuery
                      ? "Proyek tidak ditemukan"
                      : "Belum ada proyek"
                  }
                  description={
                    projectQuery
                      ? "Ubah kata kunci pencarian Anda."
                      : "Belum ada proyek yang ditugaskan kepada Anda."
                  }
                />
              </div>
            )}
            <div className="type-p3 flex items-center justify-between border-t border-border px-4 py-2.5 text-muted-foreground">
              <span>
                Menampilkan {Math.min(filteredProjects.length, 8)} dari{" "}
                {filteredProjects.length} proyek
              </span>
              <Link
                href="/apps/habits?tab=calendar"
                className="font-medium text-primary hover:underline"
              >
                Buka jadwal <ArrowRight className="ml-1 inline size-3" aria-hidden="true" />
              </Link>
            </div>
          </CardBox>

          <CardBox className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="type-h3 text-foreground">Aktivitas tugas</h2>
                <p className="type-p3 mt-0.5 text-muted-foreground">
                  Aktivitas tugas terbaru yang terkait dengan akun Anda
                </p>
              </div>
              <Link
                href="/apps/habits?tab=tasks"
                className="type-p3 shrink-0 font-medium text-primary hover:underline"
              >
                Semua tugas <ArrowRight className="ml-1 inline size-3" aria-hidden="true" />
              </Link>
            </div>
            {profile.tasks.length ? (
              <ol className="mt-4 space-y-0">
                {profile.tasks.map((task, index) => (
                  <li key={task.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < profile.tasks.length - 1 && (
                      <span className="absolute bottom-0 left-[7px] top-4 w-px bg-border" />
                    )}
                    <span
                      className={`relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                        task.status === WorkTaskStatus.DONE
                          ? "border-success bg-success text-success-foreground"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {task.status === WorkTaskStatus.DONE ? (
                        <CheckCircle2 className="size-3" />
                      ) : (
                        <Clock3 className="size-2.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <p className="type-p2 font-medium">{task.title}</p>
                        <time
                          dateTime={task.updatedAt}
                          className="type-p3 text-muted-foreground"
                        >
                          {formatActivityTime(task.updatedAt)}
                        </time>
                      </div>
                      <p className="type-p3 mt-1 text-muted-foreground">
                        {task.projectName} · {taskStatusLabels[task.status]}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                variant="inline"
                icon={FolderKanban}
                title="Belum ada aktivitas tugas"
                description="Tugas yang terkait dengan akun Anda akan muncul di sini."
                className="mt-4"
              />
            )}
          </CardBox>
        </TabsContent>

        <TabsContent value="security" className="mt-0 space-y-4">
          <CardBox className="p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="rounded-md bg-success/10 p-2 text-success">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="type-h3 text-foreground">Ubah kata sandi</h2>
                <p className="type-p3 mt-1 text-muted-foreground">
                  Minimal 6 karakter, dengan huruf besar, huruf kecil, angka, dan simbol.
                </p>
              </div>
            </div>
            <form className="space-y-4" onSubmit={submitPassword}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Kata sandi saat ini</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      name="currentPassword"
                      type={passwordVisibility.current ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      disabled={isSavingPassword}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={passwordVisibility.current ? "Sembunyikan kata sandi saat ini" : "Tampilkan kata sandi saat ini"}
                      onClick={() =>
                        setPasswordVisibility((visibility) => ({
                          ...visibility,
                          current: !visibility.current,
                        }))
                      }
                    >
                      {passwordVisibility.current ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Kata sandi baru</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      name="newPassword"
                      type={passwordVisibility.new ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      disabled={isSavingPassword}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={passwordVisibility.new ? "Sembunyikan kata sandi baru" : "Tampilkan kata sandi baru"}
                      onClick={() =>
                        setPasswordVisibility((visibility) => ({
                          ...visibility,
                          new: !visibility.new,
                        }))
                      }
                    >
                      {passwordVisibility.new ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="confirmPassword">Konfirmasi kata sandi baru</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={passwordVisibility.confirm ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      disabled={isSavingPassword}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={passwordVisibility.confirm ? "Sembunyikan konfirmasi kata sandi" : "Tampilkan konfirmasi kata sandi"}
                      onClick={() =>
                        setPasswordVisibility((visibility) => ({
                          ...visibility,
                          confirm: !visibility.confirm,
                        }))
                      }
                    >
                      {passwordVisibility.confirm ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {passwordMessage && (
                <p
                  role={passwordMessage.success ? "status" : "alert"}
                  className={`text-xs ${
                    passwordMessage.success ? "text-success" : "text-destructive"
                  }`}
                >
                  {passwordMessage.message}
                </p>
              )}
              <Button type="submit" size="sm" disabled={isSavingPassword}>
                {isSavingPassword ? "Menyimpan..." : "Simpan perubahan"}
              </Button>
            </form>
          </CardBox>
          <CardBox className="p-5">
            <h2 className="type-h3 text-foreground">Aktivitas keamanan</h2>
            <p className="type-p3 mt-1 text-muted-foreground">
              Login terakhir:{" "}
              {profile.lastLoginAt
                ? formatActivityTime(profile.lastLoginAt)
                : "Belum tersedia"}
            </p>
          </CardBox>
        </TabsContent>

        <TabsContent value="billing" className="mt-0 space-y-4">
          <CardBox className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="type-h3 text-foreground">Informasi rekening</h2>
                <p className="type-p3 mt-1 text-muted-foreground">
                  Rekening tujuan pembayaran untuk akun Anda.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setProfileMessage(null);
                  setPhotoFiles([]);
                  setEditOpen(true);
                }}
              >
                <Pencil className="mr-2 size-3.5" aria-hidden="true" />
                Edit rekening
              </Button>
            </div>
            {profile.bankName && profile.bankAccountName && profile.bankAccountNumber ? (
              <dl className="mt-4 grid gap-4 rounded-md border border-border p-4 sm:grid-cols-3">
                <div>
                  <dt className="type-p3 text-muted-foreground">Nama bank</dt>
                  <dd className="type-p2 mt-1 font-medium">{profile.bankName}</dd>
                </div>
                <div>
                  <dt className="type-p3 text-muted-foreground">Nama pemilik rekening</dt>
                  <dd className="type-p2 mt-1 font-medium">{profile.bankAccountName}</dd>
                </div>
                <div>
                  <dt className="type-p3 text-muted-foreground">Nomor rekening</dt>
                  <dd className="type-p2 mt-1 break-all font-medium">
                    {profile.bankAccountNumber}
                  </dd>
                </div>
              </dl>
            ) : (
              <EmptyState
                variant="inline"
                title="Rekening belum dilengkapi"
                description="Tambahkan nama bank, nama pemilik, dan nomor rekening melalui Edit profil."
                className="mt-4"
              />
            )}
          </CardBox>

          <CardBox className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="type-h3 text-foreground">Riwayat request tiket</h2>
                <p className="type-p3 mt-0.5 text-muted-foreground">
                  Tiket yang Anda ajukan
                </p>
              </div>
              <Link
                href="/apps/tickets"
                className="type-p3 font-medium text-primary hover:underline"
              >
                Buka tiket <ArrowRight className="ml-1 inline size-3" aria-hidden="true" />
              </Link>
            </div>
            {profile.tickets.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tiket</TableHead>
                    <TableHead className="hidden sm:table-cell">Jenis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="max-w-52">
                        <p className="type-p2 truncate font-medium" title={ticket.title}>
                          {ticket.title}
                        </p>
                        <p className="type-p3 mt-0.5 text-muted-foreground">
                          {ticket.ticketNumber} ·{" "}
                          {new Intl.DateTimeFormat("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "Asia/Jakarta",
                          }).format(new Date(ticket.createdAt))}
                        </p>
                      </TableCell>
                      <TableCell className="type-p3 hidden sm:table-cell">
                        {ticketTypeLabels[ticket.type]}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {ticketStatusLabels[ticket.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="type-p2 text-right font-medium tabular-nums">
                        {formatCurrency(ticket.totalAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4">
                <EmptyState
                  variant="inline"
                  title="Belum ada request tiket"
                  description="Tiket yang Anda ajukan akan tercatat di sini."
                />
              </div>
            )}
            <div className="type-p3 border-t border-border px-4 py-2.5 text-muted-foreground">
              Menampilkan {profile.tickets.length} tiket terbaru
            </div>
          </CardBox>
        </TabsContent>

        <TabsContent value="notifications" className="mt-0">
          <CardBox className="p-5">
            <h2 className="type-h3 text-foreground">Notifikasi dan pengingat</h2>
            <p className="type-p3 mt-1 text-muted-foreground">
              Aktifkan notifikasi browser untuk menerima tiket yang ditugaskan
              kepada Anda, termasuk saat aplikasi tidak sedang terbuka.
            </p>
            <PushNotificationSettings />
            <Link
              href="/apps/habits?tab=calendar"
              className="type-p3 mt-4 inline-flex items-center font-medium text-primary hover:underline"
            >
              Buka Jadwal &amp; Rapat <ArrowRight className="ml-1 size-3" aria-hidden="true" />
            </Link>
          </CardBox>
        </TabsContent>

        <TabsContent value="connections" className="mt-0">
          <CardBox className="p-5">
            <div className="flex items-start gap-3">
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="type-h3 text-foreground">Koneksi pekerjaan</h2>
                <p className="type-p3 mt-1 text-muted-foreground">
                  Akun ini terhubung ke {profile.projects.length} proyek dan{" "}
                  {profile.taskCount} tugas.
                </p>
              </div>
            </div>
            <Link
              href="/apps/habits?tab=calendar"
              className="type-p3 mt-4 inline-flex items-center font-medium text-primary hover:underline"
            >
              Lihat proyek terkait <ArrowRight className="ml-1 size-3" aria-hidden="true" />
            </Link>
          </CardBox>
        </TabsContent>
      </Tabs>
    </div>
    <GlobalModal
      isOpen={editOpen}
      onClose={() => setEditOpen(false)}
      title="Edit profil"
      description="Perbarui informasi profil, rekening, atau foto profil Anda."
      className="sm:max-w-xl"
    >
        <form className="space-y-4" onSubmit={submitProfile}>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <Avatar className="size-16 border border-border">
                <AvatarImage
                  src={profile.profilePhotoUrl ?? "/images/profile/user-1.jpg"}
                  alt=""
                />
                <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <Label htmlFor="profilePhoto">Foto profil</Label>
                <p className="type-p3 mt-0.5 text-muted-foreground">
                  JPG, PNG, atau WEBP; maksimal 5 MB.
                </p>
              </div>
            </div>
            <FileDropzone
              id="profilePhoto"
              accept="image/jpeg,image/png,image/webp"
              maxSizeMb={5}
              files={photoFiles}
              onFilesChange={setPhotoFiles}
              onError={(errorMessage) => toast.error(errorMessage)}
              label="Unggah Foto Profil"
              hint="Format JPG, PNG, atau WEBP (maks. 5 MB)"
              disabled={isSavingProfile}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="profileName">Nama</Label>
              <Input
                id="profileName"
                name="name"
                defaultValue={profile.name}
                maxLength={120}
                required
                disabled={isSavingProfile}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="profilePhone">Nomor telepon</Label>
              <Input
                id="profilePhone"
                name="phone"
                type="tel"
                defaultValue={profile.phone ?? ""}
                maxLength={32}
                disabled={isSavingProfile}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bankName">Nama bank</Label>
              <Input
                id="bankName"
                name="bankName"
                defaultValue={profile.bankName ?? ""}
                maxLength={80}
                disabled={isSavingProfile}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccountName">Nama pemilik rekening</Label>
              <Input
                id="bankAccountName"
                name="bankAccountName"
                defaultValue={profile.bankAccountName ?? ""}
                maxLength={120}
                disabled={isSavingProfile}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccountNumber">Nomor rekening</Label>
              <Input
                id="bankAccountNumber"
                name="bankAccountNumber"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={profile.bankAccountNumber ?? ""}
                maxLength={30}
                disabled={isSavingProfile}
              />
            </div>
          </div>
          {profileMessage && !profileMessage.success && (
            <p role="alert" className="text-xs text-destructive">
              {profileMessage.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSavingProfile}
              onClick={() => setEditOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSavingProfile}>
              <Camera className="mr-2 size-3.5" />
              {isSavingProfile ? "Menyimpan..." : "Simpan perubahan"}
            </Button>
          </DialogFooter>
        </form>
    </GlobalModal>
    </>
  );
}
