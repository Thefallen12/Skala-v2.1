import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import CardBox from "../shared/CardBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectProgressChart } from "./ProjectProgressChart";

const projectStatusClasses: Record<string, string> = {
  Selesai:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  Berjalan:
    "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  Terhambat:
    "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300",
  "Menunggu Setup":
    "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Ditunda:
    "border-slate-400/25 bg-slate-400/10 text-slate-600 dark:text-slate-300",
};

type DashboardProject = {
  id: string;
  code: string;
  name: string;
  statusLabel: string;
  progress: number;
  budget: string;
  fieldPic: { id: string; name: string } | null;
};

export const ProductPerformance = ({
  projects,
}: {
  projects: DashboardProject[];
}) => (
  <CardBox className="w-full min-w-0 overflow-hidden border border-border bg-card p-4 text-card-foreground shadow-2xs sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div>
        <h2 className="type-h2 text-foreground">
          Progres Pekerjaan
        </h2>
        <p className="type-p3 mt-1 text-muted-foreground">
          Memantau {projects.length} proyek terbaru
        </p>
      </div>
      <Link
        href="/apps/projects"
        className="type-p3 font-semibold text-primary hover:underline"
      >
        Semua proyek
      </Link>
    </div>
    <section className="mb-5 border-b border-border pb-5">
      <div className="mb-1">
        <h3 className="type-h3 text-foreground">
          Persentase progres berdasarkan PIC
        </h3>
        <p className="type-p3 text-muted-foreground">
          Rata-rata progres proyek yang ditangani setiap PIC
        </p>
      </div>
      <ProjectProgressChart
        projects={projects.map((project) => ({
          picId: project.fieldPic?.id ?? null,
          picName: project.fieldPic?.name ?? null,
          progress: project.progress,
        }))}
      />
    </section>
    <div className="space-y-3 sm:hidden">
      {projects.length ? (
        projects.map((project) => (
          <Link
            key={project.id}
            href={`/apps/projects?projectId=${encodeURIComponent(project.id)}`}
            className="block space-y-2.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="type-p3 font-mono text-muted-foreground">
                  {project.code}
                </p>
                <p className="type-p2 min-w-0 break-words font-semibold text-foreground">
                  {project.name}
                </p>
              </div>
              <Badge
                variant="outline"
                className={`max-w-[45%] shrink-0 truncate ${
                  projectStatusClasses[project.statusLabel] ??
                  "border-slate-400/25 bg-slate-400/10 text-slate-600 dark:text-slate-300"
                }`}
              >
                {project.statusLabel}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Progress
                value={project.progress}
                variant="info"
                className="h-2 min-w-8 flex-1"
                aria-label={`Progres ${project.name}`}
              />
              <span className="type-p3 shrink-0 tabular-nums text-muted-foreground">
                {Math.round(project.progress)}%
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </Link>
        ))
      ) : (
        <EmptyState
          variant="inline"
          title="Belum ada proyek"
          description="Proyek yang aktif akan ditampilkan di sini."
        />
      )}
    </div>
    <div className="hidden overflow-x-auto sm:block">
      {projects.length ? (
        <Table className="table-fixed" pageSize={10}>
          <TableHeader>
            <TableRow>
              <TableHead className="type-p3 hidden w-[16%] font-semibold uppercase tracking-wide xl:table-cell">
                Kode
              </TableHead>
              <TableHead className="type-p3 w-[36%] font-semibold uppercase tracking-wide xl:w-[28%]">
                Proyek
              </TableHead>
              <TableHead className="type-p3 w-[22%] font-semibold uppercase tracking-wide xl:w-[16%]">
                Status
              </TableHead>
              <TableHead className="type-p3 w-[28%] font-semibold uppercase tracking-wide xl:w-[16%]">
                Progres
              </TableHead>
              <TableHead className="type-p3 hidden w-[14%] font-semibold uppercase tracking-wide xl:table-cell">
                Anggaran
              </TableHead>
              <TableHead className="type-p3 w-[14%] text-right font-semibold uppercase tracking-wide xl:w-[10%]">
                Aksi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project, index) => (
              <TableRow
                key={project.id}
                style={{ animationDelay: `${index * 55}ms` }}
                className="dashboard-enter border-b border-border transition-colors hover:bg-muted/40"
              >
                <TableCell className="type-p3 hidden truncate font-mono text-muted-foreground xl:table-cell">
                  {project.code}
                </TableCell>
                <TableCell className="truncate">
                  <Link
                    href={`/apps/projects?projectId=${encodeURIComponent(project.id)}`}
                    className="type-p2 block truncate font-semibold text-foreground hover:text-primary"
                  >
                    {project.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`max-w-full truncate ${
                      projectStatusClasses[project.statusLabel] ??
                      "border-slate-400/25 bg-slate-400/10 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {project.statusLabel}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={project.progress}
                      variant="info"
                      className="h-2 min-w-8 flex-1"
                      aria-label={`Progres ${project.name}`}
                    />
                    <span className="type-p3 tabular-nums text-muted-foreground">
                      {Math.round(project.progress)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="type-p3 hidden truncate whitespace-nowrap font-mono tabular-nums text-muted-foreground xl:table-cell">
                  {project.budget}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/apps/projects?projectId=${encodeURIComponent(project.id)}`}
                    >
                      Kelola
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          variant="inline"
          title="Belum ada proyek"
          description="Proyek yang aktif akan ditampilkan di sini."
        />
      )}
    </div>
  </CardBox>
);
