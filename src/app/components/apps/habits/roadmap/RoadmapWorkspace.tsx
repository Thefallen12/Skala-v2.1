"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { AlarmClock, ArrowUpRight, CalendarDays, Plus, TriangleAlert } from "lucide-react";
import { WorkTaskStatus } from "@prisma/client";
import { toggleWorkspaceEventReminder } from "@/app/actions/habit-workspace";
import CardBox from "@/app/components/shared/CardBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Member = { id: string; name: string };
type TaskRecord = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: WorkTaskStatus;
  projectId: string;
  project: { name: string; code: string };
  assignee: Member | null;
  members: { user: Member }[];
};
type MeetingRecord = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  meetingUrl: string | null;
  createdById: string;
  project: { name: string } | null;
  User: { name: string };
  participants: { user: Member }[];
  isReminderSet: boolean;
};

const statusText: Record<WorkTaskStatus, string> = {
  TODO: "Direncanakan",
  IN_PROGRESS: "Berjalan",
  DONE: "Selesai",
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatars({ members }: { members: Member[] }) {
  const distinct = [...new Map(members.map((member) => [member.id, member])).values()];
  return (
    <div className="flex items-center -space-x-1.5" aria-label={distinct.map(({ name }) => name).join(", ") || "Belum ada anggota"}>
      {distinct.slice(0, 4).map((member, index) => (
        <span
          key={member.id}
          title={member.name}
          className={`type-p3 grid size-7 place-items-center rounded-full border-2 border-card font-semibold text-white ${
            ["bg-info", "bg-primary", "bg-warning", "bg-success"][index % 4]
          }`}
        >
          {initials(member.name)}
        </span>
      ))}
      {distinct.length > 4 && (
        <span className="type-p3 grid size-7 place-items-center rounded-full border-2 border-card bg-muted font-medium">
          +{distinct.length - 4}
        </span>
      )}
      {!distinct.length && <span className="type-p3 text-muted-foreground">—</span>}
    </div>
  );
}

export default function RoadmapWorkspace({
  today,
  currentUserId,
  projects,
  tasks,
  meetings,
}: {
  today: string;
  currentUserId: string;
  projects: { id: string; code: string; name: string; progress: number }[];
  tasks: TaskRecord[];
  meetings: MeetingRecord[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const tasksByProject = projects
    .map((project) => ({
      ...project,
      tasks: tasks.filter((task) => task.projectId === project.id),
    }))
    .filter((project) => project.tasks.length > 0);
  const toggleReminder = (meeting: MeetingRecord) => {
    startTransition(async () => {
      const result = await toggleWorkspaceEventReminder(
        meeting.id,
        !meeting.isReminderSet,
      );
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };
  const meetingDay = (date: string) =>
    Math.ceil(
      (new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime() -
        new Date(`${today}T00:00:00Z`).getTime()) /
        86_400_000,
    );

  return (
    <div className="my-4 space-y-5">
      <PageHeader
        title="Peta Jalan Proyek"
        description="Milestone proyek, penanggung jawab tugas, progres, dan rapat terjadwal."
        breadcrumbs={[
          { label: "Beranda", href: "/" },
          { label: "Jadwal & Tugas", href: "/apps/habits" },
          { label: "Peta Jalan" },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/apps/habits?tab=tasks">
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              Tambah Tugas
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)]">
        <CardBox className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="type-h2 text-foreground">Daftar Milestone</h2>
              <p className="type-p3 mt-0.5 text-muted-foreground">
                {tasks.length} milestone · dikelompokkan per proyek
              </p>
            </div>
            <Link
              href="/apps/habits?tab=tasks"
              className="type-p3 font-medium text-primary hover:underline"
            >
              Kelola tugas <ArrowUpRight className="ml-1 inline size-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="max-h-[680px] space-y-3 overflow-auto p-3 sm:p-4">
            {tasksByProject.map((project, projectIndex) => {
              const doneCount = project.tasks.filter(
                (task) => task.status === WorkTaskStatus.DONE,
              ).length;
              return (
                <details
                  key={project.id}
                  open
                  className={`overflow-hidden rounded-lg border border-border border-l-2 ${
                    projectIndex % 2 ? "border-l-warning" : "border-l-primary"
                  }`}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-muted/40 px-3.5 py-2.5">
                    <span className="type-h3 text-foreground">{project.name}</span>
                    <span className="type-p3 text-muted-foreground">
                      {project.tasks.length} milestone · {Math.round(project.progress)}% progres proyek
                    </span>
                  </summary>
                  <div className="p-2">
                    <Table pagination={false}>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Tugas</TableHead>
                          <TableHead className="w-32">Target</TableHead>
                          <TableHead className="w-28">Penanggung Jawab</TableHead>
                          <TableHead className="w-28">Tim</TableHead>
                          <TableHead className="w-28">Progres</TableHead>
                          <TableHead className="w-28">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {project.tasks.map((task, index) => {
                          const late =
                            task.status !== WorkTaskStatus.DONE &&
                            task.endsAt.slice(0, 10) < today;
                          const taskMembers = task.members.map(({ user }) => user);
                          if (task.assignee) taskMembers.push(task.assignee);
                          const progress =
                            task.status === WorkTaskStatus.DONE
                              ? 100
                              : task.status === WorkTaskStatus.IN_PROGRESS
                                ? 50
                                : 0;
                          return (
                            <TableRow key={task.id}>
                              <TableCell className="type-p3 text-muted-foreground">{index + 1}</TableCell>
                              <TableCell className="type-p2 max-w-52 truncate font-medium" title={task.title}>
                                {task.title}
                              </TableCell>
                              <TableCell className="type-p3 whitespace-nowrap text-muted-foreground">
                                <CalendarDays className="mr-1 inline size-3.5" aria-hidden="true" />
                                {format(new Date(task.endsAt), "d MMM yyyy", { locale: id })}
                              </TableCell>
                              <TableCell>
                                <Avatars members={task.assignee ? [task.assignee] : []} />
                              </TableCell>
                              <TableCell>
                                <Avatars members={taskMembers} />
                              </TableCell>
                              <TableCell>
                                <Progress
                                  value={progress}
                                  variant={late ? "warning" : "success"}
                                  aria-label={`Progres ${task.title}`}
                                  className="h-1.5 w-20"
                                />
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge
                                  variant={
                                    late
                                      ? "warning"
                                      : task.status === WorkTaskStatus.DONE
                                        ? "success"
                                        : task.status === WorkTaskStatus.IN_PROGRESS
                                          ? "info"
                                          : "gray"
                                  }
                                >
                                  {late ? "Terlambat" : statusText[task.status]}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={7} className="type-p3 text-right text-muted-foreground">
                            {doneCount} dari {project.tasks.length} milestone selesai
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </details>
              );
            })}
            {!tasksByProject.length && (
              <EmptyState
                variant="inline"
                title="Belum ada milestone"
                description="Buat tugas dan kaitkan dengan proyek untuk menambah milestone."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/apps/habits?tab=tasks">Buat Tugas</Link>
                  </Button>
                }
              />
            )}
          </div>
        </CardBox>

        <CardBox className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="type-h2 text-foreground">Jadwal Rapat</h2>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Rapat mendatang dalam 90 hari
            </p>
          </div>
          <div className="max-h-[680px] space-y-2.5 overflow-auto p-3 sm:p-4">
            {meetings.map((meeting) => {
              const days = meetingDay(meeting.startsAt);
              const participants = meeting.participants.map(({ user }) => user);
              const canSetReminder =
                meeting.createdById === currentUserId ||
                participants.some(({ id: participantId }) => participantId === currentUserId);
              const isSoon = days <= 1;
              return (
                <article
                  key={meeting.id}
                  className={`rounded-lg border border-border p-3 ${
                    isSoon ? "bg-warning/10" : "bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="type-h3 text-foreground">{meeting.title}</h3>
                    <Badge variant={isSoon ? "warning" : "gray"}>
                      {days === 0 ? "Hari ini" : days === 1 ? "Besok" : `${days} hari`}
                    </Badge>
                  </div>
                  <p className="type-p3 mt-1 text-muted-foreground">
                    {meeting.project?.name ?? "Rapat"} · {meeting.User.name}
                  </p>
                  <p className="type-p3 mt-1.5 text-muted-foreground">
                    {format(new Date(meeting.startsAt), "d MMMM yyyy · HH:mm", { locale: id })}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Avatars members={participants} />
                    <div className="flex gap-1.5">
                      {canSetReminder && (
                        <Button
                          size="sm"
                          variant={meeting.isReminderSet ? "secondary" : "outline"}
                          onClick={() => toggleReminder(meeting)}
                          disabled={isPending}
                          aria-pressed={meeting.isReminderSet}
                        >
                          <AlarmClock className="mr-1 size-3.5" aria-hidden="true" />
                          {meeting.isReminderSet ? "Pengingat aktif" : "Ingatkan"}
                        </Button>
                      )}
                      {meeting.meetingUrl ? (
                        <Button asChild size="sm">
                          <a href={meeting.meetingUrl} target="_blank" rel="noreferrer">
                            Gabung <ArrowUpRight className="ml-1 size-3.5" aria-hidden="true" />
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" disabled title="Belum ada tautan rapat">
                          Gabung
                        </Button>
                      )}
                    </div>
                  </div>
                  {meeting.isReminderSet && (
                    <p className="type-p3 mt-2 text-success">
                      Pengingat tersimpan untuk akun Anda.
                    </p>
                  )}
                </article>
              );
            })}
            {!meetings.length && (
              <EmptyState
                variant="inline"
                icon={TriangleAlert}
                title="Belum ada rapat mendatang"
                description="Jadwalkan rapat baru melalui tab Kalender."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href="/apps/habits?tab=calendar">Buka Kalender</Link>
                  </Button>
                }
              />
            )}
          </div>
        </CardBox>
      </div>
    </div>
  );
}
