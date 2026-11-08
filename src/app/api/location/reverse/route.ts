import { auth } from "../../../../../auth";

type AmapResult = {
  status: string;
  info: string;
  locations?: string;
  regeocode?: {
    addressComponent?: {
      township?: string;
      district?: string;
      city?: string | string[];
    };
  };
};

const isCoordinate = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

const requestAmap = async (url: URL): Promise<AmapResult> => {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error("AMap location service request failed.");
  }
  return (await response.json()) as AmapResult;
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { message: "Silakan masuk terlebih dahulu." },
      { status: 401 },
    );
  }

  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  if (
    !isCoordinate(latitude, -90, 90) ||
    !isCoordinate(longitude, -180, 180)
  ) {
    return Response.json(
      { message: "Koordinat lokasi tidak valid." },
      { status: 400 },
    );
  }

  const apiKey = process.env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { message: "AMap Web Service API belum dikonfigurasi." },
      { status: 503 },
    );
  }

  const convertUrl = new URL(
    "https://restapi.amap.com/v3/assistant/coordinate/convert",
  );
  convertUrl.search = new URLSearchParams({
    locations: `${longitude.toFixed(6)},${latitude.toFixed(6)}`,
    coordsys: "gps",
    output: "JSON",
    key: apiKey,
  }).toString();

  let converted: AmapResult;
  try {
    converted = await requestAmap(convertUrl);
  } catch {
    return Response.json(
      { message: "Layanan konversi koordinat AMap tidak tersedia." },
      { status: 502 },
    );
  }
  if (converted.status !== "1" || !converted.locations) {
    return Response.json(
      {
        message: `AMap gagal mengonversi koordinat (${converted.info}).`,
      },
      { status: 502 },
    );
  }

  const reverseUrl = new URL("https://restapi.amap.com/v3/geocode/regeo");
  reverseUrl.search = new URLSearchParams({
    location: converted.locations,
    radius: "1000",
    extensions: "base",
    output: "JSON",
    key: apiKey,
  }).toString();

  let reverse: AmapResult;
  try {
    reverse = await requestAmap(reverseUrl);
  } catch {
    return Response.json(
      { message: "Layanan pencarian nama lokasi AMap tidak tersedia." },
      { status: 502 },
    );
  }
  if (reverse.status !== "1") {
    return Response.json(
      { message: `AMap gagal mencari lokasi (${reverse.info}).` },
      { status: 502 },
    );
  }

  const address = reverse.regeocode?.addressComponent;
  const name = address?.township || address?.district || address?.city;
  const normalizedName = Array.isArray(name) ? name[0] : name;
  if (!normalizedName) {
    return Response.json(
      { message: "Nama desa tidak tersedia untuk lokasi ini." },
      { status: 404 },
    );
  }

  return Response.json({
    name: normalizedName,
    isVillage: Boolean(address?.township),
  });
}
