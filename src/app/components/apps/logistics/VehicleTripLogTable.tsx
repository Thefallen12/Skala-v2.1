import type { VehicleTripLogRow } from "@/lib/vehicle-trip-types";
import { NativeDataTable } from "@/components/ui/native-data-table";

export default function VehicleTripLogTable({
  logs,
  emptyMessage = "Belum ada log perjalanan kendaraan.",
}: {
  logs: VehicleTripLogRow[];
  emptyMessage?: string;
}) {
  return (
    <>
      {/* Mobile Card View (< 768px) */}
      <div className="space-y-2 md:hidden">
        {logs.map((log) => (
          <div
            key={log.id}
            className="space-y-1.5 rounded-xl border border-border/80 bg-card p-3 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{log.projectName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(log.createdAt).toLocaleDateString("id-ID")} · {log.plateNumber} ({log.vehicleType})
                </p>
              </div>
              <span className="shrink-0 font-mono font-bold text-primary">
                {Number(log.distanceKm).toLocaleString("id-ID")} km
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-[11px]">
              <span>
                KM: {Number(log.kilometerStart).toLocaleString("id-ID")}–{Number(log.kilometerEnd).toLocaleString("id-ID")}
              </span>
              <span className="font-semibold text-foreground">
                BBM:{" "}
                {Number(log.fuelLiter).toLocaleString("id-ID", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                L
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>DO: {log.doNumber ?? "—"}</span>
              <span>Oleh: {log.createdByName}</span>
            </div>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>

      {/* Desktop Table View (>= 768px) */}
      <div className="hidden md:block">
      <NativeDataTable itemLabel="log perjalanan">
      <table className="app-data-table w-full min-w-[900px] text-sm">
        <thead className="bg-[#102A4D] text-left text-white">
          <tr>
            <th className="p-3">Tanggal / Proyek</th>
            <th className="p-3">Kendaraan</th>
            <th className="p-3">No. DO</th>
            <th className="p-3">KM Awal–Akhir</th>
            <th className="p-3">Jarak</th>
            <th className="p-3">Estimasi BBM</th>
            <th className="p-3">Dicatat oleh</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr className="border-b" key={log.id}>
              <td className="p-3">
                {new Date(log.createdAt).toLocaleDateString("id-ID")}
                <span className="block text-xs text-muted-foreground">
                  {log.projectName}
                </span>
              </td>
              <td className="p-3">
                {log.plateNumber}
                <span className="block text-xs text-muted-foreground">
                  {log.vehicleType}
                </span>
              </td>
              <td className="p-3">{log.doNumber ?? "—"}</td>
              <td className="p-3">
                {Number(log.kilometerStart).toLocaleString("id-ID")}–
                {Number(log.kilometerEnd).toLocaleString("id-ID")}
              </td>
              <td className="p-3">
                {Number(log.distanceKm).toLocaleString("id-ID")} km
              </td>
              <td className="p-3 font-medium">
                {Number(log.fuelLiter).toLocaleString("id-ID", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                L
              </td>
              <td className="p-3">{log.createdByName}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td className="p-5 text-center text-muted-foreground" colSpan={7}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </NativeDataTable>
      </div>
    </>
  );
}
