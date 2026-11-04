"use server";

import { revalidatePath } from "next/cache";
import { ProjectPolygonType, ProjectStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { area, center, length } from "@turf/turf";
import {
  isSurveyGeoJSON,
  isSurveyGeoJSONWithinLimit,
  measureSurveyGeoJSON,
  type SurveyGeoJSON,
} from "@/lib/field-survey-geojson";
import { auth } from "../../../auth";
import { z } from "zod";
import {
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import { FIELD_SURVEY_PHOTO_CLOUDINARY_FOLDER } from "@/lib/field-survey-photo-config";

const surveyRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
  UserRole.DRAFTER,
];

const restrictedProjectRoles: UserRole[] = [
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
];

const saveSurveySchema = z.object({
  projectId: z.string().trim().max(100).nullable().optional(),
  locationName: z.string().trim().min(2, "Nama lokasi minimal 2 karakter.").max(160),
  responsibleName: z
    .string()
    .trim()
    .min(2, "Nama penanggung jawab minimal 2 karakter.")
    .max(120),
  notes: z.string().trim().max(5000, "Catatan maksimal 5.000 karakter."),
  surveyName: z.string().trim().min(2).max(160).optional(),
  objectCategory: z
    .enum([
      "Batas Area Proyek (Polygon)",
      "Jalur Logistik (Line)",
      "Titik Hambatan/Temuan (Point)",
    ])
    .optional(),
  vegetationType: z.string().trim().max(120).optional(),
  topography: z.string().trim().max(120).optional(),
  landOwnership: z.string().trim().max(120).optional(),
  documentationUrls: z
    .array(
      z
        .string()
        .url()
        .refine((value) => {
          return value.startsWith("https://res.cloudinary.com/");
        }, "URL dokumentasi harus berasal dari Cloudinary."),
    )
    .max(10)
    .optional(),
  documentationPhotos: z.array(z.object({
    url: z.string().url(),
    caption: z.string().trim().min(2).max(500),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    capturedAt: z.string().datetime().optional(),
  })).max(10).optional(),
  documentationPhotoFiles: z.array(z.object({
    file: z.instanceof(File),
    caption: z.string().trim().min(2).max(500),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    capturedAt: z.string().datetime().optional(),
  })).max(10).optional(),
  geoJsonData: z.unknown(),
  features: z.array(z.object({
    featureCategory: z.string().trim().min(2).max(120),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(5000).optional(),
    geometryType: z.string().trim().min(2).max(80),
    geoJsonData: z.unknown(),
    photoUrls: z.array(z.string().url()).max(10).optional(),
  })).max(200).optional(),
});

async function getActiveSurveyor() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true, isActive: true },
  });

  return user?.isActive && surveyRoles.includes(user.role) ? user : null;
}

export type SaveFieldSurveyInput = {
  projectId: string | null;
  locationName: string;
  responsibleName: string;
  notes: string;
  surveyName?: string;
  objectCategory?: string;
  vegetationType?: string;
  topography?: string;
  landOwnership?: string;
  documentationUrls?: string[];
  documentationPhotos?: Array<{
    url: string;
    caption: string;
    latitude: number;
    longitude: number;
    capturedAt?: string;
  }>;
  documentationPhotoFiles?: Array<{
    file: File;
    caption: string;
    latitude: number;
    longitude: number;
    capturedAt?: string;
  }>;
  geoJsonData: SurveyGeoJSON;
  surveyType?: string;
  features?: Array<{
    featureCategory: string;
    name: string;
    description?: string;
    geometryType: string;
    geoJsonData: SurveyGeoJSON["features"][number];
    photoUrls?: string[];
  }>;
};

export async function saveFieldSurveyPhotoUrls(input: {
  surveyId: string;
  photos: Array<{ url?: string; file?: File; label?: string }>;
}): Promise<{
  success: boolean;
  message: string;
  urls?: string[];
  photos?: Array<{ url: string; label: string }>;
}> {
  const surveyor = await getActiveSurveyor();
  if (!surveyor) {
    return { success: false, message: "Sesi atau akses pengguna tidak valid." };
  }

  const surveyId = input?.surveyId?.trim();
  const photos = input?.photos;
  if (
    !surveyId ||
    surveyId.length > 200 ||
    !Array.isArray(photos) ||
    photos.length < 1 ||
    photos.length > 5
  ) {
    return { success: false, message: "Data foto survei tidak valid." };
  }

  const uploadedPhotoUrls: string[] = [];
  let photosPersisted = false;
  let persistedPhotoUrls: string[] = [];
  let persistedPhotos: Array<{ url: string; label: string }> = [];
  try {
    const survey = await prisma.fieldSurvey.findUnique({
      where: { id: surveyId },
      select: {
        id: true,
        surveyorId: true,
        documentationUrls: true,
        photos: { select: { url: true } },
        project: { select: { fieldPicId: true } },
      },
    });

    if (!survey) {
      return { success: false, message: "Survei tidak ditemukan." };
    }

    const canEditSurvey =
      survey.surveyorId === surveyor.id ||
      survey.project?.fieldPicId === surveyor.id ||
      surveyor.role === UserRole.ADMINISTRATIONS ||
      surveyor.role === UserRole.DIRECTOR ||
      surveyor.role === UserRole.DEPUTY_DIRECTOR;
    if (!canEditSurvey) {
      return { success: false, message: "Anda tidak memiliki akses untuk mengubah foto survei ini." };
    }

    const existingUrls = new Set([
      ...survey.documentationUrls,
      ...survey.photos.map((photo) => photo.url),
    ]);
    const preparedPhotos: Array<{ url: string; label: string }> = [];
    for (const photo of photos) {
      if (!photo || typeof photo !== "object") {
        throw new CloudinaryPhotoValidationError("Data foto survei tidak valid.");
      }
      const label = typeof photo.label === "string" ? photo.label.trim() : "";
      if (label.length > 160) {
        throw new CloudinaryPhotoValidationError("Nama foto survei maksimal 160 karakter.");
      }

      if (photo.file instanceof File && !photo.url) {
        const uploaded = await uploadCloudinaryPhoto(
          photo.file,
          FIELD_SURVEY_PHOTO_CLOUDINARY_FOLDER,
          8 * 1024 * 1024,
        );
        uploadedPhotoUrls.push(uploaded.secureUrl);
        preparedPhotos.push({ url: uploaded.secureUrl, label });
        continue;
      }

      const url = typeof photo.url === "string" ? photo.url.trim() : "";
      if (photo.file || !url || !existingUrls.has(url)) {
        throw new CloudinaryPhotoValidationError(
          "Foto survei tidak dikenali. Muat ulang data lalu coba kembali.",
        );
      }
      preparedPhotos.push({ url, label: label || "Foto" });
    }

    const savedUrls = await prisma.$transaction(async (transaction) => {
      const currentSurvey = await transaction.fieldSurvey.findUnique({
        where: { id: surveyId },
        select: {
          surveyorId: true,
          documentationUrls: true,
          photos: { select: { url: true } },
          project: { select: { fieldPicId: true } },
        },
      });
      if (!currentSurvey) throw new Error("Survei tidak ditemukan saat menyimpan foto.");

      const stillCanEdit =
        currentSurvey.surveyorId === surveyor.id ||
        currentSurvey.project?.fieldPicId === surveyor.id ||
        surveyor.role === UserRole.ADMINISTRATIONS ||
        surveyor.role === UserRole.DIRECTOR ||
        surveyor.role === UserRole.DEPUTY_DIRECTOR;
      if (!stillCanEdit) {
        throw new Error("Akses untuk mengubah foto survei telah berubah.");
      }

      const currentUrls = new Set([
        ...currentSurvey.documentationUrls,
        ...currentSurvey.photos.map((photo) => photo.url),
      ]);
      const uniquePhotos = Array.from(
        new Map(preparedPhotos.map((photo) => [photo.url, photo])).values(),
      );
      if (
        uniquePhotos.some(
          (photo) => !uploadedPhotoUrls.includes(photo.url) && !currentUrls.has(photo.url),
        )
      ) {
        throw new Error("Foto survei telah berubah. Muat ulang data lalu coba kembali.");
      }

      for (const photo of uniquePhotos) {
        const existing = await transaction.surveyPhoto.findFirst({
          where: { surveyId, url: photo.url },
          select: { id: true },
        });
        if (existing) {
          await transaction.surveyPhoto.update({
            where: { id: existing.id },
            data: { caption: photo.label },
          });
        } else {
          await transaction.surveyPhoto.create({
            data: {
              surveyId,
              url: photo.url,
              caption: photo.label,
              latitude: 0,
              longitude: 0,
            },
          });
        }
      }

      const savedPhotos = await transaction.surveyPhoto.findMany({
        where: { surveyId },
        orderBy: { createdAt: "asc" },
        select: { url: true },
      });
      const urls = Array.from(
        new Set([...currentSurvey.documentationUrls, ...savedPhotos.map((photo) => photo.url)]),
      ).slice(0, 10);
      await transaction.fieldSurvey.update({
        where: { id: surveyId },
        data: { documentationUrls: urls },
      });
      return urls;
    });
    photosPersisted = true;
    persistedPhotoUrls = savedUrls;
    persistedPhotos = preparedPhotos;

    revalidatePath("/apps/projects");
    return {
      success: true,
      message: "Foto survei berhasil disimpan.",
      urls: savedUrls,
      photos: preparedPhotos,
    };
  } catch (error) {
    if (!photosPersisted) {
      await Promise.all(
        uploadedPhotoUrls.map(async (url) => {
          try {
            await removeCloudinaryPhoto(url);
          } catch (cleanupError) {
            console.error("Removing unattached field survey photo failed:", cleanupError);
          }
        }),
      );
    }
    if (photosPersisted) {
      console.error("Survey photos saved, but route revalidation failed:", error);
      return {
        success: true,
        message: "Foto tersimpan. Muat ulang halaman untuk melihat data terbaru.",
        urls: persistedPhotoUrls,
        photos: persistedPhotos,
      };
    }
    if (error instanceof CloudinaryPhotoValidationError) {
      return { success: false, message: error.message };
    }
    console.error("Saving survey photo URLs failed:", error);
    return { success: false, message: "Foto survei gagal disimpan. Silakan coba kembali." };
  }
}

export async function saveFieldSurvey(input: SaveFieldSurveyInput): Promise<{
  success: boolean;
  message: string;
  surveyId?: string;
}> {
  const surveyor = await getActiveSurveyor();
  if (!surveyor) {
    return { success: false, message: "Sesi atau akses pengguna tidak valid." };
  }

  const parsed = saveSurveySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Data survei tidak valid.",
    };
  }

  const {
    projectId,
    locationName,
    notes,
    geoJsonData,
    surveyName,
    objectCategory,
    vegetationType,
    topography,
    landOwnership,
    documentationUrls,
    documentationPhotos,
    documentationPhotoFiles,
    features,
  } = parsed.data;
  if ((documentationUrls?.length ?? 0) + (documentationPhotoFiles?.length ?? 0) > 10) {
    return {
      success: false,
      message: "Maksimal 10 foto dokumentasi per survei.",
    };
  }
  if (!isSurveyGeoJSON(geoJsonData)) {
    return {
      success: false,
      message: "GeoJSON tidak valid atau jumlah fiturnya di luar batas.",
    };
  }
  if (!isSurveyGeoJSONWithinLimit(geoJsonData)) {
    return {
      success: false,
      message: "Ukuran GeoJSON melebihi batas 20 MB.",
    };
  }

  const project = projectId
    ? await prisma.project.findFirst({
        where: {
          id: projectId,
          isDeleted: false,
          ...(restrictedProjectRoles.includes(surveyor.role)
            ? { fieldPicId: surveyor.id }
            : {}),
        },
        select: { id: true, title: true, name: true, code: true, status: true },
      })
    : null;
  if (projectId && !project) {
    return {
      success: false,
      message: "Proyek tidak ditemukan atau Anda tidak ditugaskan pada proyek ini.",
    };
  }

  const measurements = measureSurveyGeoJSON(geoJsonData);
  const featuresWithGeometry = geoJsonData.features.filter(
    (feature) => feature.geometry,
  );
  if (featuresWithGeometry.length === 0) {
    return {
      success: false,
      message: "GeoJSON harus berisi minimal satu geometri yang valid.",
    };
  }
  const geometryTypes = [
    ...new Set(
      featuresWithGeometry.flatMap((feature) =>
        feature.geometry ? [feature.geometry.type] : [],
      ),
    ),
  ];
  const [longitude, latitude] = center({
    type: "FeatureCollection",
    features: featuresWithGeometry,
  }).geometry.coordinates;
  if (
    !Number.isFinite(measurements.areaSqm) ||
    !Number.isFinite(measurements.lengthM) ||
    !Number.isFinite(measurements.perimeterM)
  ) {
    return {
      success: false,
      message: "Koordinat tidak dapat dihitung. Pastikan data menggunakan WGS84.",
    };
  }

  const uploadedPhotoUrls: string[] = [];
  try {
    for (const photo of documentationPhotoFiles ?? []) {
      uploadedPhotoUrls.push(
        (
          await uploadCloudinaryPhoto(
            photo.file,
            FIELD_SURVEY_PHOTO_CLOUDINARY_FOLDER,
            8 * 1024 * 1024,
          )
        ).secureUrl,
      );
    }
    const savedDocumentationUrls = Array.from(
      new Set([...(documentationUrls ?? []), ...uploadedPhotoUrls]),
    ).slice(0, 10);
    const savedDocumentationPhotos = [
      ...(documentationPhotos ?? []),
      ...(documentationPhotoFiles ?? []).map((photo, index) => ({
        url: uploadedPhotoUrls[index],
        caption: photo.caption,
        latitude: photo.latitude,
        longitude: photo.longitude,
        capturedAt: photo.capturedAt,
      })),
    ];

    const survey = await prisma.$transaction(async (transaction) => {
      const createdSurvey = await transaction.fieldSurvey.create({
      data: {
        projectId: project?.id ?? null,
        projectName: project
          ? project.title || project.name
          : "Survei Pra-Proyek",
        locationName,
        responsibleName: surveyor.name,
        surveyorId: surveyor.id,
        surveyName: surveyName || locationName,
        projectCode: project?.code ?? null,
        objectCategory:
          objectCategory ?? "Batas Area Proyek (Polygon)",
        vegetationType: vegetationType || null,
        topography: topography || null,
        landOwnership: landOwnership || null,
        documentationUrls: savedDocumentationUrls,
        geometryType: geometryTypes.join(", "),
        centerCoordinate: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        geoJsonData: geoJsonData as object,
        areaSqm: measurements.areaSqm,
        lengthM: measurements.lengthM,
        perimeterM: measurements.perimeterM,
        notes: notes || null,
        surveyType: "REHAB_SAWAH",
        features: features?.length
          ? {
              create: features.map((feature) => {
                const geoJsonFeature = feature.geoJsonData as SurveyGeoJSON["features"][number];
                const geometry = geoJsonFeature.geometry;
                const featureMeasurement = geometry
                  ? {
                      areaSqm:
                        geometry.type === "Polygon" ||
                        geometry.type === "MultiPolygon"
                          ? area(geoJsonFeature as never)
                          : null,
                      lengthM:
                        geometry.type === "LineString" ||
                        geometry.type === "MultiLineString" ||
                        geometry.type === "Polygon" ||
                        geometry.type === "MultiPolygon"
                          ? length(geoJsonFeature as never, { units: "meters" })
                          : null,
                    }
                  : { areaSqm: null, lengthM: null };
                return {
                  featureCategory: feature.featureCategory,
                  name: feature.name,
                  description: feature.description || null,
                  geometryType: feature.geometryType,
                  geoJsonData: geoJsonFeature as object,
                  areaSqm: featureMeasurement.areaSqm,
                  lengthM: featureMeasurement.lengthM,
                  photoUrls: feature.photoUrls ?? [],
                };
              }),
            }
          : undefined,
        photos: savedDocumentationPhotos.length
          ? {
              create: savedDocumentationPhotos.map((photo) => ({
                url: photo.url,
                caption: photo.caption,
                latitude: photo.latitude,
                longitude: photo.longitude,
                capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : undefined,
              })),
            }
          : undefined,
      },
      });
      if (project?.id) {
        const polygonFeatures = geoJsonData.features.filter(
          (feature) =>
            feature.geometry?.type === "Polygon" ||
            feature.geometry?.type === "MultiPolygon",
        );
        if (polygonFeatures.length > 0) {
          await transaction.projectPolygon.createMany({
            data: polygonFeatures.map((feature, index) => ({
              projectId: project.id,
              surveyId: createdSurvey.id,
              type:
                project.status === ProjectStatus.RUNNING ||
                project.status === ProjectStatus.ON_PROGRESS ||
                project.status === ProjectStatus.ACTIVE
                  ? ProjectPolygonType.PROJECT
                  : ProjectPolygonType.SURVEY,
              name: `${locationName} · Polygon ${index + 1}`,
              geometryType: feature.geometry?.type ?? "Polygon",
              geoJsonData: feature as object,
            })),
          });
        }
      }
      return createdSurvey;
    });

    revalidatePath("/apps/projects");
    return {
      success: true,
      message: "Data survei berhasil disimpan.",
      surveyId: survey.id,
    };
  } catch (error) {
    await Promise.all(
      uploadedPhotoUrls.map(async (url) => {
        try {
          await removeCloudinaryPhoto(url);
        } catch (cleanupError) {
          console.error("Removing unattached field survey photo failed:", cleanupError);
        }
      }),
    );
    if (error instanceof CloudinaryPhotoValidationError) {
      return {
        success: false,
        message: error.message,
      };
    }
    console.error("Saving field survey failed:", error);
    return {
      success: false,
      message: "Data survei gagal disimpan. Silakan coba kembali.",
    };
  }
}

export async function loadFieldSurveyGeoJSON(
  surveyId: string,
): Promise<{ success: boolean; message: string; data?: SurveyGeoJSON }> {
  const surveyor = await getActiveSurveyor();
  if (!surveyor) {
    return { success: false, message: "Sesi atau akses pengguna tidak valid." };
  }
  if (typeof surveyId !== "string" || surveyId.length > 100) {
    return { success: false, message: "Data survei yang dipilih tidak valid." };
  }

  try {
    const survey = await prisma.fieldSurvey.findFirst({
      where: {
        id: surveyId,
        OR: restrictedProjectRoles.includes(surveyor.role)
          ? [
              {
                project: {
                  isDeleted: false,
                  fieldPicId: surveyor.id,
                },
              },
              { projectId: null, surveyorId: surveyor.id },
            ]
          : [{ project: { isDeleted: false } }, { projectId: null }],
      },
      select: { geoJsonData: true },
    });
    if (
      !survey ||
      !isSurveyGeoJSON(survey.geoJsonData) ||
      !isSurveyGeoJSONWithinLimit(survey.geoJsonData)
    ) {
      return {
        success: false,
        message: "Survei tidak ditemukan atau data spasialnya tidak valid.",
      };
    }

    return { success: true, message: "Data survei berhasil dimuat.", data: survey.geoJsonData };
  } catch (error) {
    console.error("Loading field survey GeoJSON failed:", error);
    return {
      success: false,
      message: "Data survei gagal dimuat. Silakan coba kembali.",
    };
  }
}
