"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  ArrowDownToLine,
  Camera,
  CheckCircle2,
  FileDown,
  FileUp,
  MoreHorizontal,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { format, formatDistanceToNowStrict, isAfter, subDays } from "date-fns";
import { id } from "date-fns/locale";
import { UserRole } from "@prisma/client";
import type { UserChartRecord } from "./UserManagementCharts";
import CardBox from "@/app/components/shared/CardBox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteUser,
  importUsersCsv,
  updateUserDetails,
  type AccountActionResult,
} from "@/app/actions/users";
import { createAccount, type RegisterState } from "@/app/auth/register/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const UserManagementCharts = dynamic(() => import("./UserManagementCharts"), {
  ssr: false,
  loading: () => (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="h-[360px] animate-pulse rounded-md border border-border bg-card lg:col-span-2" />
      <div className="h-[360px] animate-pulse rounded-md border border-border bg-card" />
    </div>
  ),
});

export type ManagedUser = UserChartRecord & {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

const roleOptions: { value: UserRole; label: string }[] = [
  { value: UserRole.DIRECTOR, label: "Direktur" },
  { value: UserRole.DEPUTY_DIRECTOR, label: "Wakil Direktur" },
  { value: UserRole.DRAFTER, label: "Drafter" },
  { value: UserRole.FINANCE, label: "Keuangan" },
  { value: UserRole.LOGISTICS, label: "Koordinator Logistik" },
  { value: UserRole.KOORDINATOR, label: "Koordinator Lapangan" },
  { value: UserRole.FIELD_TEAM, label: "Tim Lapangan" },
  { value: UserRole.MOVER, label: "Mover" },
  { value: UserRole.ADMINISTRATIONS, label: "Administrasi" },
];

const initialRegisterState: RegisterState = { status: "idle", message: "" };

const roleBadgeClasses: Record<UserRole, string> = {
  [UserRole.DIRECTOR]: "border-rose-400/30 bg-rose-500/10 text-rose-300",
  [UserRole.DEPUTY_DIRECTOR]: "border-orange-400/30 bg-orange-500/10 text-orange-300",
  [UserRole.DRAFTER]: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  [UserRole.FINANCE]: "border-violet-400/30 bg-violet-500/10 text-violet-300",
  [UserRole.LOGISTICS]: "border-cyan-400/30 bg-cyan-500/10 text-cyan-300",
  [UserRole.KOORDINATOR]: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  [UserRole.FIELD_TEAM]: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  [UserRole.MOVER]: "border-teal-400/30 bg-teal-500/10 text-teal-300",
  [UserRole.ADMINISTRATIONS]: "border-indigo-400/30 bg-indigo-500/10 text-indigo-300",
};

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function csvEscape(value: string): string {
  return `"${(/^[\s]*[=+\-@]/.test(value) ? `'${value}` : value).replace(
    /"/g,
    '""',
  )}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const content = ["\uFEFF", rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")];
  const url = URL.createObjectURL(
    new Blob(content, { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toReportRows(users: ManagedUser[]): string[][] {
  return [
    [
      "Nama",
      "Email",
      "Telepon",
      "Peran",
      "Status akun",
      "Dibuat pada",
      "Login terakhir",
    ],
    ...users.map((user) => [
      user.name,
      user.email,
      user.phone ?? "",
      roleOptions.find((role) => role.value === user.role)?.label ?? user.role,
      user.isActive ? "Aktif" : "Nonaktif",
      format(new Date(user.createdAt), "yyyy-MM-dd HH:mm"),
      user.lastLoginAt
        ? format(new Date(user.lastLoginAt), "yyyy-MM-dd HH:mm")
        : "Belum pernah login",
    ]),
  ];
}

function isRecentLogin(lastLoginAt: string | null): boolean {
  return Boolean(
    lastLoginAt && isAfter(new Date(lastLoginAt), subDays(new Date(), 30)),
  );
}

export default function UserManagementDashboard({
  currentUserId,
  users,
}: {
  currentUserId: string;
  users: ManagedUser[];
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [message, setMessage] = useState<AccountActionResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleSaveAccount = async (formData: FormData) => {
    setIsSavingAccount(true);
    setMessage(null);
    try {
      const firstName = String(formData.get("firstName") ?? "").trim();
      const lastName = String(formData.get("lastName") ?? "").trim();
      const selectedPhoto = formData.get("profilePhotoFile");
      formData.set("name", [firstName, lastName].filter(Boolean).join(" "));
      const result = editingUser
        ? await updateUserDetails(editingUser.id, {
            name: String(formData.get("name")),
            email: String(formData.get("email")),
            phone: String(formData.get("phone") ?? ""),
            profilePhotoUrl: String(formData.get("profilePhotoUrl") ?? ""),
            profilePhotoFile:
              selectedPhoto instanceof File ? selectedPhoto : null,
            role: String(formData.get("role")),
            isActive: formData.get("isActive") === "true",
          })
        : await createAccount(initialRegisterState, formData).then((created) => ({
            success: created.status === "success",
            message: created.message,
          }));
      setMessage(result);
      if (result.success) {
        setAccountDialogOpen(false);
        setEditingUser(null);
        setProfilePhotoUrl(null);
        setProfilePhotoFile(null);
      }
    } catch (error) {
      console.error("User account save request failed:", error);
      setMessage({
        success: false,
        message: "Akun gagal disimpan. Silakan coba kembali.",
      });
    } finally {
      setIsSavingAccount(false);
    }
  };

  const openNewAccount = () => {
    setEditingUser(null);
    setProfilePhotoUrl(null);
    setProfilePhotoFile(null);
    setPhotoUploadError(null);
    setAccountDialogOpen(true);
  };

  const openEditAccount = (user: ManagedUser) => {
    setEditingUser(user);
    setProfilePhotoUrl(user.profilePhotoUrl);
    setProfilePhotoFile(null);
    setPhotoUploadError(null);
    setAccountDialogOpen(true);
  };

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery =
        !normalizedQuery ||
        `${user.name} ${user.email}`.toLowerCase().includes(normalizedQuery);
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE"
          ? user.isActive
          : statusFilter === "INACTIVE"
            ? !user.isActive
            : !user.isActive || !user.lastLoginAt);
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [query, roleFilter, statusFilter, users]);

  const activeCount = users.filter((user) => user.isActive).length;
  const newThisMonth = users.filter((user) => {
    const createdAt = new Date(user.createdAt);
    const now = new Date();
    return (
      createdAt.getMonth() === now.getMonth() &&
      createdAt.getFullYear() === now.getFullYear()
    );
  }).length;
  const recentLoginCount = users.filter(
    (user) => user.isActive && isRecentLogin(user.lastLoginAt),
  ).length;
  const activeRate = activeCount
    ? Math.round((recentLoginCount / activeCount) * 100)
    : 0;
  const attentionCount = users.filter(
    (user) => !user.isActive || !user.lastLoginAt,
  ).length;
  const recentActivity = users
    .filter((user) => user.lastLoginAt)
    .sort(
      (left, right) =>
        new Date(right.lastLoginAt!).getTime() -
        new Date(left.lastLoginAt!).getTime(),
    )
    .slice(0, 5);
  const alerts = users
    .filter((user) => !user.isActive || !user.lastLoginAt)
    .slice(0, 4);

  const runAccountAction = async (
    action: () => Promise<AccountActionResult>,
  ) => {
    setIsPending(true);
    setMessage(null);
    try {
      const result = await action();
      setMessage(result);
    } catch (error) {
      console.error("User management action failed:", error);
      setMessage({
        success: false,
        message: "Tindakan gagal dijalankan. Silakan coba kembali.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    setIsPending(true);
    try {
      const result = await importUsersCsv(await file.text());
      setMessage(result);
    } catch (error) {
      console.error("User CSV import request failed:", error);
      setMessage({
        success: false,
        message: "File CSV gagal diproses. Silakan periksa file dan coba lagi.",
      });
    } finally {
      setIsPending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const exportUsers = (source: ManagedUser[], filename: string) => {
    downloadCsv(filename, toReportRows(source));
    setMessage({
      success: true,
      message: `${source.length} akun diekspor ke ${filename}.`,
    });
  };

  const metricCards = [
    {
      label: "Total pengguna",
      value: users.length,
      detail: "Semua akun terdaftar",
      icon: Users,
      color: "text-primary",
      background: "bg-lightprimary",
    },
    {
      label: "Akun aktif",
      value: activeCount,
      detail: `${users.length - activeCount} akun nonaktif`,
      icon: ShieldCheck,
      color: "text-success",
      background: "bg-lightsuccess",
    },
    {
      label: "Pengguna baru bulan ini",
      value: newThisMonth,
      detail: "Berdasarkan tanggal dibuat",
      icon: UserPlus,
      color: "text-info",
      background: "bg-lightinfo",
    },
    {
      label: "Login 30 hari",
      value: `${activeRate}%`,
      detail: `${recentLoginCount} dari ${activeCount} akun aktif`,
      icon: Activity,
      color: "text-warning",
      background: "bg-lightwarning",
    },
  ];

  return (
    <div className="my-6 space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="Pilih file CSV akun"
          onChange={(event) => void handleImport(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => fileInput.current?.click()}
        >
          <FileUp className="mr-2 size-4" aria-hidden="true" />
          Impor pengguna
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            exportUsers(users, `users-${new Date().toISOString().slice(0, 10)}.csv`)
          }
        >
          <ArrowDownToLine className="mr-2 size-4" aria-hidden="true" />
          Ekspor
        </Button>
      </div>
      <p className="text-right text-xs text-muted-foreground">
        Format impor CSV: kolom <code>name,email,role,password</code>; password
        minimal 12 karakter. Hapus file CSV setelah impor.
      </p>

      {message && (
        <p
          role={message.success ? "status" : "alert"}
          className={`rounded-md border px-4 py-3 text-sm ${
            message.success
              ? "border-success/30 bg-lightsuccess text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {metricCards.map(({ label, value, detail, icon: Icon, color, background }) => (
          <CardBox
            key={label}
            className="flex min-h-36 flex-col items-center justify-center gap-3 p-3 text-center sm:min-h-32 sm:p-4 md:min-h-24 md:flex-row md:justify-start md:gap-3 md:text-left"
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${background} ${color}`}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-xl font-semibold leading-none sm:text-2xl">
                {value}
              </p>
              <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                {detail}
              </p>
            </div>
          </CardBox>
        ))}
      </div>

      <UserManagementCharts users={users} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CardBox className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Aktivitas Terbaru</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Login pengguna yang tercatat terakhir
              </p>
            </div>
            <Activity className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="divide-y divide-border">
            {recentActivity.length ? (
              recentActivity.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.name} login</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <time
                    className="shrink-0 text-xs text-muted-foreground"
                    dateTime={user.lastLoginAt ?? undefined}
                    title={
                      user.lastLoginAt
                        ? format(new Date(user.lastLoginAt), "d MMM yyyy, HH:mm", {
                            locale: id,
                          })
                        : undefined
                    }
                  >
                    {user.lastLoginAt
                      ? formatDistanceToNowStrict(new Date(user.lastLoginAt), {
                          addSuffix: true,
                          locale: id,
                        })
                      : ""}
                  </time>
                </div>
              ))
            ) : (
              <p className="p-5 text-sm text-muted-foreground">
                Belum ada aktivitas login yang tercatat.
              </p>
            )}
          </div>
        </CardBox>

        <div className="grid gap-6">
          <CardBox className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">Peringatan akun</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Akun nonaktif atau belum pernah login
                </p>
              </div>
              <Badge variant={attentionCount ? "lightWarning" : "lightSuccess"}>
                {attentionCount}
              </Badge>
            </div>
            <div className="divide-y divide-border">
              {alerts.length ? (
                alerts.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-3 bg-warning/10 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {!user.isActive
                          ? "Akun dinonaktifkan"
                          : "Belum pernah login"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(user.createdAt), {
                        addSuffix: true,
                        locale: id,
                      })}
                    </span>
                  </div>
                ))
              ) : (
                <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                  <CheckCircle2
                    className="size-4 text-success"
                    aria-hidden="true"
                  />
                  Tidak ada peringatan akun saat ini.
                </p>
              )}
              {attentionCount > alerts.length && (
              <Button
                type="button"
                variant="ghost"
                className="w-full rounded-none"
                onClick={() => {
                  setQuery("");
                  setRoleFilter("ALL");
                  setStatusFilter("ATTENTION");
                }}
              >
                Lihat semua akun yang memerlukan perhatian
                </Button>
              )}
            </div>
          </CardBox>

          <CardBox className="overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Aksi cepat</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Kelola akun dan buat laporan pengguna
              </p>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug"
                onClick={openNewAccount}
              >
                <UserPlus className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 whitespace-normal text-left">Tambah pengguna</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp className="size-4 shrink-0 text-info" aria-hidden="true" />
                <span className="min-w-0 whitespace-normal text-left">
                  Impor pengguna
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug"
                onClick={() => exportUsers(users, "users.csv")}
              >
                <ArrowDownToLine
                  className="size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span className="min-w-0 whitespace-normal text-left">Ekspor</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug"
                onClick={() => {
                  setStatusFilter("ACTIVE");
                  setRoleFilter("ALL");
                }}
              >
                <ShieldCheck
                  className="size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span className="min-w-0 whitespace-normal text-left">
                  Akun aktif
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug sm:col-span-2"
                onClick={() =>
                  exportUsers(
                    filteredUsers,
                    `user-management-report-${new Date().toISOString().slice(0, 10)}.csv`,
                  )
                }
              >
                <FileDown
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0 whitespace-normal text-left">
                  Buat laporan ({filteredUsers.length} pengguna)
                </span>
              </Button>
            </div>
          </CardBox>
        </div>
      </div>

      <CardBox className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Daftar pengguna</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cari pengguna, perbarui role, dan kelola status akun
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            Menampilkan {filteredUsers.length} dari {users.length} pengguna
          </span>
        </div>

        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Cari nama atau email pengguna"
              placeholder="Cari pengguna..."
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button
            type="button"
            className="shrink-0 bg-[#E67E22] text-white hover:bg-[#cf6e18]"
            onClick={openNewAccount}
          >
            <UserPlus className="mr-2 size-4" aria-hidden="true" />
            Tambah Pengguna
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-border p-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filter status akun" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua status</SelectItem>
              <SelectItem value="ACTIVE">Aktif</SelectItem>
              <SelectItem value="INACTIVE">Nonaktif</SelectItem>
              <SelectItem value="ATTENTION">Perlu perhatian</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger aria-label="Filter peran pengguna" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua peran</SelectItem>
              {roleOptions.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table
          className="w-full"
          style={{ tableLayout: "fixed", width: "100%" }}
        >
          <colgroup>
            <col style={{ width: "44%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-normal px-3">
                  Pengguna
                </TableHead>
                <TableHead className="whitespace-normal px-2">
                  Peran
                </TableHead>
                <TableHead className="whitespace-normal px-2">
                  Status
                </TableHead>
                <TableHead className="px-0 text-right">
                  <span className="sr-only">Tindakan</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="min-w-0 whitespace-normal px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar className="size-10 border border-white/10">
                        <AvatarImage
                          src={user.profilePhotoUrl ?? undefined}
                          alt={user.name}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-[#102A4D] text-white">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {user.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                        {user.id === currentUserId && (
                          <span className="block truncate text-[11px] text-primary">
                            Akun Anda
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-0 whitespace-normal px-2 py-3">
                    <Badge
                      variant="outline"
                      title={
                        roleOptions.find((role) => role.value === user.role)
                          ?.label ?? user.role
                      }
                      className={`min-w-0 max-w-full overflow-hidden whitespace-nowrap px-1.5 py-1 text-[10px] ${roleBadgeClasses[user.role]}`}
                    >
                      <span className="min-w-0 truncate">
                        {roleOptions.find((role) => role.value === user.role)
                          ?.label ?? user.role}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal px-1 py-3">
                    <Badge
                      variant="outline"
                      className={`min-w-0 max-w-full gap-1 whitespace-nowrap px-0.5 py-1 text-[9px] ${
                        user.isActive
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                          : "border-slate-400/30 bg-slate-500/10 text-slate-300"
                      }`}
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          user.isActive ? "bg-emerald-400" : "bg-slate-400"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">
                        {user.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal p-0 text-right">
                    <Tooltip>
                      <DropdownMenu>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={`Tindakan untuk ${user.name}`}
                              disabled={isPending}
                              className="size-10"
                            >
                              <MoreHorizontal className="size-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onSelect={() => openEditAccount(user)}
                        >
                          <Pencil className="text-primary" aria-hidden="true" />
                          Ubah
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={user.id === currentUserId}
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(user)}
                        >
                          <Trash2 aria-hidden="true" />
                          Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                      </DropdownMenu>
                      <TooltipContent>Tindakan akun {user.name}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-muted-foreground"
                  >
                    Tidak ada pengguna yang cocok dengan filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
        </Table>
      </CardBox>

      <GlobalModal
        isOpen={accountDialogOpen}
        onClose={() => {
          setAccountDialogOpen(false);
          setEditingUser(null);
          setProfilePhotoUrl(null);
          setPhotoUploadError(null);
        }}
        title={editingUser ? "Ubah pengguna" : "Tambah pengguna"}
        description={
          editingUser
            ? "Perbarui informasi, role, dan status akun."
            : "Tambahkan pengguna baru dan tentukan akses akunnya."
        }
        className="sm:max-w-[600px]"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAccountDialogOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" form="managed-user-form" disabled={isSavingAccount}>
              {isSavingAccount ? "Menyimpan..." : "Simpan pengguna"}
            </Button>
          </>
        }
      >
          <form
            id="managed-user-form"
            key={editingUser?.id ?? "new-user"}
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveAccount(new FormData(event.currentTarget));
            }}
          >
            {editingUser?.id === currentUserId && (
              <>
                <input type="hidden" name="role" value={editingUser.role} />
                <input
                  type="hidden"
                  name="isActive"
                  value={String(editingUser.isActive)}
                />
              </>
            )}
            <input
              type="hidden"
              name="profilePhotoUrl"
              value={profilePhotoUrl ?? ""}
            />
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-4">
              <Avatar className="size-24 border border-border">
                <AvatarImage
                  src={profilePhotoUrl ?? undefined}
                  alt="Foto profil saat ini"
                  className="object-cover"
                />
                <AvatarFallback className="bg-[#102A4D] text-white">
                  {profilePhotoUrl
                    ? "Foto"
                    : editingUser
                      ? getInitials(editingUser.name)
                      : "Upload"}
                </AvatarFallback>
              </Avatar>
              <Label htmlFor="managed-user-photo" className="cursor-pointer">
                <span className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted">
                  <Camera className="size-4" aria-hidden="true" />
                  Pilih Foto Profil
                </span>
              </Label>
              <Input
                id="managed-user-photo"
                name="profilePhotoFile"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isSavingAccount}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  if (
                    file &&
                    (file.size < 1 ||
                      file.size > 5 * 1024 * 1024 ||
                      !["image/jpeg", "image/png", "image/webp"].includes(file.type))
                  ) {
                    setPhotoUploadError("Pilih foto JPG, PNG, atau WEBP maksimal 5 MB.");
                    setProfilePhotoFile(null);
                    event.currentTarget.value = "";
                    return;
                  }
                  setProfilePhotoFile(file);
                  setPhotoUploadError(null);
                }}
              />
              {profilePhotoFile && (
                <p className="text-xs text-muted-foreground">
                  Foto lokal siap disimpan: {profilePhotoFile.name}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Foto diunggah ke Cloudinary saat Simpan Pengguna ditekan.
              </p>
              {photoUploadError && (
                <p role="alert" className="text-sm text-destructive">
                  {photoUploadError}
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="user-first-name">Nama depan</Label>
                <Input
                  id="user-first-name"
                  name="firstName"
                  autoComplete="given-name"
                  defaultValue={editingUser?.name.trim().split(/\s+/)[0] ?? ""}
                  maxLength={120}
                  required
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-last-name">Nama belakang</Label>
                <Input
                  id="user-last-name"
                  name="lastName"
                  autoComplete="family-name"
                  defaultValue={
                    editingUser?.name.trim().split(/\s+/).slice(1).join(" ") ??
                    ""
                  }
                  maxLength={120}
                  className="h-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={editingUser?.email ?? ""}
                maxLength={254}
                required
                className="h-8"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="user-role">Peran</Label>
                <Select
                  name="role"
                  defaultValue={editingUser?.role ?? UserRole.FIELD_TEAM}
                  disabled={editingUser?.id === currentUserId}
                >
                  <SelectTrigger id="user-role" className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-status">Status</Label>
                <Select
                  name="isActive"
                  defaultValue={editingUser?.isActive === false ? "false" : "true"}
                  disabled={editingUser?.id === currentUserId}
                >
                  <SelectTrigger id="user-status" className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Aktif</SelectItem>
                    <SelectItem value="false">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-phone">Telepon</Label>
              <Input
                id="user-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={editingUser?.phone ?? ""}
                maxLength={32}
                pattern="[+()0-9 .-]*"
                className="h-8"
              />
            </div>
            {!editingUser && (
              <div className="space-y-1.5">
                <Label htmlFor="user-password">Password sementara</Label>
                <Input
                  id="user-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  className="h-8"
                />
                <p className="text-xs text-muted-foreground">
                  Minimal 12 karakter. Bagikan melalui saluran aman.
                </p>
              </div>
            )}
          </form>
      </GlobalModal>

      <GlobalModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus pengguna"
        description={`Hapus akun ${deleteTarget?.name ?? ""}? Tindakan ini tidak dapat dibatalkan. Akun yang masih terkait dengan data operasional harus dinonaktifkan.`}
        className="sm:max-w-md"
        footerNote="Tindakan ini tidak dapat dibatalkan."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
                const targetId = deleteTarget.id;
                void (async () => {
                  setIsPending(true);
                  setMessage(null);
                  try {
                    const result = await deleteUser(targetId);
                    setMessage(result);
                    if (result.success) setDeleteTarget(null);
                  } catch (error) {
                    console.error("User deletion request failed:", error);
                    setMessage({
                      success: false,
                      message: "Akun gagal dihapus. Silakan coba kembali.",
                    });
                  } finally {
                    setIsPending(false);
                  }
                })();
              }}
            >
              {isPending ? "Menghapus..." : "Hapus pengguna"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Periksa terlebih dahulu bahwa akun yang dipilih memang sudah tidak
          diperlukan.
        </p>
      </GlobalModal>

      <div className="sr-only" aria-live="polite">
        {message?.message}
      </div>
    </div>
  );
}
