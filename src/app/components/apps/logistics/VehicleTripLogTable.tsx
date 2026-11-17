import { Route } from "lucide-react";
import type { VehicleTripLogRow } from "@/lib/vehicle-trip-types";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function VehicleTripLogCard({ log }: { log: VehicleTripLogRow }) {
  return (
    <div className="space-y-2 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-p2 font-semibold text-foreground">
            {log.projectName}
          </p>
          <p className="type-p3 text-muted-foreground">
            {new Date(log.createdAt).toLocaleDateString("id-ID")} ·{" "}
            {log.plateNumber} ({log.vehicleType})
          </p>
        </div>
        <span className="type-p2 shrink-0 font-mono font-bold tabular-nums text-primary">
          {Number(log.distanceKm).toLocaleString("id-ID")} km
        </span>
      </div>
      <div className="type-p3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
        <span className="tabular-nums">
          KM: {Number(log.kilometerStart).toLocaleString("id-ID")}–
          {Number(log.kilometerEnd).toLocaleString("id-ID")}
        </span>
        <span className="font-semibold tabular-nums text-foreground">
          BBM:{" "}
          {Number(log.fuelLiter).toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          L
        </span>
      </div>
      <div className="type-p3 flex items-center justify-between text-muted-foreground">
        <span>DO: {log.doNumber ?? "—"}</span>
        <span>Oleh: {log.createdByName}</span>
      </div>
    </div>
  );
}

export default function VehicleTripLogTable({
  logs,
  emptyMessage = "Belum ada log perjalanan kendaraan.",
}: {
  logs: VehicleTripLogRow[];
  emptyMessage?: string;
}) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Belum Ada Log Perjalanan"
        description={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {logs.map((log) => (
          <VehicleTripLogCard key={log.id} log={log} />
        ))}
      </div>

      <div className="hidden md:block">
        <Table itemLabel="log perjalanan">
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal / Proyek</TableHead>
              <TableHead>Kendaraan</TableHead>
              <TableHead>No. DO</TableHead>
              <TableHead>KM Awal–Akhir</TableHead>
              <TableHead className="text-right">Jarak</TableHead>
              <TableHead className="text-right">Estimasi BBM</TableHead>
              <TableHead>Dicatat Oleh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-normal">
                  <p className="type-p2 font-medium text-foreground">
                    {new Date(log.createdAt).toLocaleDateString("id-ID")}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    {log.projectName}
                  </p>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <p className="type-p2 font-mono font-semibold text-foreground">
                    {log.plateNumber}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    {log.vehicleType}
                  </p>
                </TableCell>
                <TableCell className="type-p2">{log.doNumber ?? "—"}</TableCell>
                <TableCell className="type-p2 tabular-nums">
                  {Number(log.kilometerStart).toLocaleString("id-ID")}–
                  {Number(log.kilometerEnd).toLocaleString("id-ID")}
                </TableCell>
                <TableCell className="type-p2 text-right tabular-nums">
                  {Number(log.distanceKm).toLocaleString("id-ID")} km
                </TableCell>
                <TableCell className="type-p2 text-right font-semibold tabular-nums">
                  {Number(log.fuelLiter).toLocaleString("id-ID", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  L
                </TableCell>
                <TableCell className="type-p2">{log.createdByName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
