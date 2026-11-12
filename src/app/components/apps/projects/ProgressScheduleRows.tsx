"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { recordProjectOpname } from "@/app/actions/project";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const emptySubscribe = () => () => {};

function buildProgressMap(items: ProgressScheduleItem[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const it of items) next[it.id] = Math.round(it.progress ?? 0);
  return next;
}

export type ProgressScheduleItem = {
  id: string;
  title: string;
  section: string;
  plannedStartDate: string | null;
  targetDate: string | null;
  targetVolume: number;
  unit: string;
  progress: number;
};

interface ProgressScheduleRowsProps {
  projectId: string;
  projectStartDate: string | null;
  projectEndDate: string | null;
  items: ProgressScheduleItem[];
}

function toLocalDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getStatus(progress: number, expected: number, started: boolean) {
  if (progress >= 100) {
    return { label: "Selesai", className: "bg-emerald-500/15 text-emerald-400" };
  }
  if (!started && progress <= 0) {
    return { label: "Belum mulai", className: "bg-muted text-muted-foreground" };
  }
  if (progress >= expected + 5) {
    return { label: "Lebih cepat", className: "bg-emerald-500/15 text-emerald-400" };
  }
  if (progress <= expected - 5) {
    return { label: "Terlambat", className: "bg-rose-500/15 text-rose-400" };
  }
  return { label: "Sesuai rencana", className: "bg-sky-500/15 text-sky-400" };
}

export default function ProgressScheduleRows({
  projectId,
  projectStartDate,
  projectEndDate,
  items,
}: ProgressScheduleRowsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [mountNowMs] = useState(() => Date.now());
  const nowMs = isClient ? mountNowMs : null;

  // Nilai slider lokal (persen) per item; disinkronkan ulang saat data server berubah
  const [values, setValues] = useState<Record<string, number>>(() =>
    buildProgressMap(items),
  );
  const [committedValues, setCommittedValues] = useState<Record<string, number>>(
    () => buildProgressMap(items),
  );
  const [prevItems, setPrevItems] = useState(items);

  if (prevItems !== items) {
    setPrevItems(items);
    const next = buildProgressMap(items);
    setValues(next);
    setCommittedValues(next);
  }

  const { rangeStart, rangeEnd, weeks } = useMemo(() => {
    const dates: number[] = [];
    if (projectStartDate) dates.push(new Date(projectStartDate).getTime());
    if (projectEndDate) dates.push(new Date(projectEndDate).getTime());
    for (const it of items) {
      if (it.plannedStartDate) dates.push(new Date(it.plannedStartDate).getTime());
      if (it.targetDate) dates.push(new Date(it.targetDate).getTime());
    }
    const valid = dates.filter((d) => Number.isFinite(d));
    const base = valid.length ? Math.min(...valid) : mountNowMs;
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const maxMs = valid.length ? Math.max(...valid) : startMs + 8 * WEEK_MS;
    const weekCount = Math.max(4, Math.ceil((maxMs - startMs + DAY_MS) / WEEK_MS));
    return {
      rangeStart: startMs,
      rangeEnd: startMs + weekCount * WEEK_MS,
      weeks: Array.from({ length: weekCount }, (_, i) => i + 1),
    };
  }, [items, projectStartDate, projectEndDate, mountNowMs]);

  const span = rangeEnd - rangeStart;
  const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - rangeStart) / span) * 100));
  const weekOf = (ms: number) => Math.floor((ms - rangeStart) / WEEK_MS) + 1;

  const commit = (item: ProgressScheduleItem) => {
    const value = values[item.id] ?? 0;
    if (committedValues[item.id] === value) return;

    const volume = Math.round(item.targetVolume * (value / 100) * 1000) / 1000;
    setSavingId(item.id);
    setMessage(null);
    startTransition(async () => {
      const res = await recordProjectOpname(projectId, {
        reportDate: toLocalDateKey(new Date()),
        isAdditional: false,
        periodType: "DAILY",
        notes: `Progres ${item.title} diatur ke ${value}% lewat jadwal`,
        items: [{ workPointId: item.id, volume }],
      });
      setSavingId(null);
      if (res.success) {
        setCommittedValues((prev) => ({ ...prev, [item.id]: value }));
        setMessage({ ok: true, text: `${item.title}: progres ${value}% tersimpan sebagai opname harian.` });
        router.refresh();
      } else {
        setValues((prev) => ({ ...prev, [item.id]: committedValues[item.id] ?? 0 }));
        setMessage({ ok: false, text: res.message || "Gagal menyimpan progres." });
      }
    });
  };

  if (items.length === 0) return null;

  const todayPct = nowMs !== null && nowMs >= rangeStart && nowMs <= rangeEnd ? pct(nowMs) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">Jadwal &amp; Progres per Item</h3>
          <p className="text-xs text-muted-foreground">
            Geser slider untuk menentukan progres. Saat dilepas, progres tersimpan sebagai opname harian hari ini.
          </p>
        </div>
        {message && (
          <p className={`text-xs font-medium ${message.ok ? "text-emerald-400" : "text-rose-400"}`}>
            {message.text}
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/80">
        <div className="min-w-[860px]">
          {/* Header minggu */}
          <div className="flex border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground">
            <div className="w-64 shrink-0 border-r border-border px-4 py-2.5">Item pekerjaan</div>
            <div className="relative flex flex-1">
              {weeks.map((w) => (
                <div key={w} className="flex-1 border-r border-border/50 py-2.5 text-center last:border-r-0">
                  M{w}
                </div>
              ))}
            </div>
          </div>

          {items.map((item) => {
            const projStart = projectStartDate ? new Date(projectStartDate).getTime() : rangeStart;
            const projEnd = projectEndDate ? new Date(projectEndDate).getTime() : rangeEnd - DAY_MS;
            const startMs = item.plannedStartDate ? new Date(item.plannedStartDate).getTime() : projStart;
            let endMs = item.targetDate ? new Date(item.targetDate).getTime() : projEnd;
            if (!Number.isFinite(endMs) || endMs <= startMs) endMs = startMs + WEEK_MS - DAY_MS;

            const startWeek = weekOf(startMs);
            const endWeek = weekOf(endMs);
            const durationWeeks = Math.max(1, endWeek - startWeek + 1);

            const value = values[item.id] ?? 0;
            const started = nowMs !== null && nowMs >= startMs;
            const expected =
              nowMs === null
                ? 0
                : nowMs <= startMs
                  ? 0
                  : nowMs >= endMs
                    ? 100
                    : ((nowMs - startMs) / (endMs - startMs)) * 100;
            const status = getStatus(value, expected, started);

            const left = pct(startMs);
            const width = Math.max(2, pct(endMs + DAY_MS) - left);
            const isSaving = savingId === item.id && isPending;

            return (
              <div key={item.id} className="flex border-b border-border/60 last:border-b-0 hover:bg-muted/10">
                <div className="w-64 shrink-0 space-y-1.5 border-r border-border px-4 py-3">
                  <p className="truncate text-xs font-semibold text-foreground" title={item.title}>
                    {item.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>
                      {startWeek === endWeek ? `M${startWeek}` : `M${startWeek}–M${endWeek}`} · {durationWeeks} mgg
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={value}
                      disabled={isSaving}
                      aria-label={`Progres ${item.title}`}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                      }
                      onPointerUp={() => commit(item)}
                      onKeyUp={(e) => {
                        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
                          commit(item);
                        }
                      }}
                      className="h-1.5 flex-1 cursor-pointer accent-orange-500 disabled:cursor-wait"
                    />
                    <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
                      {isSaving ? <Loader2 className="ml-auto size-3 animate-spin" /> : `${value}%`}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {Math.round(item.targetVolume * (value / 100) * 100) / 100} / {item.targetVolume} {item.unit}
                  </p>
                </div>

                <div className="relative flex-1">
                  {/* Garis kolom minggu */}
                  <div className="absolute inset-0 flex">
                    {weeks.map((w) => (
                      <div key={w} className="flex-1 border-r border-border/30 last:border-r-0" />
                    ))}
                  </div>

                  {/* Bar rencana + isi progres */}
                  <div
                    className="absolute top-1/2 h-7 -translate-y-1/2 overflow-hidden rounded-md border border-border/80 bg-muted/40"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${item.title}: ${value}%`}
                  >
                    <div
                      className={`h-full transition-[width] duration-150 ${value >= 100 ? "bg-emerald-600/80" : "bg-orange-500/70"}`}
                      style={{ width: `${value}%` }}
                    />
                    <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-bold text-white drop-shadow">
                      {value}%
                    </span>
                  </div>

                  {/* Garis hari ini */}
                  {todayPct !== null && (
                    <div
                      className="pointer-events-none absolute inset-y-0 w-px bg-rose-400/80"
                      style={{ left: `${todayPct}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
