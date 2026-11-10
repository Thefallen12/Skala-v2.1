import ExcelJS from "exceljs";
import { Readable } from "stream";

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
  total?: number;
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

function createEmptyMetadata() {
  return {
    code: `PRJ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    title: "",
    poktanName: "",
    desa: "",
    kecamatan: "",
    kabupaten: "",
    provinsi: "",
    address: "",
    activityName: "",
    satuanKerja: "",
    year: String(new Date().getFullYear()),
    landAreaHa: 0,
    totalBudget: 0,
  };
}

/**
 * Parses an Excel or CSV file containing official DRT / Poktan RAB documents
 */
export async function parseDrtRabWorkbook(bufferInput: ArrayBuffer | Buffer): Promise<ParsedDrtRabResult> {
  const buf = Buffer.isBuffer(bufferInput) ? bufferInput : Buffer.from(bufferInput);
  const workbook = new ExcelJS.Workbook();

  // Check if buffer is a PKZip file (Excel .xlsx)
  const isZip = buf.length >= 4 &&
    buf[0] === 0x50 && buf[1] === 0x4B &&
    buf[2] === 0x03 && buf[3] === 0x04;

  try {
    if (isZip) {
      // @ts-expect-error - ExcelJS load handles Buffer
      await workbook.xlsx.load(buf);
    } else {
      // Plain text CSV stream
      const text = buf.toString("utf-8");
      const stream = Readable.from([text]);
      await workbook.csv.read(stream);
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal membaca file: format file tidak dikenali atau korup (${err?.message || "format error"}).`,
      metadata: createEmptyMetadata(),
      workItems: [],
      materials: [],
      laborRates: [],
      divisions: [],
    };
  }

  if (!workbook.worksheets || workbook.worksheets.length === 0) {
    return {
      success: false,
      message: "File kosong atau tidak memiliki lembar kerja (worksheet).",
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
  const divisionsMap = new Map<string, { no: string; title: string; totalPrice: number; weightPercent: number }>();

  // 1. Scan all sheets for project metadata (Poktan, Desa, Kecamatan, Luas, Total)
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row) => {
      const rowValues = (row.values as any[]) || [];
      const fullRowText = rowValues.map((v) => (v !== null && v !== undefined ? String(v) : "")).join(" ");

      // Detect Satuan Kerja & Luas
      if (/Satuan\s*Kerja/i.test(fullRowText)) {
        for (let i = 1; i <= 20; i++) {
          const num = parseNumberId(row.getCell(i).value);
          if (num > 0 && num < 1000 && !metadata.landAreaHa) {
            metadata.landAreaHa = num;
          }
          const text = getCellValueText(row.getCell(i));
          if (/Direktorat|Dinas/i.test(text) && !metadata.satuanKerja) {
            metadata.satuanKerja = text;
          }
        }
      }

      // Detect Luas from other cells
      if (/Luas|Luasan/i.test(fullRowText) && !metadata.landAreaHa) {
        const match = fullRowText.match(/(\d+[.,]\d+)\s*(?:Ha|Hektar)/i);
        if (match && match[1]) {
          metadata.landAreaHa = parseNumberId(match[1]);
        }
      }

      // Detect Kegiatan
      if (/Kegiatan/i.test(fullRowText) && !metadata.activityName) {
        for (let i = 1; i <= 15; i++) {
          const val = getCellValueText(row.getCell(i));
          if (/DRT|SID|Rehabilitasi|Pembangunan/i.test(val)) {
            metadata.activityName = val;
            break;
          }
        }
      }

      // Detect Nama Poktan
      if (/Nama\s*Poktan|Poktan/i.test(fullRowText) && !metadata.poktanName) {
        for (let i = 1; i <= 15; i++) {
          const val = getCellValueText(row.getCell(i));
          if (/Bintang|Kejora|Poktan|Maju|Tani/i.test(val) && !/Nama\s*Poktan/i.test(val)) {
            metadata.poktanName = val.startsWith("Poktan ") ? val : `Poktan ${val}`;
            break;
          }
        }
      }

      // Detect Lokasi
      if (/Lokasi/i.test(fullRowText) && !metadata.address) {
        for (let i = 1; i <= 15; i++) {
          const val = getCellValueText(row.getCell(i));
          if (/Desa|Kecamatan|Kabupaten/i.test(val)) {
            metadata.address = val;
            const matchDesa = val.match(/Desa\s+([A-Za-z\s]+?)\s+Kecamatan/i);
            if (matchDesa) metadata.desa = matchDesa[1].trim();
            const matchKec = val.match(/Kecamatan\s+([A-Za-z\s]+?)\s+Kabupaten/i);
            if (matchKec) metadata.kecamatan = matchKec[1].trim();
            const matchKab = val.match(/Kabupaten\s+([A-Za-z\s]+)/i);
            if (matchKab) metadata.kabupaten = matchKab[1].trim();
            break;
          }
        }
      }

      // Detect Tahun
      if (/Tahun\s*Anggaran/i.test(fullRowText)) {
        const matchYear = fullRowText.match(/20\d{2}/);
        if (matchYear) metadata.year = matchYear[0];
      }

      // Detect Total Budget / Pagu
      if (/JUMLAH\s*I\+|Total\s*RAB|PAGU/i.test(fullRowText)) {
        for (let i = 1; i <= 20; i++) {
          const num = parseNumberId(row.getCell(i).value);
          if (num > 1000000) {
            metadata.totalBudget = Math.max(metadata.totalBudget, num);
          }
        }
      }
    });
  }

  // 2. Identify target sheet containing RAB line items
  let targetDetailSheet = workbook.worksheets[0];
  for (const sheet of workbook.worksheets) {
    const name = sheet.name.toLowerCase();
    if (name.includes("rincian") || name.includes("rab") || name.includes("detail")) {
      targetDetailSheet = sheet;
      break;
    }
  }

  // 3. Parse Detailed Line Items, Divisions, Materials, and Labor Rates
  let currentDivNo = "";
  let currentDivTitle = "";
  let currentItemNo = "";
  let currentItemTitle = "";

  targetDetailSheet.eachRow((row) => {
    const cell2 = getCellValueText(row.getCell(2));
    const cell3 = getCellValueText(row.getCell(3));
    const cell4 = getCellValueText(row.getCell(4));

    // Check Roman Division Header (e.g. Col 2 is "I", "II", "III", "IV" and Col 3 is "PEKERJAAN ...")
    const isRomanDiv = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(cell2) && cell3.length > 2;
    if (isRomanDiv) {
      currentDivNo = cell2.toUpperCase();
      currentDivTitle = cell3;
      currentItemNo = "";
      currentItemTitle = "";

      const divTotal = parseNumberId(row.getCell(10).value) || parseNumberId(row.getCell(7).value);
      divisionsMap.set(currentDivNo, {
        no: currentDivNo,
        title: currentDivTitle,
        totalPrice: divTotal,
        weightPercent: 0,
      });
      return;
    }

    // Check Sub-item:
    // Format A: Col 3 is number (1, 2, 3...) and Col 4 is title (e.g. Div I-III)
    // Format B: Col 2 is number (1, 2, 3...) and Col 3 is title (e.g. Div IV Pekerjaan Lain-lain)
    let subItemNo = "";
    let subItemTitle = "";
    let itemTotal = 0;
    let itemVol = 0;
    let itemUnit = "";
    let itemPrice = 0;

    if (/^\d+$/.test(cell3) && cell4.length > 1) {
      subItemNo = cell3;
      subItemTitle = cell4;
      itemTotal = parseNumberId(row.getCell(10).value);
      itemVol = parseNumberId(row.getCell(7).value);
      itemUnit = getCellValueText(row.getCell(8)) || "paket";
      itemPrice = parseNumberId(row.getCell(9).value);
    } else if (/^\d+$/.test(cell2) && cell3.length > 1 && !/^[a-z]$/i.test(cell2)) {
      subItemNo = cell2;
      subItemTitle = cell3;
      itemVol = parseNumberId(row.getCell(7).value) || 1;
      itemUnit = getCellValueText(row.getCell(8)) || "Ls";
      itemPrice = parseNumberId(row.getCell(9).value);
      itemTotal = parseNumberId(row.getCell(10).value) || (itemVol * itemPrice);
    }

    if (subItemNo && subItemTitle) {
      currentItemNo = subItemNo;
      currentItemTitle = subItemTitle;

      // Only import active/funded items (totalPrice > 0 or volume > 0)
      if (itemTotal > 0 || (itemVol > 0 && itemPrice > 0)) {
        const finalTotal = itemTotal > 0 ? itemTotal : (itemVol * itemPrice);
        const finalVol = itemVol > 0 ? itemVol : 1;
        const finalPrice = itemPrice > 0 ? itemPrice : (finalTotal / finalVol);

        workItems.push({
          section: currentDivNo ? `${currentDivNo}. ${currentDivTitle}` : "Pekerjaan",
          code: currentDivNo ? `${currentDivNo}.${subItemNo}` : `ITM-${subItemNo}`,
          title: subItemTitle,
          volume: finalVol,
          unit: itemUnit || "paket",
          unitPrice: Math.round(finalPrice),
          totalPrice: Math.round(finalTotal),
          rapPrice: 0, // Explicit requirement: "kecuali harga RAP"
        });
      }
      return;
    }

    // Check Breakdown line (Labor / Material / Alat)
    // Col 3 is "a", "b", "c", Col 4 is material/labor name
    if (/^[a-z]$/i.test(cell3) && cell4.length > 1) {
      const vol = parseNumberId(row.getCell(7).value);
      const unit = getCellValueText(row.getCell(8)) || "";
      const unitPrice = parseNumberId(row.getCell(9).value);
      const total = parseNumberId(row.getCell(10).value);

      if (total > 0 || vol > 0) {
        const isLabor = /OH|OJ|Mandor|Pekerja|Tukang/i.test(unit) || /Mandor|Pekerja|Tukang/i.test(cell4);
        if (isLabor) {
          const key = `${cell4}_${unit}`.toLowerCase();
          const existing = laborMap.get(key);
          if (existing) {
            existing.daysTotal = (existing.daysTotal || 0) + vol;
            existing.total = (existing.total || 0) + total;
          } else {
            laborMap.set(key, {
              role: cell4,
              unit: unit || "OH",
              rate: unitPrice,
              daysTotal: vol,
              total,
            });
          }
        } else {
          const key = `${cell4}_${unit}`.toLowerCase();
          const existing = materialsMap.get(key);
          if (existing) {
            existing.quantity += vol;
            existing.totalPrice = (existing.totalPrice || 0) + total;
          } else {
            materialsMap.set(key, {
              name: cell4,
              quantity: vol,
              unit: unit || "unit",
              unitPrice,
              totalPrice: total,
            });
          }
        }
      }
    }
  });

  // Calculate sum of active workItems if metadata.totalBudget wasn't parsed
  const sumWorkItems = workItems.reduce((acc, it) => acc + it.totalPrice, 0);
  if (metadata.totalBudget === 0 && sumWorkItems > 0) {
    metadata.totalBudget = sumWorkItems;
  }

  // Calculate division weights
  const divisions = Array.from(divisionsMap.values()).map((div) => ({
    ...div,
    weightPercent: metadata.totalBudget > 0 ? (div.totalPrice / metadata.totalBudget) * 100 : 0,
  }));

  // Build clean title if not present
  if (!metadata.title) {
    const loc = metadata.desa || metadata.kecamatan || metadata.address || "Aceh";
    metadata.title = `Pembangunan ${metadata.activityName || "DRT"} ${metadata.poktanName || "Poktan"} (${loc})`;
  }

  return {
    success: workItems.length > 0 || metadata.totalBudget > 0,
    message: workItems.length > 0
      ? `Berhasil membaca ${workItems.length} item pekerjaan RAB!`
      : "Tidak ditemukan item pekerjaan dengan anggaran valid di lembar kerja.",
    metadata,
    workItems,
    materials: Array.from(materialsMap.values()),
    laborRates: Array.from(laborMap.values()),
    divisions,
  };
}
