export function clampProjectProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

export function calculateWeightedProjectProgress(
  workPoints: Array<{
    progress: number;
    proposedTotalWage: bigint | number | string;
    approvedTotalWage?: bigint | number | string | null;
  }>,
): number {
  if (workPoints.length === 0) return 0;

  const getPointWeight = (point: {
    proposedTotalWage: bigint | number | string;
    approvedTotalWage?: bigint | number | string | null;
  }) => {
    const approved =
      point.approvedTotalWage !== undefined && point.approvedTotalWage !== null
        ? Number(point.approvedTotalWage)
        : 0;
    const proposed = Number(point.proposedTotalWage || 0);
    return approved > 0 ? approved : Math.max(0, proposed);
  };

  const totalWage = workPoints.reduce(
    (total, point) => total + getPointWeight(point),
    0,
  );
  const overallProgress =
    totalWage > 0
      ? workPoints.reduce(
          (total, point) =>
            total +
            clampProjectProgress(point.progress) *
              (getPointWeight(point) / totalWage),
          0,
        )
      : workPoints.reduce(
          (total, point) => total + clampProjectProgress(point.progress),
          0,
        ) / workPoints.length;

  return clampProjectProgress(Math.round(overallProgress * 10) / 10);
}

function parseProjectScheduleTime(
  value: string | Date | null | undefined,
): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const isoCandidate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00.000Z`
    : trimmed;
  const ms = new Date(isoCandidate).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Menghitung target progres rencana berdasarkan rumus Kurva-S kubik standar (3t^2 - 2t^3)
 * agar angka rencana di tabel Master Proyek, filter Perlu Perhatian, dan grafik Kurva S
 * selalu 100% sejalur.
 */
export function calculatePlannedSCurveProgress(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const startMs = parseProjectScheduleTime(startDate);
  const endMs = parseProjectScheduleTime(endDate);
  if (startMs === null || endMs === null || endMs <= startMs) return null;
  if (nowMs <= startMs) return 0;
  if (nowMs >= endMs) return 100;
  const t = Math.max(0, Math.min(1, (nowMs - startMs) / (endMs - startMs)));
  const sCurveRatio = 3 * t * t - 2 * t * t * t;
  return clampProjectProgress(Math.round(sCurveRatio * 1000) / 10);
}

export type SCurvePoint = { x: number; y: number };

export function buildProjectSCurveSeries(input: {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  currentProgress: number;
  dailyReports?: Array<{
    reportDate: string | Date;
    progress: number;
  }>;
  nowMs?: number;
}): {
  planned: SCurvePoint[];
  actual: SCurvePoint[];
  plannedToday: number | null;
} {
  const nowMs = input.nowMs ?? Date.now();
  const parsedStart = parseProjectScheduleTime(input.startDate);
  const parsedEnd = parseProjectScheduleTime(input.endDate);

  const reportPoints = (input.dailyReports ?? [])
    .map((report) => {
      const x = parseProjectScheduleTime(report.reportDate);
      if (x === null) return null;
      return {
        x,
        y: clampProjectProgress(Number(report.progress || 0)),
      };
    })
    .filter((point): point is SCurvePoint => point !== null)
    .sort((a, b) => a.x - b.x);

  const fallbackStart =
    reportPoints[0]?.x ?? nowMs - 30 * 24 * 60 * 60 * 1000;
  const fallbackEnd =
    reportPoints[reportPoints.length - 1]?.x ??
    fallbackStart + 60 * 24 * 60 * 60 * 1000;

  const startMs = parsedStart ?? fallbackStart;
  const endMs =
    parsedEnd !== null && parsedEnd > startMs
      ? parsedEnd
      : Math.max(fallbackEnd, startMs + 30 * 24 * 60 * 60 * 1000);

  const steps = 12;
  const planned: SCurvePoint[] = Array.from({ length: steps + 1 }, (_, idx) => {
    const t = idx / steps;
    const x = Math.round(startMs + (endMs - startMs) * t);
    const sCurve = 3 * t * t - 2 * t * t * t;
    return {
      x,
      y: clampProjectProgress(Math.round(sCurve * 1000) / 10),
    };
  });

  const byDay = new Map<number, number>();
  let runningMax = 0;

  // Titik awal proyek (0% pada tanggal mulai)
  byDay.set(startMs, 0);

  for (const pt of reportPoints) {
    runningMax = Math.max(runningMax, pt.y);
    const existing = byDay.get(pt.x) ?? 0;
    byDay.set(pt.x, Math.max(existing, runningMax));
  }

  const currentClamped = clampProjectProgress(Number(input.currentProgress || 0));
  if (currentClamped > 0 || reportPoints.length > 0) {
    const todayX = Math.max(startMs, Math.min(nowMs, Math.max(endMs, nowMs)));
    runningMax = Math.max(runningMax, currentClamped);
    const existing = byDay.get(todayX) ?? 0;
    byDay.set(todayX, Math.max(existing, runningMax));
  }

  const actual: SCurvePoint[] = Array.from(byDay.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([x, y]) => ({ x, y }));

  const plannedToday = calculatePlannedSCurveProgress(
    input.startDate ?? new Date(startMs),
    input.endDate ?? new Date(endMs),
    nowMs,
  );

  return {
    planned,
    actual,
    plannedToday,
  };
}
