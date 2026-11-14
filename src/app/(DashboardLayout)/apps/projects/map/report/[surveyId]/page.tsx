import { notFound } from "next/navigation";
import { area } from "@turf/turf";
import { prisma } from "@/lib/prisma";
import { BrandLogo } from "@/components/ui/brand-logo";
import { createBrandedQrDataUrl } from "@/lib/documents/qr-code";
import { resolvePublicAppUrl } from "@/lib/documents/public-app-url";
import ReportStaticMapLoader from "./ReportStaticMapLoader";
import Image from 'next/image';

type Coordinate = [number, number];
type GeometryData = {
  type: string;
  coordinates?: unknown;
};
type ReportFeature = {
  id: string;
  featureCategory: string;
  name: string;
  description: string | null;
  geometryType: string;
  geoJsonData: unknown;
  areaSqm: number | null;
  lengthM: number | null;
  photoUrls: string[];
  photos?: Array<{ url: string; caption: string; latitude: number; longitude: number }>;
};

function coordinatesFromGeometry(geometry: unknown): Coordinate[] {
  if (!geometry || typeof geometry !== "object" || !("type" in geometry) || !("coordinates" in geometry)) {
    return [];
  }
  const coordinates = (geometry as { coordinates: unknown }).coordinates;
  const result: Coordinate[] = [];
  const visit = (value: unknown) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      result.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  visit(coordinates);
  return result;
}

function geometryFromFeature(feature: unknown): GeometryData | null {
  if (
    !feature ||
    typeof feature !== "object" ||
    !("geometry" in feature) ||
    !feature.geometry ||
    typeof feature.geometry !== "object" ||
    !("type" in feature.geometry) ||
    typeof feature.geometry.type !== "string"
  ) {
    return null;
  }
  return feature.geometry as GeometryData;
}

function StaticSurveyMap({
  features,
}: {
  features: ReportFeature[];
}) {
  const data = {
    type: "FeatureCollection" as const,
    features: features
      .map((feature) => feature.geoJsonData)
      .filter(
        (feature): feature is {
          type: "Feature";
          geometry: GeometryData;
          properties?: Record<string, unknown> | null;
        } =>
          Boolean(
            feature &&
              typeof feature === "object" &&
              "type" in feature &&
              feature.type === "Feature" &&
              "geometry" in feature &&
              feature.geometry &&
              typeof feature.geometry === "object",
          ),
      ),
  };
  if (data.features.length === 0) {
    return <div className="grid h-64 place-items-center bg-slate-100 text-sm text-slate-500">Belum ada geometri.</div>;
  }
  return (
    <div className="h-[250px] w-full overflow-hidden bg-slate-200">
      <ReportStaticMapLoader data={data as never} />
    </div>
  );
}

export default async function SurveyReportPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  const survey = await prisma.fieldSurvey.findUnique({
    where: { id: surveyId },
    include: { project: { select: { title: true, name: true, code: true } }, surveyor: { select: { name: true } }, features: true, photos: true },
  });
  if (!survey) notFound();
  const coordinator = await prisma.user.findUnique({
    where: { email: "gunawan.ariga1@gmail.com" },
    select: { name: true, email: true },
  });
  const legacyData =
    survey.geoJsonData &&
    typeof survey.geoJsonData === "object" &&
    "features" in survey.geoJsonData &&
    Array.isArray(survey.geoJsonData.features)
      ? survey.geoJsonData.features
      : [];
  const features: ReportFeature[] =
    survey.features.length > 0
      ? survey.features.map((feature, index) => ({
          ...feature,
          geoJsonData: feature.geoJsonData,
          photoUrls:
            feature.photoUrls.length > 0
              ? feature.photoUrls
              : index === 0
                ? survey.documentationUrls
                : [],
        }))
      : legacyData.map((rawFeature, index) => {
          const feature = rawFeature as {
            geometry?: { type?: string } | null;
          };
          return {
          id: `${survey.id}-legacy-${index}`,
          featureCategory: feature.geometry?.type?.includes("Line")
            ? "Saluran Irigasi"
            : feature.geometry?.type?.includes("Point")
              ? "Titik Kerusakan"
              : "Area Rehab Sawah",
          name: `${survey.locationName} · Fitur ${index + 1}`,
          description: survey.notes,
          geometryType: feature.geometry?.type ?? "Geometry",
          geoJsonData: feature,
          areaSqm: null,
          lengthM: null,
          photoUrls: index === 0 ? survey.documentationUrls : [],
          };
        });
  const reportPhotos = features
    .flatMap((feature) =>
      feature.photoUrls.map((url) => ({
        url,
        label: feature.name,
      })),
    )
    .filter((photo, index, photos) => photos.findIndex((item) => item.url === photo.url) === index)
    .slice(0, 5);
  const documentedPhotos = survey.photos
    .map((photo) => ({
      url: photo.url,
      label: photo.caption,
      coordinates: `${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`,
    }))
    .slice(0, 5);
  const totalAreaHa = features.reduce((total, feature) => {
    if (!feature.geometryType.includes("Polygon")) return total;
    return total + (feature.areaSqm ?? area(feature.geoJsonData as never));
  }, 0) / 10_000;
  const projectName = survey.project?.title || survey.project?.name || survey.projectName;
  const cloudinaryLogoUrl =
    process.env.NEXT_PUBLIC_CLOUDINARY_REPORT_LOGO_URL?.trim() ||
    undefined;
  const reportBaseUrl = resolvePublicAppUrl() ?? "http://localhost:3000";
  const reportVerificationUrl = new URL(
    `/report/${encodeURIComponent(survey.id)}`,
    reportBaseUrl,
  ).toString();
  const coordinatorQrResult = await Promise.allSettled([
    createBrandedQrDataUrl(reportVerificationUrl, 180),
  ]);
  if (coordinatorQrResult[0].status === "rejected") {
    console.error(
      "Survey report coordinator QR failed, continuing without QR:",
      coordinatorQrResult[0].reason,
    );
  }
  const coordinatorQrDataUrl =
    coordinatorQrResult[0].status === "fulfilled"
      ? coordinatorQrResult[0].value
      : null;

  return (
    <main className="report-page relative mx-auto min-h-[297mm] w-[210mm] overflow-hidden rounded-[18mm] bg-white px-[15mm] pb-[12mm] pt-[12mm] font-sans text-[#333] shadow-sm print:m-0 print:min-h-0 print:w-[210mm] print:rounded-none print:shadow-none">
      <div className="absolute inset-x-0 top-0 h-[6mm] bg-[#0F2C59]">
        <div className="ml-auto h-full w-[27%] bg-[#F26522] [clip-path:polygon(25%_0,100%_0,100%_100%,0_100%)]" />
      </div>
      <header className="report-header flex items-start justify-between border-b-2 border-[#0F2C59] pb-3">
        <div>
          <div className="flex items-center gap-3">
            <BrandLogo
              src={cloudinaryLogoUrl}
              alt="Skala Prioritas Engineering"
              width={250}
              height={58}
              className="h-[58px] w-[250px] object-contain object-left"
            />
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-[20px] font-extrabold uppercase leading-[1.1] text-[#0F2C59]">LAPORAN REKAP HASIL<br />SURVEI LAPANGAN</h1>
          <p className="mt-1 text-xs font-bold text-[#0F2C59]">NO. LAP: {survey.projectCode ?? "004"}/SPE-SURV/XI/2026</p>
        </div>
      </header>

      <section className="my-5 grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-[#E2E8F0] bg-[#F5F5F5] p-4">
        <p className="report-meta"><b>Nama Proyek</b><span>:</span>{projectName}</p>
        <p className="report-meta"><b>Jenis Vegetasi</b><span>:</span>{survey.vegetationType ?? "—"}</p>
        <p className="report-meta"><b>Nama Lokasi</b><span>:</span>{survey.locationName}</p>
        <p className="report-meta"><b>Kondisi Topografi</b><span>:</span>{survey.topography ?? "—"}</p>
        <p className="report-meta"><b>Luas Area</b><span>:</span>± {totalAreaHa.toFixed(2)} Ha</p>
        <p className="report-meta"><b>Status Kepemilikan</b><span>:</span>{survey.landOwnership ?? "—"}</p>
        <p className="report-meta"><b>Tanggal Survei</b><span>:</span>{new Date(survey.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
        <p className="report-meta"><b>Catatan Lapangan</b><span>:</span>{survey.generalNotes ?? survey.notes ?? "—"}</p>
      </section>

      <section className="report-visual flex-grow">
        <div className="report-map mb-6 overflow-hidden rounded-md border border-[#E2E8F0]"><StaticSurveyMap features={features} /></div>
        <h2 className="mb-2 text-center text-[11px] font-extrabold uppercase tracking-[1px] text-[#0F2C59]">Citra Satelit & Peta Polygon (Atas)</h2>
      </section>

      <section>
        <div className="mb-6 grid grid-cols-5 gap-2.5">
          {(documentedPhotos.length > 0 ? documentedPhotos : reportPhotos).map((photo, index) => (
            <div key={photo.url} className="overflow-hidden rounded border border-[#E2E8F0]">
              <div className="h-[85px] bg-[#eaeaea]">
                <Image src={photo.url} alt={`Foto ${index + 1}`} width={400} height={300} className="h-full w-full object-cover" />
              </div>
              <p className="flex min-h-7 flex-col items-center justify-center bg-[#F5F5F5] p-1 text-center text-[8.5px] font-bold text-[#0F2C59]">
                <span>Foto {index + 1}: {String(photo.label)}</span>
                {"coordinates" in photo && <span className="text-[7px] font-normal text-[#666]">GPS: {String(photo.coordinates)}</span>}
              </p>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 5 - (documentedPhotos.length > 0 ? documentedPhotos.length : reportPhotos.length)) }).map((_, index) => (
            <div key={`empty-${index}`} className="h-[120px] rounded border border-[#E2E8F0] bg-[#eaeaea]" />
          ))}
        </div>
      </section>

      <footer className="mt-auto grid grid-cols-2 gap-6 pt-5 text-center">
        <div><p className="text-[11px] font-bold text-[#0F2C59]">Disusun Oleh / <i>Prepared By</i></p><div className="mb-1 mt-[70px] border-t border-[#333] pt-1 text-[11px] font-bold">{survey.responsibleName || survey.surveyor.name}</div><p className="text-[11px] font-bold text-[#0F2C59]">Tim Survei / Surveyor</p></div>
        <div>
          <p className="text-[11px] font-bold text-[#0F2C59]">Diperiksa Oleh / <i>Checked By</i></p>
          <div className="mt-2 flex flex-col items-center">
            {coordinatorQrDataUrl ? (
              <>
                <Image src={coordinatorQrDataUrl} alt="QR tanda tangan koordinator lapangan" width={48} height={48} className="h-[48px] w-[48px]" />
                <span className="mt-1 text-[7px] text-[#666]">QR verifikasi</span>
              </>
            ) : null}
            <div className="mb-1 mt-2 w-[180px] border-t border-[#333] pt-1 text-[11px] font-bold">{coordinator?.name || "Bambang Gunawan"}</div>
            <p className="text-[11px] font-bold text-[#0F2C59]">Koordinator Lapangan</p>
          </div>
        </div>
      </footer>
      <div className="mt-4 border-t-4 border-[#0F2C59] pt-2 text-center text-sm font-bold tracking-wide text-[#F26522]">ADAPT, IMPROVISE AND FINISH</div>
      <div className="absolute inset-x-0 bottom-0 h-[6mm] bg-[#0F2C59]">
        <div className="ml-auto h-full w-[27%] bg-[#F26522] [clip-path:polygon(25%_0,100%_0,100%_100%,0_100%)]" />
      </div>
    </main>
  );
}
