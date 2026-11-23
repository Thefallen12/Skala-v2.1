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
  foundingDate: "2020",
  priceRange: "Rp 0 - Rp 15.000.000",
  description:
    "Platform ERP konstruksi sipil, pengadaan material, logistik armada, keuangan proyek, dan verifikasi dokumen QR resmi PT Skala Prioritas Engineering.",
  englishSummary:
    "Integrated construction engineering, irrigation rehabilitation, material procurement logistics, and project operations ERP platform in Indonesia.",
  email: "info@skala-prioritas.com",
  telephone: "+628135887883",
  telephoneDisplay: "+62 813-5887-883",
  geo: {
    latitude: 4.6247,
    longitude: 96.8467,
  },
  hasMap: "https://maps.google.com/?q=4.6247,96.8467",
  address: {
    streetAddress: "Jl. Lebe Kader No. 18, Takengon",
    addressLocality: "Takengon",
    addressRegion: "Aceh Tengah, Aceh",
    postalCode: "24511",
    addressCountry: "ID",
  },
  addressDisplay:
    "Jl. Lebe Kader No. 18, Takengon, Kabupaten Aceh Tengah, Aceh 24511, Indonesia",
  openingHours: "Senin–Sabtu, 08:00–17:00 WIB",
  logoPath: "/images/logos/logo-notag-full-color.svg",
  externalProfiles: [
    {
      label: "LinkedIn",
      url: "https://www.linkedin.com/company/skala-prioritas-engineering",
    },
    {
      label: "GitHub",
      url: "https://github.com/skala-prioritas-engineering",
    },
    {
      label: "Instagram",
      url: "https://www.instagram.com/skalaprioritas.id",
    },
    {
      label: "YouTube",
      url: "https://www.youtube.com/@skalaprioritasengineering",
    },
    {
      label: "Google Maps",
      url: "https://maps.google.com/?q=4.6247,96.8467",
    },
  ] as const,
  sameAs: Array.from(
    new Set([
      "https://www.linkedin.com/company/skala-prioritas-engineering",
      "https://github.com/skala-prioritas-engineering",
      "https://www.instagram.com/skalaprioritas.id",
      "https://www.youtube.com/@skalaprioritasengineering",
      "https://maps.google.com/?q=4.6247,96.8467",
      ...parseConfiguredSameAs(),
    ]),
  ),
  apk: ANDROID_APK,
} as const;

export interface ServicePackage {
  id: string;
  name: string;
  price: number;
  priceCurrency: "IDR";
  priceDisplay: string;
  billingUnit: string;
  category: string;
  description: string;
  features: readonly string[];
}

export const SERVICE_PACKAGES: readonly ServicePackage[] = [
  {
    id: "portal-qr-mitra",
    name: "Portal Mitra & Verifikasi QR Publik",
    price: 0,
    priceCurrency: "IDR",
    priceDisplay: "Rp 0",
    billingUnit: "Gratis Selamanya",
    category: "Akses Publik & Vendor",
    description:
      "Layanan verifikasi keaslian dokumen Purchase Order, Invoice, Surat Jalan, dan Kontrak Kerja Konstruksi berbasis QR tanpa biaya lisensi.",
    features: [
      "Validasi QR dokumen transaksi 24/7 tanpa login",
      "Status keaslian PO, Delivery Order, dan Invoice real-time",
      "Akses endpoint publik llms.txt & MCP read-only",
    ],
  },
  {
    id: "lisensi-erp-cloud",
    name: "Lisensi Platform ERP Konstruksi & Logistik",
    price: 2500000,
    priceCurrency: "IDR",
    priceDisplay: "Rp 2.500.000",
    billingUnit: "/ bulan",
    category: "SaaS Operasional Proyek",
    description:
      "Langganan sistem ERP web dan aplikasi Android lapangan terpadu untuk monitoring kurva-S, pengadaan material, persetujuan direksi, dan keuangan proyek.",
    features: [
      "Pengelolaan hingga 25 proyek aktif & laporan harian foto geotag",
      "Alur pengajuan tiket lapangan, logistik, PO, dan persetujuan direksi",
      "Rekap realisasi anggaran RAB & dukungan asisten AI Bunglon (SKALA AI)",
    ],
  },
  {
    id: "kontrak-manajemen-konstruksi",
    name: "Kontrak Manajemen Proyek & Rehabilitasi Sipil",
    price: 15000000,
    priceCurrency: "IDR",
    priceDisplay: "Rp 15.000.000",
    billingUnit: "/ paket proyek",
    category: "Jasa Teknik & Pengawasan",
    description:
      "Layanan pendampingan teknis konstruksi sipil, rehabilitasi jaringan irigasi, penyusunan shop drawing/as-built, serta audit pelaporan dinas.",
    features: [
      "Pelaporan progres fisik & kurva-S standar dinas teraudit",
      "Integrasi rantai pasok material alam, armada sewa, & gudang",
      "Penerbitan dokumen transaksi resmi bertanda tangan digital QR",
    ],
  },
] as const;

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
    title: "PT Skala Prioritas Engineering — Konstruksi & ERP Proyek",
    description:
      "Platform ERP konstruksi sipil, pengadaan material, logistik armada, keuangan proyek, dan verifikasi dokumen QR resmi PT Skala Prioritas Engineering.",
    changeFrequency: "weekly",
    priority: 1.0,
  },
  {
    path: "/about",
    title: "Tentang Kami — Profil PT Skala Prioritas Engineering",
    description:
      "Profil perusahaan, kapabilitas konstruksi sipil, manajemen logistik armada, dan tata kelola ERP operasional PT Skala Prioritas Engineering di Aceh Tengah.",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/pricing",
    title: "Harga & Paket Layanan — PT Skala Prioritas Engineering",
    description:
      "Daftar harga transparan paket lisensi ERP konstruksi, portal verifikasi QR mitra, dan layanan kontrak manajemen proyek PT Skala Prioritas Engineering.",
    changeFrequency: "weekly",
    priority: 0.9,
  },
  {
    path: "/contact",
    title: "Kontak Resmi & Alamat — PT Skala Prioritas Engineering",
    description:
      "Hubungi kantor operasional PT Skala Prioritas Engineering di Takengon, Aceh Tengah melalui email, telepon resmi, atau verifikasi dokumen transaksi QR.",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/terms",
    title: "Syarat & Ketentuan — PT Skala Prioritas Engineering",
    description:
      "Syarat dan ketentuan penggunaan sistem ERP konstruksi, aplikasi mobile lapangan, dan layanan verifikasi dokumen QR PT Skala Prioritas Engineering.",
    changeFrequency: "yearly",
    priority: 0.6,
  },
  {
    path: "/privacy",
    title: "Kebijakan Privasi — PT Skala Prioritas Engineering",
    description:
      "Kebijakan privasi, perlindungan data personel, dan keamanan informasi operasional pada platform ERP dan aplikasi PT Skala Prioritas Engineering.",
    changeFrequency: "yearly",
    priority: 0.6,
  },
] as const;

export function getPublicPageMeta(path: string): PublicPageEntry {
  return PUBLIC_PAGES.find((page) => page.path === path) ?? PUBLIC_PAGES[0];
}

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/" ? `${SITE_URL}/` : `${SITE_URL}${normalized}`;
}

export function buildOfferNodes() {
  return SERVICE_PACKAGES.map((pkg) => ({
    "@type": "Offer",
    "@id": `${SITE_URL}/pricing#${pkg.id}`,
    name: pkg.name,
    category: pkg.category,
    description: pkg.description,
    price: pkg.price,
    priceCurrency: pkg.priceCurrency,
    availability: "https://schema.org/InStock",
    url: absoluteUrl("/pricing"),
    seller: { "@id": `${SITE_URL}/#organization` },
  }));
}

export function buildOrganizationNode() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: COMPANY_PROFILE.legalName,
    alternateName: COMPANY_PROFILE.shortName,
    legalName: COMPANY_PROFILE.legalName,
    foundingDate: COMPANY_PROFILE.foundingDate,
    url: absoluteUrl("/"),
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
      {
        "@type": "ContactPoint",
        telephone: COMPANY_PROFILE.telephone,
        email: COMPANY_PROFILE.email,
        contactType: "sales",
        areaServed: "ID",
        availableLanguage: ["id", "en"],
      },
    ],
    sameAs: COMPANY_PROFILE.sameAs,
  };
}

export function buildLocalBusinessNode() {
  return {
    "@type": "LocalBusiness",
    additionalType: "https://schema.org/GeneralContractor",
    "@id": `${SITE_URL}/#localbusiness`,
    name: COMPANY_PROFILE.legalName,
    url: absoluteUrl("/"),
    image: absoluteUrl(COMPANY_PROFILE.logoPath),
    logo: absoluteUrl(COMPANY_PROFILE.logoPath),
    telephone: COMPANY_PROFILE.telephone,
    email: COMPANY_PROFILE.email,
    priceRange: COMPANY_PROFILE.priceRange,
    foundingDate: COMPANY_PROFILE.foundingDate,
    description: COMPANY_PROFILE.description,
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
    hasMap: COMPANY_PROFILE.hasMap,
    geo: {
      "@type": "GeoCoordinates",
      latitude: COMPANY_PROFILE.geo.latitude,
      longitude: COMPANY_PROFILE.geo.longitude,
    },
    address: {
      "@type": "PostalAddress",
      ...COMPANY_PROFILE.address,
    },
    areaServed: ["Aceh Tengah", "Aceh", "Indonesia"],
    openingHours: "Mo-Sa 08:00-17:00",
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
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Paket Layanan Konstruksi & Lisensi ERP PT Skala Prioritas Engineering",
      itemListElement: buildOfferNodes(),
    },
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

export function buildFaqNode() {
  return {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: [
      {
        "@type": "Question",
        name: "Bagaimana cara memverifikasi keaslian dokumen Purchase Order atau Surat Jalan PT Skala Prioritas Engineering?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Masukkan kode verifikasi yang tercetak pada QR Code dokumen di ${absoluteUrl("/verify")} atau langsung kunjungi ${SITE_URL}/verify/{kode}. Layanan verifikasi ini gratis tanpa memerlukan login.`,
        },
      },
      {
        "@type": "Question",
        name: "Berapa biaya paket lisensi ERP Konstruksi & Logistik PT Skala Prioritas Engineering?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Portal Mitra & Verifikasi QR Publik tersedia gratis (Rp 0), paket Lisensi Platform ERP Konstruksi & Logistik mulai Rp 2.500.000/bulan, dan Kontrak Manajemen Proyek mulai Rp 15.000.000/paket proyek. Detail tersedia di ${absoluteUrl("/pricing")}.`,
        },
      },
      {
        "@type": "Question",
        name: "Bagaimana cara menghubungi kantor resmi PT Skala Prioritas Engineering?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Kantor operasional berlokasi di ${COMPANY_PROFILE.addressDisplay}. Hubungi email resmi ${COMPANY_PROFILE.email} atau telepon ${COMPANY_PROFILE.telephoneDisplay} pada jam kerja ${COMPANY_PROFILE.openingHours}.`,
        },
      },
    ],
  };
}

export function buildBreadcrumbNode(path: string, title: string) {
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Beranda",
      item: absoluteUrl("/"),
    },
  ];
  if (path !== "/") {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: title,
      item: absoluteUrl(path),
    });
  }
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(path)}#breadcrumb`,
    itemListElement: items,
  };
}

export function buildHomepageJsonLd() {
  const homeMeta = getPublicPageMeta("/");
  const offers = buildOfferNodes();
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
        name: homeMeta.title,
        description: homeMeta.description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        breadcrumb: { "@id": `${absoluteUrl("/")}#breadcrumb` },
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
        url: absoluteUrl("/pricing"),
        publisher: { "@id": `${SITE_URL}/#organization` },
        offers: {
          "@type": "AggregateOffer",
          lowPrice: 0,
          highPrice: 15000000,
          priceCurrency: "IDR",
          offerCount: offers.length,
          offers,
        },
        description:
          "Aplikasi manajemen proyek konstruksi, pengadaan material, persetujuan direksi berjenjang, dan pelaporan keuangan real-time.",
      },
      {
        "@type": "Service",
        "@id": `${SITE_URL}/#service-construction`,
        name: "Konstruksi Sipil & Rehabilitasi Irigasi",
        serviceType: "Konstruksi Sipil & Rehabilitasi Irigasi",
        provider: { "@id": `${SITE_URL}/#organization` },
        areaServed: "Indonesia",
        offers: offers[2],
        description:
          "Pelaksanaan proyek konstruksi, pengawasan progres harian berbasis kurva-S, dan pengendalian mutu lapangan.",
      },
      {
        "@type": "Service",
        "@id": `${SITE_URL}/#service-logistics`,
        name: "Manajemen Pengadaan, Material Alam & Logistik Armada",
        serviceType: "Manajemen Pengadaan, Material Alam & Logistik Armada",
        provider: { "@id": `${SITE_URL}/#organization` },
        areaServed: "Indonesia",
        offers: offers[1],
        description:
          "Pengelolaan Purchase Order, surat jalan pengiriman material, kontrak supplier, sewa kendaraan/rumah operasional, dan verifikasi dokumen QR.",
      },
      buildFaqNode(),
      buildBreadcrumbNode("/", homeMeta.title),
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
      buildLocalBusinessNode(),
      buildWebsiteNode(),
      {
        "@type": options.pageType ?? "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: options.title,
        description: options.description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        inLanguage: "id-ID",
      },
      buildBreadcrumbNode(options.path, options.title),
    ],
  };
}
