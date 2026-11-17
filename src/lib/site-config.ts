import { ANDROID_APK } from "@/lib/apk-config";

const DEFAULT_SITE_URL = "https://skala-prioritas.com";

export function resolveCanonicalSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.DOMAIN,
  ];

  for (const candidate of candidates) {
    const raw = candidate?.trim();
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      const hostname = parsed.hostname.toLowerCase();
      if (
        parsed.protocol === "https:" &&
        hostname !== "localhost" &&
        hostname !== "127.0.0.1" &&
        hostname !== "0.0.0.0"
      ) {
        return parsed.origin;
      }
    } catch {
      continue;
    }
  }

  return DEFAULT_SITE_URL;
}

export const SITE_URL = resolveCanonicalSiteUrl();

function parseConfiguredSameAs(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_COMPANY_SAME_AS || process.env.COMPANY_SAME_AS || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => {
      try {
        const parsed = new URL(entry);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    });
}

export const COMPANY_PROFILE = {
  legalName: "PT Skala Prioritas Engineering",
  shortName: "Skala Prioritas",
  tagline: "Bekerja Terarah, Membangun Presisi",
  motto: "Adapt, Improvise and Finish",
  description:
    "Perusahaan teknik konstruksi sipil, rehabilitasi jaringan irigasi, pengadaan logistik material, serta platform ERP operasional proyek terpadu di Indonesia.",
  englishSummary:
    "Integrated construction engineering, irrigation rehabilitation, material procurement logistics, and project operations ERP platform.",
  email: "info@skala-prioritas.com",
  telephone: "+628135887883",
  telephoneDisplay: "+62 813-5887-883",
  address: {
    streetAddress: "Takengon, Kabupaten Aceh Tengah",
    addressLocality: "Takengon",
    addressRegion: "Aceh",
    postalCode: "24511",
    addressCountry: "ID",
  },
  addressDisplay: "Takengon, Kabupaten Aceh Tengah, Aceh 24511, Indonesia",
  openingHours: "Senin–Sabtu, 08:00–17:00 WIB",
  logoPath: "/images/logos/logo-notag-full-color.svg",
  sameAs: Array.from(
    new Set([
      "https://www.skala-prioritas.com",
      "https://github.com/Thefallen12/Skala-v2.1",
      ...parseConfiguredSameAs(),
    ]),
  ),
  apk: ANDROID_APK,
} as const;

export interface PublicPageEntry {
  path: string;
  title: string;
  description: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
}

export const PUBLIC_PAGES: readonly PublicPageEntry[] = [
  {
    path: "/",
    title: "PT Skala Prioritas Engineering — Konstruksi, Logistik & ERP Operasional",
    description: COMPANY_PROFILE.description,
    changeFrequency: "weekly",
    priority: 1.0,
  },
  {
    path: "/about",
    title: "Tentang PT Skala Prioritas Engineering",
    description:
      "Profil perusahaan, lingkup layanan konstruksi sipil, tata kelola proyek, dan arsitektur sistem operasional PT Skala Prioritas Engineering.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/contact",
    title: "Kontak Resmi PT Skala Prioritas Engineering",
    description:
      "Alamat kantor, telepon, email resmi, jam operasional, dan kanal verifikasi dokumen PT Skala Prioritas Engineering di Takengon, Aceh Tengah.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/terms",
    title: "Syarat dan Ketentuan Layanan",
    description:
      "Syarat dan ketentuan penggunaan situs web skala-prioritas.com, portal ERP internal, verifikasi dokumen digital QR, serta aplikasi Android resmi.",
    changeFrequency: "yearly",
    priority: 0.5,
  },
  {
    path: "/privacy",
    title: "Kebijakan Privasi",
    description:
      "Kebijakan pengelolaan data operasional, autentikasi pengguna, dokumen transaksi, dan perlindungan informasi pada platform PT Skala Prioritas Engineering.",
    changeFrequency: "yearly",
    priority: 0.5,
  },
] as const;

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/" ? `${SITE_URL}/` : `${SITE_URL}${normalized}`;
}

export function buildOrganizationNode() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: COMPANY_PROFILE.legalName,
    alternateName: COMPANY_PROFILE.shortName,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl(COMPANY_PROFILE.logoPath),
    },
    description: COMPANY_PROFILE.description,
    email: COMPANY_PROFILE.email,
    telephone: COMPANY_PROFILE.telephone,
    address: {
      "@type": "PostalAddress",
      ...COMPANY_PROFILE.address,
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: COMPANY_PROFILE.telephone,
        email: COMPANY_PROFILE.email,
        contactType: "customer service",
        areaServed: "ID",
        availableLanguage: ["id", "en"],
      },
    ],
    sameAs: COMPANY_PROFILE.sameAs,
  };
}

export function buildLocalBusinessNode() {
  return {
    "@type": ["LocalBusiness", "ProfessionalService"],
    "@id": `${SITE_URL}/#localbusiness`,
    name: COMPANY_PROFILE.legalName,
    url: SITE_URL,
    image: absoluteUrl(COMPANY_PROFILE.logoPath),
    telephone: COMPANY_PROFILE.telephone,
    email: COMPANY_PROFILE.email,
    description: COMPANY_PROFILE.description,
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
    address: {
      "@type": "PostalAddress",
      ...COMPANY_PROFILE.address,
    },
    areaServed: ["Aceh Tengah", "Aceh", "Indonesia"],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ],
        opens: "08:00",
        closes: "17:00",
      },
    ],
    sameAs: COMPANY_PROFILE.sameAs,
  };
}

export function buildWebsiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: COMPANY_PROFILE.legalName,
    alternateName: COMPANY_PROFILE.shortName,
    description: COMPANY_PROFILE.description,
    inLanguage: "id-ID",
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/verify/{search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildHomepageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationNode(),
      buildLocalBusinessNode(),
      buildWebsiteNode(),
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}/#webpage`,
        url: `${SITE_URL}/`,
        name: PUBLIC_PAGES[0].title,
        description: COMPANY_PROFILE.description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "id-ID",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#erp-application`,
        name: "Skala Prioritas Operational ERP",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Android",
        softwareVersion: COMPANY_PROFILE.apk.version,
        downloadUrl: absoluteUrl(COMPANY_PROFILE.apk.href),
        url: `${SITE_URL}/auth/login`,
        publisher: { "@id": `${SITE_URL}/#organization` },
        description:
          "Aplikasi manajemen proyek konstruksi, pengadaan material, persetujuan direksi berjenjang, dan pelaporan keuangan real-time.",
      },
      {
        "@type": "Service",
        "@id": `${SITE_URL}/#service-construction`,
        serviceType: "Konstruksi Sipil & Rehabilitasi Irigasi",
        provider: { "@id": `${SITE_URL}/#organization` },
        areaServed: "Indonesia",
        description:
          "Pelaksanaan proyek konstruksi, pengawasan progres harian berbasis kurva-S, dan pengendalian mutu lapangan.",
      },
      {
        "@type": "Service",
        "@id": `${SITE_URL}/#service-logistics`,
        serviceType: "Manajemen Pengadaan, Material Alam & Logistik Armada",
        provider: { "@id": `${SITE_URL}/#organization` },
        areaServed: "Indonesia",
        description:
          "Pengelolaan Purchase Order, surat jalan pengiriman material, kontrak supplier, sewa kendaraan/rumah operasional, dan verifikasi dokumen QR.",
      },
    ],
  };
}

export function buildSubpageJsonLd(options: {
  path: string;
  title: string;
  description: string;
  pageType?: "WebPage" | "AboutPage" | "ContactPage";
}) {
  const url = absoluteUrl(options.path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationNode(),
      buildWebsiteNode(),
      {
        "@type": options.pageType ?? "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: options.title,
        description: options.description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "id-ID",
      },
    ],
  };
}
