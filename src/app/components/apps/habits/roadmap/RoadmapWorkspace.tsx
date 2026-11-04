"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { AlarmClock, ArrowUpRight, CalendarDays, CheckCircle2, Plus, TriangleAlert } from "lucide-react";
import { WorkTaskStatus } from "@prisma/client";
import { toggleWorkspaceEventReminder, type WorkspaceActionResult } from "@/app/actions/habit-workspace";
import CardBox from "@/app/components/shared/CardBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeDataTable } from "@/components/ui/native-data-table";

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
  TODO: "Planned",
  IN_PROGRESS: "On track",
  DONE: "Done",
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
          className={`grid size-6 place-items-center rounded-full border-2 border-card text-[8px] font-semibold text-white ${
            ["bg-info", "bg-primary", "bg-warning", "bg-success"][index]
          }`}
        >
          {initials(member.name)}
        </span>
      ))}
      {distinct.length > 4 && (
        <span className="grid size-6 place-items-center rounded-full border-2 border-card bg-muted text-[8px]">
          +{distinct.length - 4}
        </span>
      )}
      {!distinct.length && <span className="text-[10px] text-muted-foreground">—</span>}
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
  const [message, setMessage] = useState<WorkspaceActionResult | null>(null);
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
      setMessage(result);
      if (result.success) router.refresh();
    });
  };
  const meetingDay = (date: string) =>
    Math.ceil(
      (new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime() -
        new Date(`${today}T00:00:00Z`).getTime()) /
        86_400_000,
    );

  return (
    <div className="my-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Product roadmap</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Milestone proyek, pemilik tugas, progres, dan rapat terjadwal.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/apps/habits/tasks">
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            Tambah tugas
          </Link>
        </Button>
      </div>
      {message && (
        <p
          role={message.success ? "status" : "alert"}
          className={`rounded-md border px-3 py-2 text-xs ${
            message.success
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(240px,1fr)]">
        <CardBox className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Product roadmap</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {tasks.length} milestone · dikelompokkan per proyek
              </p>
            </div>
            <Link
              href="/apps/habits/tasks"
              className="text-[10px] font-medium text-primary hover:underline"
            >
              Kelola tugas <ArrowUpRight className="ml-1 inline size-3" />
            </Link>
          </div>
          <div className="max-h-[680px] space-y-3 overflow-auto p-3">
            {tasksByProject.map((project, projectIndex) => {
              const doneCount = project.tasks.filter(
                (task) => task.status === WorkTaskStatus.DONE,
              ).length;
              return (
                <details
                  key={project.id}
                  open
                  className={`overflow-hidden rounded-md border border-border border-l-2 ${
                    projectIndex % 2 ? "border-l-warning" : "border-l-primary"
                  }`}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-muted/40 px-3 py-2.5">
                    <span className="text-xs font-semibold">{project.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {project.tasks.length} milestone · {Math.round(project.progress)}% project progress
                    </span>
                  </summary>
                  <NativeDataTable itemLabel="tugas">
                    <table className="app-data-table min-w-[700px] text-[10px]">
                      <thead className="border-b border-border text-left text-muted-foreground">
                        <tr>
                          <th className="w-7 px-2 py-2" aria-label="Nomor" />
                          <th className="px-2 py-2 font-medium">Name</th>
                          <th className="w-24 px-2 py-2 font-medium">ETA</th>
                          <th className="w-24 px-2 py-2 font-medium">Lead</th>
                          <th className="w-24 px-2 py-2 font-medium">Members</th>
                          <th className="w-24 px-2 py-2 font-medium">Progress</th>
                          <th className="w-20 px-2 py-2 font-medium">State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.tasks.map((task, index) => {
                          const late =
                            task.status !== WorkTaskStatus.DONE &&
                            task.endsAt.slice(0, 10) < today;
                          const members = task.members.map(({ user }) => user);
                          if (task.assignee) members.push(task.assignee);
                          const progress =
                            task.status === WorkTaskStatus.DONE
                              ? 100
                              : task.status === WorkTaskStatus.IN_PROGRESS
                                ? 50
                                : 0;
                          return (
                            <tr key={task.id} className="border-b border-border/70 last:border-0">
                              <td className="px-2 py-2.5 text-muted-foreground">{index + 1}</td>
                              <td className="max-w-52 truncate px-2 py-2.5" title={task.title}>
                                {task.title}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5 text-muted-foreground">
                                <CalendarDays className="mr-1 inline size-3" />
                                {format(new Date(task.endsAt), "d MMM, yyyy", { locale: id })}
                              </td>
                              <td className="px-2 py-2.5">
                                <Avatars members={task.assignee ? [task.assignee] : []} />
                              </td>
                              <td className="px-2 py-2.5">
                                <Avatars members={members} />
                              </td>
                              <td className="px-2 py-2.5">
                                <div
                                  role="progressbar"
                                  aria-label={`Progres ${task.title}`}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={progress}
                                  className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
                                >
                                  <div
                                    className={`h-full rounded-full ${
                                      late ? "bg-warning" : "bg-success"
                                    }`}
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5">
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
                                  {late ? "Overdue" : statusText[task.status]}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border bg-muted/20">
                          <td colSpan={7} className="px-2 py-2 text-right text-muted-foreground">
                            {doneCount} of {project.tasks.length} milestones complete
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </NativeDataTable>
                </details>
              );
            })}
            {!tasksByProject.length && (
              <div className="rounded-md border border-dashed border-border px-4 py-10 text-center">
                <p className="text-xs font-medium">Belum ada milestone di roadmap.</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Buat tugas dan kaitkan dengan proyek untuk menambah milestone.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/apps/habits/tasks">Buat tugas</Link>
                </Button>
              </div>
            )}
          </div>
        </CardBox>

        <CardBox className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Scheduled meetings</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Rapat mendatang dalam 90 hari
            </p>
          </div>
          <div className="max-h-[680px] space-y-2 overflow-auto p-3">
            {meetings.map((meeting) => {
              const days = meetingDay(meeting.startsAt);
              const participants = meeting.participants.map(({ user }) => user);
              const canSetReminder =
                meeting.createdById === currentUserId ||
                participants.some(({ id }) => id === currentUserId);
              const isSoon = days <= 1;
              return (
                <article
                  key={meeting.id}
                  className={`rounded-md border border-border p-3 ${
                    isSoon ? "bg-warning/10" : "bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-semibold">{meeting.title}</h3>
                    <Badge variant={isSoon ? "warning" : "gray"}>
                      {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {meeting.project?.name ?? "Meeting"} · {meeting.User.name}
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {format(new Date(meeting.startsAt), "d MMMM yyyy · HH:mm", { locale: id })}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Avatars members={participants} />
                    <div className="flex gap-1.5">
                      {canSetReminder && (
                        <Button
                          size="sm"
                          variant={meeting.isReminderSet ? "secondary" : "outline"}
                          className="h-7 px-2 text-[10px]"
                          onClick={() => toggleReminder(meeting)}
                          disabled={isPending}
                          aria-pressed={meeting.isReminderSet}
                        >
                          <AlarmClock className="mr-1 size-3" />
                          {meeting.isReminderSet ? "Reminder on" : "Notify me"}
                        </Button>
                      )}
                      {meeting.meetingUrl ? (
                        <Button asChild size="sm" className="h-7 px-2 text-[10px]">
                          <a href={meeting.meetingUrl} target="_blank" rel="noreferrer">
                            Join <ArrowUpRight className="ml-1 size-3" />
                          </a>
                        </Button>
                      ) : (
                        <span title="Belum ada tautan rapat">
                          <Button size="sm" className="h-7 px-2 text-[10px]" disabled>
                            Join
                          </Button>
                        </span>
                      )}
                    </div>
                  </div>
                  {meeting.isReminderSet && (
                    <p className="mt-2 text-[9px] text-success">
                      Pengingat tersimpan untuk akun Anda.
                    </p>
                  )}
                </article>
              );
            })}
            {!meetings.length && (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <TriangleAlert className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-xs font-medium">Belum ada rapat mendatang.</p>
                <Link
                  href="/apps/habits/schedule"
                  className="mt-2 inline-block text-[10px] text-primary hover:underline"
                >
                  Buka kalender dan jadwalkan rapat
                </Link>
              </div>
            )}
          </div>
        </CardBox>
      </div>
    </div>
  );
}
