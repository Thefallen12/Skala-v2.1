import { auth } from "../../../../../auth";

type NominatimResult = {
  address?: {
    village?: string;
    suburb?: string;
    town?: string;
    city_district?: string;
    municipality?: string;
    city?: string;
    county?: string;
    state?: string;
  };
  display_name?: string;
};

const isCoordinate = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

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

  try {
    const nominatimUrl = new URL("https://nominatim.openstreetmap.org/reverse");
    nominatimUrl.search = new URLSearchParams({
      format: "jsonv2",
      lat: latitude.toFixed(6),
      lon: longitude.toFixed(6),
      zoom: "14",
      "accept-language": "id",
    }).toString();

    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "SkalaPrioritasERP/2.1",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (response.ok) {
      const data = (await response.json()) as NominatimResult;
      const addr = data.address;
      const primary =
        addr?.village ||
        addr?.suburb ||
        addr?.town ||
        addr?.city_district ||
        addr?.municipality;
      const secondary = addr?.city || addr?.county || addr?.state;
      const locationLabel =
        primary && secondary
          ? `${primary}, ${secondary}`
          : primary || secondary || "Indonesia";

      return Response.json({
        name: locationLabel,
        isVillage: Boolean(addr?.village || addr?.suburb),
      });
    }
  } catch {
    // Fallback below if offline or timeout
  }

  return Response.json({
    name: `Koordinat ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
    isVillage: false,
  });
}
