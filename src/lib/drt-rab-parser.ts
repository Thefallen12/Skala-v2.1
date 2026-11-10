import ExcelJS from "exceljs";
import { Readable } from "stream";

export interface MaterialAnalysisItem {
  id: string;
  materialName: string;
  unit: string;
  coefficient: number;
  wastePercent: number; // susut %
  unitPrice?: number;
  totalPrice?: number;
}

export interface ParsedRabItem {
  section: string;
  code: string;
  title: string;
  volume: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  rapPrice: number; // Set to 0 or estimated; user explicitly asked: "kecuali harga RAP"
  analysisItems?: MaterialAnalysisItem[];
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
  if (typeof val === "object" && val !== null) {
    if ("result" in val && val.result !== undefined && val.result !== null) {
      return parseNumberId(val.result);
    }
    if ("text" in val && typeof (val as any).text === "string") {
      return parseNumberId((val as any).text);
    }
  }
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
  let currentWorkItem: ParsedRabItem | null = null;

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
      currentWorkItem = null;

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
        let finalVol = itemVol > 0 ? itemVol : 1;
        let finalUnit = itemUnit || "paket";

        // If volume was 1 or missing, detect explicit volume from title or division title
        // e.g. "PEKERJAAN GALIAN SEDIMEN (131 METER)" -> 131 m
        if (finalVol === 1) {
          const titleVolMatch = (subItemTitle + " " + currentDivTitle).match(/\((\d+(?:[.,]\d+)?)\s*(METER|M3|M2|M|UNIT|BH|LS|HA|ZAK|KG|TITIK)\)/i);
          if (titleVolMatch && titleVolMatch[1]) {
            finalVol = parseNumberId(titleVolMatch[1]);
            const rawUnit = titleVolMatch[2].toLowerCase();
            finalUnit = rawUnit === "meter" ? "m" : rawUnit;
          } else if (itemPrice > 0 && finalTotal > itemPrice) {
            finalVol = Math.round(finalTotal / itemPrice);
          }
        }

        const finalPrice = itemPrice > 0 ? itemPrice : (finalVol > 0 ? Math.round(finalTotal / finalVol) : finalTotal);

        const newWorkItem: ParsedRabItem = {
          section: currentDivNo ? `${currentDivNo}. ${currentDivTitle}` : "Pekerjaan",
          code: currentDivNo ? `${currentDivNo}.${subItemNo}` : `ITM-${subItemNo}`,
          title: subItemTitle,
          volume: finalVol,
          unit: finalUnit,
          unitPrice: Math.round(finalPrice),
          totalPrice: Math.round(finalTotal),
          rapPrice: 0, // Explicit requirement: "kecuali harga RAP"
          analysisItems: [],
        };

        workItems.push(newWorkItem);
        currentWorkItem = newWorkItem;
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
        // Attach to current work item analysis
        if (currentWorkItem) {
          const itemVol = currentWorkItem.volume > 0 ? currentWorkItem.volume : 1;
          const volVal = vol > 0 ? vol : (total > 0 && unitPrice > 0 ? total / unitPrice : 1);
          const coeff = parseFloat((volVal / itemVol).toFixed(4));
          currentWorkItem.analysisItems = currentWorkItem.analysisItems || [];
          currentWorkItem.analysisItems.push({
            id: `mat_${currentWorkItem.code}_${currentWorkItem.analysisItems.length + 1}`,
            materialName: cell4,
            unit: unit || "unit",
            coefficient: coeff > 0 ? coeff : 1,
            wastePercent: 0,
            unitPrice: unitPrice > 0 ? unitPrice : undefined,
            totalPrice: total > 0 ? total : undefined,
          });
        }

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

/**
 * Standard Indonesian DRT & SNI analysis template generator.
 * Accurately auto-populates labor and material breakdown according to work item title.
 */
export function getStandardAnalysisForWorkItem(
  title: string,
  volume: number = 1,
  unit: string = "m"
): MaterialAnalysisItem[] {
  const t = title.toLowerCase();

  // 1. Galian Tanah / Sedimen
  if (t.includes("galian") || t.includes("sedimen") || t.includes("lumpur")) {
    return [
      {
        id: "mat_gal_1",
        materialName: "Pekerja",
        unit: "OH",
        coefficient: 0.3893, // 51 OH / 131 m
        wastePercent: 0,
      },
      {
        id: "mat_gal_2",
        materialName: "Mandor",
        unit: "OH",
        coefficient: 0.0229, // 3 OH / 131 m
        wastePercent: 0,
      },
    ];
  }

  // 2. Pasangan Batu (Campuran 1:4)
  if (t.includes("pasangan batu") || t.includes("pas. batu") || t.includes("batu kali") || t.includes("batu belah")) {
    return [
      {
        id: "mat_batu_1",
        materialName: "Batu Belah/Batu Kali/Batu Gunung",
        unit: "m3",
        coefficient: 1.0,
        wastePercent: 0,
      },
      {
        id: "mat_batu_2",
        materialName: "Pasir Pasang",
        unit: "m3",
        coefficient: 0.4038,
        wastePercent: 2,
      },
      {
        id: "mat_batu_3",
        materialName: "Semen 40 kg",
        unit: "Zak",
        coefficient: 4.2043,
        wastePercent: 2,
      },
      {
        id: "mat_batu_4",
        materialName: "Pekerja",
        unit: "OH",
        coefficient: 1.247,
        wastePercent: 0,
      },
      {
        id: "mat_batu_5",
        materialName: "Tukang Batu",
        unit: "OH",
        coefficient: 0.4157,
        wastePercent: 0,
      },
      {
        id: "mat_batu_6",
        materialName: "Mandor",
        unit: "OH",
        coefficient: 0.1306,
        wastePercent: 0,
      },
    ];
  }

  // 3. Plesteran (1:3 or 1:4 tebal 15mm)
  if (t.includes("plesteran") || t.includes("acian")) {
    return [
      {
        id: "mat_ples_1",
        materialName: "Semen 40 kg",
        unit: "Zak",
        coefficient: 0.267,
        wastePercent: 2,
      },
      {
        id: "mat_ples_2",
        materialName: "Pasir Pasang",
        unit: "m3",
        coefficient: 0.024,
        wastePercent: 2,
      },
      {
        id: "mat_ples_3",
        materialName: "Pekerja",
        unit: "OH",
        coefficient: 0.107,
        wastePercent: 0,
      },
      {
        id: "mat_ples_4",
        materialName: "Tukang Batu",
        unit: "OH",
        coefficient: 0.053,
        wastePercent: 0,
      },
      {
        id: "mat_ples_5",
        materialName: "Mandor",
        unit: "OH",
        coefficient: 0.011,
        wastePercent: 0,
      },
    ];
  }

  // 4. Beton / Rabat / Pondasi
  if (t.includes("beton") || t.includes("rabat") || t.includes("cor")) {
    return [
      {
        id: "mat_beton_1",
        materialName: "Semen 40 Kg",
        unit: "Zak",
        coefficient: 8.15,
        wastePercent: 2,
      },
      {
        id: "mat_beton_2",
        materialName: "Pasir beton",
        unit: "m3",
        coefficient: 0.54,
        wastePercent: 2,
      },
      {
        id: "mat_beton_3",
        materialName: "Kerikil",
        unit: "m3",
        coefficient: 0.76,
        wastePercent: 2,
      },
      {
        id: "mat_beton_4",
        materialName: "Molen",
        unit: "Hari",
        coefficient: 0.1,
        wastePercent: 0,
      },
      {
        id: "mat_beton_5",
        materialName: "Pekerja",
        unit: "OH",
        coefficient: 1.65,
        wastePercent: 0,
      },
      {
        id: "mat_beton_6",
        materialName: "Tukang Batu",
        unit: "OH",
        coefficient: 0.275,
        wastePercent: 0,
      },
      {
        id: "mat_beton_7",
        materialName: "Mandor",
        unit: "OH",
        coefficient: 0.083,
        wastePercent: 0,
      },
    ];
  }

  // 5. Bekisting
  if (t.includes("bekisiting") || t.includes("bekisting") || t.includes("cetakan")) {
    return [
      {
        id: "mat_bek_1",
        materialName: "Multipleks 12 mm",
        unit: "Lembar",
        coefficient: 0.35,
        wastePercent: 2,
      },
      {
        id: "mat_bek_2",
        materialName: "Kayu Kelas III",
        unit: "m3",
        coefficient: 0.04,
        wastePercent: 2,
      },
      {
        id: "mat_bek_3",
        materialName: "Paku Kayu",
        unit: "kg",
        coefficient: 0.4,
        wastePercent: 2,
      },
      {
        id: "mat_bek_4",
        materialName: "Minyak Bekisting",
        unit: "Liter",
        coefficient: 0.2,
        wastePercent: 0,
      },
      {
        id: "mat_bek_5",
        materialName: "Pekerja",
        unit: "OH",
        coefficient: 0.52,
        wastePercent: 0,
      },
      {
        id: "mat_bek_6",
        materialName: "Tukang Kayu",
        unit: "OH",
        coefficient: 0.26,
        wastePercent: 0,
      },
      {
        id: "mat_bek_7",
        materialName: "Mandor",
        unit: "OH",
        coefficient: 0.026,
        wastePercent: 0,
      },
    ];
  }

  // 6. Pembesian / Besi Beton
  if (t.includes("pembesian") || t.includes("besi") || t.includes("tulangan")) {
    return [
      {
        id: "mat_besi_1",
        materialName: "Besi Beton Polos",
        unit: "kg",
        coefficient: 1.05,
        wastePercent: 2,
      },
      {
        id: "mat_besi_2",
        materialName: "Kawat Ikat",
        unit: "kg",
        coefficient: 0.015,
        wastePercent: 2,
      },
      {
        id: "mat_besi_3",
        materialName: "Pekerja",
        unit: "OH",
        coefficient: 0.007,
        wastePercent: 0,
      },
      {
        id: "mat_besi_4",
        materialName: "Tukang Besi",
        unit: "OH",
        coefficient: 0.007,
        wastePercent: 0,
      },
      {
        id: "mat_besi_5",
        materialName: "Mandor",
        unit: "OH",
        coefficient: 0.0004,
        wastePercent: 0,
      },
    ];
  }

  // 7. Pengadaan Pipa & Perlengkapan
  if (t.includes("pipa") || t.includes("screen") || t.includes("saringan")) {
    return [
      {
        id: "mat_pipa_1",
        materialName: "Pipa Besi 12\"",
        unit: "m",
        coefficient: 1.0,
        wastePercent: 0,
      },
      {
        id: "mat_pipa_2",
        materialName: "Bar Screen (Saringan Sedimen)",
        unit: "Unit",
        coefficient: 0.083,
        wastePercent: 0,
      },
    ];
  }

  // 8. Perlengkapan K3 / APD
  if (t.includes("k3") || t.includes("helm") || t.includes("sepatu") || t.includes("safety")) {
    return [
      {
        id: "mat_k3_1",
        materialName: "Helm Safety",
        unit: "Unit",
        coefficient: 1.0,
        wastePercent: 0,
      },
      {
        id: "mat_k3_2",
        materialName: "Sepatu safety boot",
        unit: "Unit",
        coefficient: 1.0,
        wastePercent: 0,
      },
    ];
  }

  // Default fallback for any general item
  return [
    {
      id: "mat_gen_1",
      materialName: "Pekerja",
      unit: "OH",
      coefficient: 1.0,
      wastePercent: 0,
    },
    {
      id: "mat_gen_2",
      materialName: "Mandor",
      unit: "OH",
      coefficient: 0.1,
      wastePercent: 0,
    },
  ];
}
