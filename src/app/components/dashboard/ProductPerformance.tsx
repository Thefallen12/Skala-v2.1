import Link from "next/link";
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
import { ProjectProgressChart } from "./ProjectProgressChart";

const projectStatusClasses: Record<string, string> = {
  Selesai:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  Berjalan:
    "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  RUNNING:
    "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  Terhambat:
    "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300",
  "PENDING SETUP":
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
  <CardBox className="dashboard-enter w-full min-w-0 overflow-hidden border-indigo-200 bg-gradient-to-br from-white to-indigo-50/80 p-4 shadow-sm transition-shadow duration-300 hover:shadow-md dark:border-slate-700/80 dark:from-[#1e293b] dark:to-[#1e1b4b]/40 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div>
        <h2 className="font-bold text-slate-900 dark:text-white">
          Progres Pekerjaan
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Memantau {projects.length} proyek terbaru
        </p>
      </div>
      <Link
        href="/apps/projects"
        className="text-xs font-semibold text-orange-600 hover:underline dark:text-orange-400"
      >
        Semua proyek
      </Link>
    </div>
    <section className="mb-5 border-b border-border pb-5">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Persentase progres berdasarkan PIC
        </h3>
        <p className="text-xs text-muted-foreground">
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
          <div
            key={project.id}
            className="space-y-3 rounded-xl border border-indigo-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/30"
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <p className="min-w-0 break-words text-sm font-semibold text-slate-900 dark:text-white">
                {project.name}
              </p>
              <Badge
                variant="outline"
                className={`max-w-[45%] shrink-0 truncate px-2 py-0.5 text-[10px] ${
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
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {Math.round(project.progress)}%
              </span>
            </div>
          </div>
        ))
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Belum ada proyek.
        </p>
      )}
    </div>
    <div className="hidden overflow-x-auto sm:block">
      <Table className="table-fixed" pageSize={10}>
        <TableHeader>
          <TableRow>
            <TableHead className="hidden w-[22%] text-xs font-semibold uppercase tracking-wide xl:table-cell">
              Kode
            </TableHead>
            <TableHead className="w-[36%] text-xs font-semibold uppercase tracking-wide xl:w-[29%]">
              Proyek
            </TableHead>
            <TableHead className="w-[25%] text-xs font-semibold uppercase tracking-wide xl:w-[20%]">
              Status
            </TableHead>
            <TableHead className="w-[39%] text-xs font-semibold uppercase tracking-wide xl:w-[19%]">
              Progres
            </TableHead>
            <TableHead className="hidden w-[10%] text-xs font-semibold uppercase tracking-wide xl:table-cell">
              Anggaran
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.length ? (
            projects.map((project, index) => (
              <TableRow
                key={project.id}
                style={{ animationDelay: `${index * 55}ms` }}
                className="dashboard-enter border-b border-border transition-colors hover:bg-indigo-50/70 dark:hover:bg-indigo-500/5"
              >
                <TableCell className="hidden truncate font-mono text-xs text-muted-foreground xl:table-cell">
                  {project.code}
                </TableCell>
                <TableCell className="truncate">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {project.name}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`max-w-full truncate px-2 py-0.5 text-[10px] ${
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
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {Math.round(project.progress)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden truncate whitespace-nowrap text-sm text-muted-foreground xl:table-cell">
                  {project.budget}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                Belum ada proyek.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  </CardBox>
);
