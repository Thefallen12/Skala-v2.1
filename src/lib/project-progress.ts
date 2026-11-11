export function clampProjectProgress(progress: number): number {
  return Math.max(0, Math.min(100, progress));
}

export function calculateWeightedProjectProgress(
  workPoints: Array<{
    progress: number;
    proposedTotalWage: bigint | number;
  }>,
): number {
  if (workPoints.length === 0) return 0;

  const totalWage = workPoints.reduce(
    (total, point) => total + Number(point.proposedTotalWage),
    0,
  );
  const overallProgress =
    totalWage > 0
      ? workPoints.reduce(
          (total, point) =>
            total +
            point.progress * (Number(point.proposedTotalWage) / totalWage),
          0,
        )
      : workPoints.reduce((total, point) => total + point.progress, 0) /
        workPoints.length;

  return clampProjectProgress(Math.round(overallProgress * 10) / 10);
}
