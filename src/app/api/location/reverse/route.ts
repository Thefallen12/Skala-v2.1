import { auth } from "../../../../../auth";

type GoogleAddressComponent = {
  long_name: string;
  types: string[];
};

type GoogleGeocodeResponse = {
  status: string;
  results?: Array<{
    address_components: GoogleAddressComponent[];
  }>;
};

const isCoordinate = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ message: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lon"));
  if (
    !isCoordinate(latitude, -90, 90) ||
    !isCoordinate(longitude, -180, 180)
  ) {
    return Response.json({ message: "Koordinat lokasi tidak valid." }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { message: "Google Maps Geocoding API belum dikonfigurasi." },
      { status: 503 },
    );
  }

  const query = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    language: "id",
    region: "id",
    key: apiKey,
  });

  let response: Response;
  try {
    response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(8_000) },
    );
  } catch {
    return Response.json(
      { message: "Layanan pencarian nama lokasi tidak tersedia." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return Response.json(
      { message: "Nama lokasi tidak dapat ditemukan." },
      { status: 502 },
    );
  }

  let result: GoogleGeocodeResponse;
  try {
    result = (await response.json()) as GoogleGeocodeResponse;
  } catch {
    return Response.json(
      { message: "Respons nama lokasi tidak valid." },
      { status: 502 },
    );
  }

  if (result.status === "ZERO_RESULTS") {
    return Response.json(
      { message: "Nama lokasi tidak tersedia." },
      { status: 404 },
    );
  }
  if (result.status !== "OK" || !result.results?.length) {
    return Response.json(
      { message: "Google Maps tidak dapat menemukan nama lokasi." },
      { status: 502 },
    );
  }

  const components = result.results.flatMap((item) => item.address_components);
  const village = components.find((component) =>
    component.types.includes("administrative_area_level_4"),
  );
  const place =
    village ??
    components.find((component) =>
      component.types.some((type) =>
        [
          "administrative_area_level_3",
          "sublocality_level_1",
          "locality",
          "administrative_area_level_2",
        ].includes(type),
      ),
    );

  if (!place) {
    return Response.json(
      { message: "Nama lokasi tidak tersedia." },
      { status: 404 },
    );
  }

  return Response.json({
    name: place.long_name,
    isVillage: Boolean(village),
  });
}
