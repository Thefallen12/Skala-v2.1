import ExcelJS from "exceljs";

export interface ParsedRabItem {
  section: string;
  code: string;
  title: string;
  volume: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  rapPrice: number; // Set to 0 or estimated; user explicitly asked: "kecuali harga RAP"
}

export interface ParsedMaterialItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalPrice?: number;
}

export interface ParsedLaborRate {
  role: string;
  unit: string;
  rate: number;
  daysTotal?: number;
}

export interface ParsedDrtRabResult {
  success: boolean;
  message?: string;
  metadata: {
    code: string;
    title: string;
    poktanName: string;
    desa: string;
    kecamatan: string;
    kabupaten: string;
    provinsi: string;
    address: string;
    activityName: string;
    satuanKerja: string;
    year: string;
    landAreaHa: number;
    totalBudget: number;
  };
  workItems: ParsedRabItem[];
  materials: ParsedMaterialItem[];
  laborRates: ParsedLaborRate[];
  divisions: Array<{
    no: string;
    title: string;
    totalPrice: number;
    weightPercent: number;
  }>;
}

/**
 * Normalizes numbers from Indonesian number format e.g. "196.830.000,00" or "14,58" or number values
 */
export function parseNumberId(val: unknown): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;

  // Handle format with dots for thousands and comma for decimal e.g. "159.194.000,00" or "84,20"
  let clean = str.replace(/[^\d.,-]/g, "");
  if (clean.includes(".") && clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (clean.includes(",")) {
    clean = clean.replace(",", ".");
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

function getCellValueText(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  const val = cell.value;
  if (typeof val === "string") return val.trim();
  if (typeof val === "number") return val.toString();
  if (typeof val === "object") {
    if ("text" in val && typeof val.text === "string") return val.text.trim();
    if ("result" in val && val.result !== undefined && val.result !== null) return String(val.result).trim();
    if ("richText" in val && Array.isArray(val.richText)) {
      return val.richText.map((t) => t.text).join("").trim();
    }
  }
  return String(val).trim();
}

/**
 * Parses an Excel Workbook containing official DRT / Poktan RAB documents
 */
export async function parseDrtRabWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParsedDrtRabResult> {
  const workbook = new ExcelJS.Workbook();
  // @ts-expect-error - ExcelJS load handles Buffer and ArrayBuffer
  await workbook.xlsx.load(buffer);

  if (!workbook.worksheets || workbook.worksheets.length === 0) {
    return {
      success: false,
      message: "File Excel kosong atau tidak memiliki lembar kerja (worksheet).",
      metadata: createEmptyMetadata(),
      workItems: [],
      materials: [],
      laborRates: [],
      divisions: [],
    };
  }

  const metadata = createEmptyMetadata();
  const workItems: ParsedRabItem[] = [];
  const materialsMap = new Map<string, ParsedMaterialItem>();
  const laborMap = new Map<string, ParsedLaborRate>();
  const divisions: Array<{ no: string; title: string; totalPrice: number; weightPercent: number }> = [];

  // 1. Scan all sheets for project metadata (Poktan, Desa, Kecamatan, Luas, Total)
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row) => {
      const rowTexts: string[] = [];
      row.eachCell((cell) => {
        rowTexts.push(getCellValueText(cell));
      });
      const fullRowText = rowTexts.join(" ");

      // Detect Poktan Name
      if (/Nama\s*Poktan|Poktan\s*:/i.test(fullRowText) && !metadata.poktanName) {
        const match = fullRowText.match(/(?:Nama\s*Poktan|Poktan)\s*[:=]?\s*(?:Poktan\s*)?([A-Za-z0-9\s]+?)(?:\s*(?:Desa|Kecamatan|Kabupaten|Luas|$))/i);
        if (match && match[1]) {
          metadata.poktanName = match[1].trim();
        }
      }

      // Detect Desa
      if (/Desa|Gampong/i.test(fullRowText) && !metadata.desa) {
        const match = fullRowText.match(/(?:Desa\/Gampong|Desa|Gampong)\s*[:=]?\s*([A-Za-z0-9\s]+?)(?:\s*(?:Kecamatan|Kabupaten|$))/i);
        if (match && match[1]) metadata.desa = match[1].trim();
      }

      // Detect Kecamatan
      if (/Kecamatan/i.test(fullRowText) && !metadata.kecamatan) {
        const match = fullRowText.match(/Kecamatan\s*[:=]?\s*([A-Za-z0-9\s]+?)(?:\s*(?:Kabupaten|Kab|$))/i);
        if (match && match[1]) metadata.kecamatan = match[1].trim();
      }

      // Detect Kabupaten
      if (/Kabupaten/i.test(fullRowText) && !metadata.kabupaten) {
        const match = fullRowText.match(/Kabupaten\s*[:=]?\s*([A-Za-z0-9\s]+?)(?:\s*(?:Provinsi|Tahun|$))/i);
        if (match && match[1]) metadata.kabupaten = match[1].trim();
      }

      // Detect Luas Hektar
      if (/Luas|Luasan/i.test(fullRowText) && metadata.landAreaHa === 0) {
        const match = fullRowText.match(/(?:Luas\s*Hektar\s*Total|Luas|Luasan)\s*[:=]?\s*([0-9.,]+)\s*Ha/i);
        if (match && match[1]) {
          metadata.landAreaHa = parseNumberId(match[1]);
        }
      }

      // Detect Tahun
      if (/Tahun\s*Anggaran/i.test(fullRowText) && metadata.year === "2026") {
        const match = fullRowText.match(/Tahun\s*Anggaran\s*[:=]?\s*(\d{4})/i);
        if (match && match[1]) metadata.year = match[1];
      }

      // Detect Kegiatan
      if (/Kegiatan/i.test(fullRowText) && !metadata.activityName) {
        const match = fullRowText.match(/Kegiatan\s*[:=]?\s*([A-Za-z0-9\/\s()-]+?)(?:\s*(?:Nama|Lokasi|Tahun|$))/i);
        if (match && match[1]) metadata.activityName = match[1].trim();
      }
    });
  }

  // 2. Identify the RAB / Rincian / Rekap sheet
  let rincianSheet: ExcelJS.Worksheet | null = null;
  let rekapSheet: ExcelJS.Worksheet | null = null;
  let upahBahanSheet: ExcelJS.Worksheet | null = null;

  for (const sheet of workbook.worksheets) {
    const name = sheet.name.toLowerCase();
    if (name.includes("rincian") || name.includes("rab") || name.includes("detail")) {
      rincianSheet = sheet;
    } else if (name.includes("rekap")) {
      rekapSheet = sheet;
    } else if (name.includes("upah") || name.includes("bahan") || name.includes("hsp") || name.includes("harga")) {
      upahBahanSheet = sheet;
    }
  }

  // If no specifically named sheet, use worksheets[0]
  if (!rincianSheet && !rekapSheet) {
    rincianSheet = workbook.worksheets[0];
  }

  // 3. Parse Rincian RAB (Detailed Line Items)
  const targetDetailSheet = rincianSheet || rekapSheet;
  if (targetDetailSheet) {
    let currentSection = "I. Pekerjaan Utama";
    let currentJobCode = "";
    let inBahanSubgroup = false;
    let inUpahSubgroup = false;

    targetDetailSheet.eachRow((row) => {
      const colA = getCellValueText(row.getCell(1));
      const colB = getCellValueText(row.getCell(2));
      const colC = getCellValueText(row.getCell(3));
      const colD = getCellValueText(row.getCell(4));
      const colE = getCellValueText(row.getCell(5));
      const colF = getCellValueText(row.getCell(6));
      const colG = getCellValueText(row.getCell(7));

      // Combine first two columns to inspect title
      const label = (colB || colA).trim();
      if (!label) return;

      // Check if this is a Roman numeral Section header (e.g. "I", "II", "III", "IV" or "I. PEKERJAAN ...")
      const isRomanSection =
        /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\.?\s+[A-Z\s0-9()]+$/i.test(label) ||
        (/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(colA) && colB.length > 2);

      if (isRomanSection) {
        currentSection = colA ? `${colA}. ${colB}`.replace(/\.+/, ".").trim() : label;
        currentJobCode = "";
        inBahanSubgroup = false;
        inUpahSubgroup = false;
        return;
      }

      // Check sub-group markers (I BIAYA UPAH / II BIAYA BAHAN)
      if (/BIAYA\s*UPAH/i.test(label)) {
        inUpahSubgroup = true;
        inBahanSubgroup = false;
        return;
      }
      if (/BIAYA\s*BAHAN/i.test(label)) {
        inBahanSubgroup = true;
        inUpahSubgroup = false;
        return;
      }

      // Check Subtotal or Total row
      if (/Subtotal|Jumlah\s*Total|Total\s*RAB|JUMLAH\s*I\+/i.test(label) || /Total\s*RAB/i.test(colA)) {
        const totalVal = parseNumberId(colF || colE || colD || colC);
        if (totalVal > 0 && (/Total\s*RAB/i.test(label) || /JUMLAH/i.test(label))) {
          metadata.totalBudget = totalVal;
        }
        return;
      }

      // Check if row is a Main Sub-item (starts with number 1, 2, 3...)
      const isSubItem = /^\d+$/.test(colA.trim()) && colB.trim().length > 1;

      if (isSubItem) {
        currentJobCode = `${currentSection.split(".")[0] || "I"}.${colA.trim()}`;
        inBahanSubgroup = false;
        inUpahSubgroup = false;

        const vol = parseNumberId(colC);
        const sat = (colD || "paket").trim();
        const harga = parseNumberId(colE);
        const total = parseNumberId(colF) || (vol > 0 && harga > 0 ? vol * harga : parseNumberId(colD));

        workItems.push({
          section: currentSection,
          code: currentJobCode,
          title: colB.trim(),
          volume: vol > 0 ? vol : 1,
          unit: sat || "paket",
          unitPrice: harga > 0 ? harga : (vol > 0 ? Math.round(total / vol) : total),
          totalPrice: total > 0 ? total : harga,
          rapPrice: 0, // Explicitly omitted/0 per user instruction
        });
        return;
      }

      // Check if row is a breakdown item under Bahan or Upah (e.g. "a. Semen 40 kg" or "b. Pasir")
      const isLetterSubitem = /^[a-z]\.?$/i.test(colA.trim()) || /^[a-z]\.\s+[A-Za-z]/i.test(label);
      if (isLetterSubitem) {
        const itemTitle = (colB || label.replace(/^[a-z]\.?\s*/i, "")).trim();
        const vol = parseNumberId(colC || colD);
        const sat = (colD && isNaN(Number(colD)) ? colD : colE && isNaN(Number(colE)) ? colE : "unit").trim();
        const harga = parseNumberId(colE || colF);
        const total = parseNumberId(colF || colG) || vol * harga;

        if (inBahanSubgroup || /Semen|Pasir|Batu|Kayu|Paku|Besi|Pipa|Kerikil|Minyak/i.test(itemTitle)) {
          const existing = materialsMap.get(itemTitle.toLowerCase());
          if (existing) {
            existing.quantity += vol;
            existing.totalPrice = (existing.totalPrice || 0) + total;
          } else {
            materialsMap.set(itemTitle.toLowerCase(), {
              name: itemTitle,
              quantity: vol,
              unit: sat,
              unitPrice: harga,
              totalPrice: total,
            });
          }
        } else if (inUpahSubgroup || /Pekerja|Tukang|Mandor|Operator/i.test(itemTitle)) {
          const roleKey = itemTitle.toLowerCase();
          const existing = laborMap.get(roleKey);
          if (existing) {
            existing.daysTotal = (existing.daysTotal || 0) + vol;
          } else {
            laborMap.set(roleKey, {
              role: itemTitle,
              unit: sat || "OH",
              rate: harga,
              daysTotal: vol,
            });
          }
        }
      }
    });
  }

  // 4. Parse Rekapitulasi Sheet if available
  if (rekapSheet) {
    rekapSheet.eachRow((row) => {
      const c1 = getCellValueText(row.getCell(1));
      const c2 = getCellValueText(row.getCell(2));
      const c3 = getCellValueText(row.getCell(3));
      const c4 = getCellValueText(row.getCell(4));

      if (/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\.?$/i.test(c1.trim()) && c2) {
        const price = parseNumberId(c3);
        const weight = parseNumberId(c4);
        divisions.push({
          no: c1.trim(),
          title: c2.trim(),
          totalPrice: price,
          weightPercent: weight,
        });
      } else if (/JUMLAH|TOTAL/i.test(c2) || /JUMLAH/i.test(c1)) {
        const sumVal = parseNumberId(c3 || c4);
        if (sumVal > 0) metadata.totalBudget = sumVal;
      }
    });
  }

  // 5. Parse Daftar Upah, Bahan dan Peralatan sheet if available
  if (upahBahanSheet) {
    let mode: "UPAH" | "BAHAN" | "LAIN" = "UPAH";
    upahBahanSheet.eachRow((row) => {
      const no = getCellValueText(row.getCell(1));
      const uraian = getCellValueText(row.getCell(2));
      const sat = getCellValueText(row.getCell(3));
      const harga = parseNumberId(getCellValueText(row.getCell(4)));

      if (/DAFTAR TENAGA KERJA/i.test(uraian) || no === "A") {
        mode = "UPAH";
        return;
      }
      if (/DAFTAR BAHAN\/MATERIAL/i.test(uraian) || no === "B") {
        mode = "BAHAN";
        return;
      }
      if (/LAIN-LAIN/i.test(uraian) || no === "C") {
        mode = "LAIN";
        return;
      }

      if (uraian && harga > 0) {
        if (mode === "BAHAN") {
          if (!materialsMap.has(uraian.toLowerCase())) {
            materialsMap.set(uraian.toLowerCase(), {
              name: uraian,
              quantity: 0,
              unit: sat,
              unitPrice: harga,
            });
          }
        } else if (mode === "UPAH") {
          if (!laborMap.has(uraian.toLowerCase())) {
            laborMap.set(uraian.toLowerCase(), {
              role: uraian,
              unit: sat,
              rate: harga,
            });
          }
        }
      }
    });
  }

  // Fallback: If workItems is empty but divisions exist, create workItems from divisions
  if (workItems.length === 0 && divisions.length > 0) {
    for (const d of divisions) {
      workItems.push({
        section: `${d.no}. ${d.title}`,
        code: `${d.no}.1`,
        title: d.title,
        volume: 1,
        unit: "paket",
        unitPrice: d.totalPrice,
        totalPrice: d.totalPrice,
        rapPrice: 0,
      });
    }
  }

  // Derive calculated total budget if not explicitly set
  if (metadata.totalBudget === 0) {
    metadata.totalBudget = workItems.reduce((sum, item) => sum + item.totalPrice, 0);
  }

  // Assemble full address and project title
  const locationParts = [metadata.desa, metadata.kecamatan, metadata.kabupaten, metadata.provinsi].filter(Boolean);
  metadata.address = locationParts.join(", ") || "Aceh Tengah";

  if (!metadata.title) {
    if (metadata.poktanName) {
      metadata.title = `Pembangunan DRT ${metadata.poktanName} (${metadata.address || "Aceh Tengah"})`;
    } else {
      metadata.title = `Pembangunan DRT Irigasi Pertanian (${metadata.year})`;
    }
  }

  if (!metadata.code) {
    metadata.code = `PRJ-${metadata.year}-${Math.floor(100 + Math.random() * 900)}`;
  }

  return {
    success: workItems.length > 0,
    message: workItems.length > 0
      ? `Berhasil membaca ${workItems.length} item pekerjaan RAB dan ${materialsMap.size} material.`
      : "Tidak ditemukan baris item pekerjaan dalam file Excel. Pastikan format tabel memiliki kolom Uraian, Volume, Satuan, dan Harga.",
    metadata,
    workItems,
    materials: Array.from(materialsMap.values()),
    laborRates: Array.from(laborMap.values()),
    divisions,
  };
}

function createEmptyMetadata() {
  return {
    code: "",
    title: "",
    poktanName: "",
    desa: "",
    kecamatan: "",
    kabupaten: "",
    provinsi: "",
    address: "",
    activityName: "",
    satuanKerja: "",
    year: "2026",
    landAreaHa: 0,
    totalBudget: 0,
  };
}
