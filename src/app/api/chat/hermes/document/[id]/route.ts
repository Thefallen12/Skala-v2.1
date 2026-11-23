import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/../auth";
import { connectToMongoDB, isMongoConnectionError } from "@/lib/mongoose";
import { renderPdf } from "@/lib/documents/render-pdf";
import {
  ChatGeneratedDocumentModel,
  type ChatGeneratedDocumentRecord,
} from "@/models/chat";

export const runtime = "nodejs";

function injectInteractivePrintToolbar(html: string, autoPrint: boolean): string {
  const toolbarStyle = `<style id="hermes-print-toolbar-style">
    .hermes-print-toolbar {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 10px;
      background: rgba(16, 42, 77, 0.95);
      color: #ffffff;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
      font-family: Arial, sans-serif;
      font-size: 12px;
    }
    .hermes-print-toolbar button {
      border: 0;
      border-radius: 7px;
      padding: 6px 12px;
      font-weight: 700;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.2;
    }
    .hermes-print-btn {
      background: #e67e22;
      color: #ffffff;
    }
    .hermes-print-btn:hover {
      background: #c9772d;
    }
    .hermes-close-btn {
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
    }
    .hermes-close-btn:hover {
      background: rgba(255, 255, 255, 0.26);
    }
    @media print {
      .hermes-print-toolbar {
        display: none !important;
      }
    }
  </style>`;

  const toolbarHtml = `<div class="hermes-print-toolbar" role="toolbar" aria-label="Aksi Dokumen">
    <button type="button" class="hermes-print-btn" onclick="window.print()">🖨️ Cetak / Simpan PDF</button>
    <button type="button" class="hermes-close-btn" onclick="window.close()">Tutup</button>
  </div>`;

  const autoPrintScript = autoPrint
    ? `<script>window.addEventListener("load",function(){try{window.print();}catch(_e){}});</script>`
    : "";

  let output = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${toolbarStyle}</head>`)
    : `${toolbarStyle}${html}`;

  output = /<\/body>/i.test(output)
    ? output.replace(/<\/body>/i, `${toolbarHtml}${autoPrintScript}</body>`)
    : `${output}${toolbarHtml}${autoPrintScript}`;

  return output;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk untuk mengakses dokumen ini." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const cleanId = id?.trim();
  if (!cleanId || cleanId.length > 128) {
    return NextResponse.json(
      { message: "ID dokumen tidak valid." },
      { status: 400 },
    );
  }

  try {
    await connectToMongoDB();
  } catch (error) {
    console.error("Hermes document MongoDB connection failed:", error);
    return NextResponse.json(
      {
        message: isMongoConnectionError(error)
          ? "Database dokumen sedang tidak terjangkau."
          : "Gagal terhubung ke database dokumen.",
      },
      { status: 503 },
    );
  }

  const doc = await ChatGeneratedDocumentModel.findById(
    cleanId,
  ).lean<ChatGeneratedDocumentRecord | null>();

  if (!doc) {
    return NextResponse.json(
      { message: "Dokumen Hermes tidak ditemukan." },
      { status: 404 },
    );
  }

  const format = request.nextUrl.searchParams.get("format");
  const download = request.nextUrl.searchParams.get("download") === "1";
  const safeFilename = doc.documentNumber.replace(/[^A-Za-z0-9._-]/g, "_");

  if (format === "pdf") {
    try {
      const pdf = await renderPdf(doc.htmlContent);
      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeFilename}.pdf"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (pdfError) {
      console.error(
        "Hermes document PDF rendering failed, falling back to printable HTML:",
        pdfError,
      );
      const fallbackHtml = injectInteractivePrintToolbar(
        doc.htmlContent,
        download,
      );
      return new NextResponse(fallbackHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  const printableHtml = injectInteractivePrintToolbar(doc.htmlContent, false);
  return new NextResponse(printableHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
