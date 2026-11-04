"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Images,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import CardBox from "@/app/components/shared/CardBox";
import type {
  FieldTeamOption,
  ProjectDashboardRow,
} from "@/app/(DashboardLayout)/types/project";
import { ProjectStatus, UserRole } from "@prisma/client";
import ProjectFormModal from "@/app/components/project/ProjectFormModal";
import ProjectFinancialModal from "@/app/components/project/ProjectFinancialModal";
import ProjectProgressModal from "@/app/components/project/ProjectProgressModal";
import ProjectProgressHistoryModal from "@/app/components/project/ProjectProgressHistoryModal";
import ProjectWorkPointsModal from "@/app/components/project/ProjectWorkPointsModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  TablePaginationControls,
  TableRow,
} from "@/components/ui/table";

const statusLabels: Record<ProjectStatus, string> = {
  PENDING_SETUP: "Pending Setup",
  RUNNING: "Running",
  PENDING: "PENDING SETUP",
  ON_PROGRESS: "RUNNING",
  TERHAMBAT: "Terhambat",
  DONE: "Done",
  PLANNED: "PENDING SETUP",
  ACTIVE: "RUNNING",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
};

const statusVariants: Record<
  ProjectStatus,
  "lightWarning" | "lightInfo" | "lightError" | "lightSuccess" | "gray"
> = {
  PENDING_SETUP: "lightWarning",
  RUNNING: "lightSuccess",
  PENDING: "lightWarning",
  ON_PROGRESS: "lightInfo",
  TERHAMBAT: "lightError",
  DONE: "lightSuccess",
  PLANNED: "lightWarning",
  ACTIVE: "lightInfo",
  ON_HOLD: "lightError",
  COMPLETED: "lightSuccess",
};

const statusOptions = Object.entries(statusLabels) as [ProjectStatus, string][];
type StatusFilter = ProjectStatus | "ALL";

function isStatusFilter(value: string): value is StatusFilter {
  return value === "ALL" || statusOptions.some(([status]) => status === value);
}

const formatCurrency = (amount: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(amount));

function splitProjectAddress(address: string) {
  const kecamatanMatch = address.match(
    /\bKec(?:amatan)?\.?\s+(.+?)(?=\s+Kab(?:upaten)?\.?\s+|$)/i,
  );
  const kabupatenMatch = address.match(/\bKab(?:upaten)?\.?\s+(.+)$/i);
  const locationStart = [kecamatanMatch?.index, kabupatenMatch?.index]
    .filter((index): index is number => index !== undefined)
    .reduce((start, index) => Math.min(start, index), address.length);
  const village = address.slice(0, locationStart).trim();
  const kecamatan = kecamatanMatch?.[1]?.trim() ?? "";
  const district = [
    kecamatan && `Kec. ${kecamatan}`,
    kabupatenMatch?.[1] && `Kab. ${kabupatenMatch[1].trim()}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    village: village || address,
    district,
    kecamatan,
  };
}

export default function ProjectMainTable({
  projects,
  fieldTeamUsers,
  canManageProjects,
  canUpdateProjectProgress,
  currentUserId,
  currentUserRole,
}: {
  projects: ProjectDashboardRow[];
  fieldTeamUsers: FieldTeamOption[];
  canManageProjects: boolean;
  canUpdateProjectProgress: boolean;
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const [financialProject, setFinancialProject] =
    useState<ProjectDashboardRow | null>(null);
  const [editingProject, setEditingProject] =
    useState<ProjectDashboardRow | null>(null);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [progressProject, setProgressProject] =
    useState<ProjectDashboardRow | null>(null);
  const [historyProject, setHistoryProject] =
    useState<ProjectDashboardRow | null>(null);
  const [workPointProject, setWorkPointProject] =
    useState<ProjectDashboardRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [kecamatanFilter, setKecamatanFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;
  const kecamatanOptions = useMemo(
    () =>
      Array.from(
        new Set(
          projects
            .map((project) => splitProjectAddress(project.address).kecamatan)
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right, "id")),
    [projects],
  );
  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("id-ID");
    return projects.filter((project) => {
      const matchesQuery =
        !query ||
        [
          project.code,
          project.title,
          project.jenisPekerjaan ?? "",
          project.kelompokTani,
          project.address,
          project.vendor ?? "",
        ].some((value) => value.toLocaleLowerCase("id-ID").includes(query));
      const matchesKecamatan =
        kecamatanFilter === "ALL" ||
        splitProjectAddress(project.address).kecamatan === kecamatanFilter;
      return (
        matchesQuery &&
        matchesKecamatan &&
        (statusFilter === "ALL" || project.status === statusFilter)
      );
    });
  }, [projects, searchQuery, statusFilter, kecamatanFilter]);
  const pageCount = Math.ceil(filteredProjects.length / pageSize);
  const visiblePage = Math.min(currentPage, Math.max(pageCount, 1));
  const pageStartIndex = (visiblePage - 1) * pageSize;
  const paginatedProjects = filteredProjects.slice(
    pageStartIndex,
    pageStartIndex + pageSize,
  );
  const renderProjectActions = (project: ProjectDashboardRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Aksi untuk ${project.title}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canUpdateProjectProgress && (
          <DropdownMenuItem onSelect={() => setProgressProject(project)}>
            <TrendingUp className="mr-2 size-4" aria-hidden="true" />
            Tambah Progres
          </DropdownMenuItem>
        )}
        {canManageProjects && (
          <DropdownMenuItem
            onSelect={() => {
              setEditingProject(project);
              setIsProjectFormOpen(true);
            }}
          >
            Edit proyek
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/apps/tickets">Lihat tiket</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setHistoryProject(project)}>
          <Images className="mr-2 size-4" aria-hidden="true" />
          Riwayat progres & foto
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setWorkPointProject(project)}>
          <MapPin className="mr-2 size-4" aria-hidden="true" />
          Titik pekerjaan & upah
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setFinancialProject(project)}>
          Lihat Realisasi Anggaran
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setKecamatanFilter("ALL");
    setCurrentPage(1);
  };

  return (
    <>
      <CardBox className="h-full">
        <div className="mb-5 flex flex-col gap-4">
          <div>
            <h3 className="text-xl font-semibold">Project Utama</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Menampilkan {filteredProjects.length} dari {projects.length} proyek
            </p>
          </div>
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {canManageProjects && (
              <Button
                type="button"
                className="w-full min-w-0"
                onClick={() => {
                  setEditingProject(null);
                  setIsProjectFormOpen(true);
                }}
              >
                <Plus className="mr-2 size-4" aria-hidden="true" />
                Tambah proyek
              </Button>
            )}
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <ProjectWorkPointsModal
                project={workPointProject}
                open={workPointProject !== null}
                onOpenChange={(open) => {
                  if (!open) setWorkPointProject(null);
                }}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
              />
              <Input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari proyek, kelompok, alamat..."
                aria-label="Cari proyek"
                className="w-full min-w-0 pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                if (isStatusFilter(value)) {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }
              }}
            >
              <SelectTrigger
                className="w-full min-w-0"
                aria-label="Filter status proyek"
              >
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua status</SelectItem>
                {statusOptions.map(([status, label]) => (
                  <SelectItem key={status} value={status}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={kecamatanFilter}
              onValueChange={(value) => {
                setKecamatanFilter(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger
                className="w-full min-w-0"
                aria-label="Filter kecamatan"
              >
                <SelectValue placeholder="Semua kecamatan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua kecamatan</SelectItem>
                {kecamatanOptions.map((kecamatan) => (
                  <SelectItem key={kecamatan} value={kecamatan}>
                    Kec. {kecamatan}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <Table pagination={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Kelompok Tani</TableHead>
                <TableHead className="w-52 max-w-52">Alamat</TableHead>
                <TableHead className="text-right">Luas (Ha)</TableHead>
                <TableHead className="text-right">Pagu</TableHead>
                <TableHead>Judul Project</TableHead>
                <TableHead>PIC Team Lapangan</TableHead>
                <TableHead>Progres Pekerjaan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.length ? (
                paginatedProjects.map((project) => {
                  const address = splitProjectAddress(project.address);
                  return (
                    <TableRow key={project.id}>
                    <TableCell className="min-w-44 font-medium">
                      {project.kelompokTani}
                    </TableCell>
                    <TableCell className="w-52 max-w-52 whitespace-nowrap align-top">
                      <div className="w-52 max-w-52" title={project.address}>
                        <p className="truncate font-medium leading-snug">
                          {address.village}
                        </p>
                        {address.district && (
                          <p className="mt-1 truncate text-xs leading-relaxed text-muted-foreground">
                            {address.district}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {project.landArea
                        ? `${new Intl.NumberFormat("id-ID", {
                            maximumFractionDigits: 2,
                          }).format(Number(project.landArea))} Ha`
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {formatCurrency(project.pagu)}
                    </TableCell>
                    <TableCell className="min-w-48">
                      <p className="font-medium">{project.title}</p>
                      {project.jenisPekerjaan && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {project.jenisPekerjaan}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        SPK: {project.code}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-40">
                      {project.fieldPicName ? (
                        <span className="font-medium">{project.fieldPicName}</span>
                      ) : (
                        <span className="text-muted-foreground">Belum ditentukan</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-40">
                      <div className="flex items-center gap-2">
                        <Progress
                          className="h-2"
                          value={Math.max(0, Math.min(100, project.progress))}
                        />
                        <span className="w-10 text-right text-xs text-muted-foreground">
                          {project.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[project.status] ?? "gray"}>
                        {statusLabels[project.status] ?? project.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {renderProjectActions(project)}
                    </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {projects.length === 0
                      ? "Belum ada data project."
                      : "Tidak ada proyek yang cocok. Sesuaikan pencarian atau filter."}
                    {projects.length > 0 &&
                      (searchQuery ||
                        statusFilter !== "ALL" ||
                        kecamatanFilter !== "ALL") && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-2"
                          onClick={resetFilters}
                        >
                          <X className="mr-1 size-4" aria-hidden="true" />
                          Reset filter
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <TablePaginationControls
          count={filteredProjects.length}
          pageSize={pageSize}
          page={visiblePage}
          itemLabel="proyek"
          onPageChange={setCurrentPage}
        />
      </CardBox>
      <ProjectFinancialModal
        project={financialProject}
        open={financialProject !== null}
        onOpenChange={(open) => {
          if (!open) setFinancialProject(null);
        }}
      />
      <ProjectProgressHistoryModal
        project={historyProject}
        open={historyProject !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryProject(null);
        }}
      />
      <ProjectWorkPointsModal
        project={workPointProject}
        open={workPointProject !== null}
        onOpenChange={(open) => {
          if (!open) setWorkPointProject(null);
        }}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />
      {canManageProjects && isProjectFormOpen && (
        <ProjectFormModal
          key={editingProject?.id ?? "new-project"}
          project={editingProject}
          fieldTeamUsers={fieldTeamUsers}
          open={isProjectFormOpen}
          onOpenChange={(open) => {
            setIsProjectFormOpen(open);
            if (!open) setEditingProject(null);
          }}
        />
      )}
      {canUpdateProjectProgress && (
        <ProjectProgressModal
          project={progressProject}
          key={progressProject?.id ?? "no-project"}
          open={progressProject !== null}
          onOpenChange={(open) => {
            if (!open) setProgressProject(null);
          }}
        />
      )}
    </>
  );
}
