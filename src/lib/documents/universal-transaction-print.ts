export type UniversalDocumentItem = {
  itemCode?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice?: number | null;
  totalPrice?: number | null;
  remarks?: string | null;
};

export type UniversalDocumentSummary = {
  label: string;
  amount: number;
  emphasis?: boolean;
};

export type UniversalDocumentData = {
  kind: "PO" | "INVOICE" | "KO" | "DO";
  title: string;
  subtitle: string;
  number: string;
  date: string;
  leftDetails: { label: string; value: string }[];
  rightDetails: { label: string; value: string }[];
  items: UniversalDocumentItem[];
  summary?: UniversalDocumentSummary[];
  terms?: string[];
  notes?: string;
  signatures: {
    heading: string;
    name?: string;
    role: string;
    approvalStatus?: "approved" | "pending";
    approvalDate?: string;
  }[];
  logoDataUrl: string;
  verificationPublicCode?: string | null;
  qrDataUrl?: string | null;
  approvalQrDataUrl?: string | null;
  approvalPublicCode?: string | null;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const detail = (row: { label: string; value: string }) =>
  `<p class="detail"><strong>${escapeHtml(row.label)}</strong><span>:</span><span>${escapeHtml(row.value || "-")}</span></p>`;

const bilingualText = (value: string, className: string) => {
  const [indonesian, ...englishParts] = value.split("/");
  const english = englishParts.join("/").trim();
  return `<span class="${className}"><span>${escapeHtml(indonesian.trim())}</span>${
    english ? `<small>${escapeHtml(english)}</small>` : ""
  }</span>`;
};

export function renderUniversalTransactionDocument(
  document: UniversalDocumentData,
) {
  const isDeliveryOrder = document.kind === "DO";
  const rows = document.items
    .map(
      (item, index) =>
        isDeliveryOrder
          ? `
        <tr>
          <td class="center">${index + 1}</td>
          <td class="center">${escapeHtml(item.itemCode || "-")}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="${isDeliveryOrder ? "center" : "number"}">${escapeHtml(item.quantity.toLocaleString("id-ID"))}</td>
          <td class="center">${escapeHtml(item.unit)}</td>
          <td>${escapeHtml(item.remarks || "-")}</td>
        </tr>`
          : `
        <tr>
          <td class="center">${index + 1}</td>
          <td class="center">${escapeHtml(item.itemCode || "-")}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="number">${escapeHtml(item.quantity.toLocaleString("id-ID"))}</td>
          <td class="center">${escapeHtml(item.unit)}</td>
          <td class="money">${item.unitPrice == null ? "-" : currency(item.unitPrice)}</td>
          <td class="money">${item.totalPrice == null ? escapeHtml(item.remarks || "-") : currency(item.totalPrice)}</td>
        </tr>`,
    )
    .join("");

  const summary = document.summary?.length
    ? `<section class="summary">${document.summary
        .map(
          (row) => `
            <p class="summary-row${row.emphasis ? " summary-total" : ""}">
              <strong>${escapeHtml(row.label)}</strong>
              <span>${currency(row.amount)}</span>
            </p>`,
        )
        .join("")}</section>`
    : "";
  const notes = document.notes
    ? `<section class="doc-notes"><strong>CATATAN / NOTES</strong><p>${escapeHtml(document.notes)}</p></section>`
    : "";
  const terms = document.terms?.length
    ? `<section class="doc-terms"><strong>SYARAT &amp; KETENTUAN / TERMS &amp; CONDITIONS</strong><ol>${document.terms
        .map((term) => `<li>${escapeHtml(term)}</li>`)
        .join("")}</ol></section>`
    : "";
  const approval = [
    document.approvalQrDataUrl && document.kind !== "PO"
      ? `<section class="approval"><strong>Verifikasi persetujuan PO</strong><img src="${escapeHtml(document.approvalQrDataUrl)}" alt="QR verifikasi persetujuan PO" /></section>`
      : "",
  ].join("");
  const signatures = document.signatures
    .map((signature, index) => {
      const signatureQrDataUrl =
        document.kind === "PO"
          ? index === 2
            ? document.approvalQrDataUrl
            : null
          : index === 0
            ? document.qrDataUrl
            : null;
      const signatureQr =
        signatureQrDataUrl
          ? `<span class="signature-qr"><img src="${escapeHtml(signatureQrDataUrl)}" alt="${document.kind === "PO" ? "QR tanda tangan persetujuan Direktur/Wakil Direktur" : "QR verifikasi dokumen"}" /></span>`
          : "";
      const approvalQrClass =
        document.kind === "PO" && index === 2 ? " signature-approval-qr" : "";
      const approvalStatus = signature.approvalStatus
        ? `<span class="signature-approval"><span class="signature-approval-status ${signature.approvalStatus}">${signature.approvalStatus === "approved" ? "✓ APPROVED" : "PENDING APPROVAL"}</span>${
            signature.approvalDate
              ? `<span class="signature-approval-date">${escapeHtml(signature.approvalDate)}</span>`
              : ""
          }</span>`
        : "";
      return `
        <div class="signature${signatureQr ? " signature-with-qr" : ""}${approvalQrClass}${approvalStatus ? " signature-with-approval" : ""}">
          ${bilingualText(signature.heading, "signature-heading")}
          ${approvalStatus}
          ${signatureQr}
          <span class="signature-name">${
            signature.name
              ? `<strong>${escapeHtml(signature.name)}</strong>`
              : "........................"
          }</span>
          ${bilingualText(signature.role, "signature-role")}
        </div>`;
    })
    .join("");

  return `<!doctype html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(document.number)}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; color: #172b45; font: 9pt Arial, sans-serif; }
          @media screen {
            html, body { width: 210mm; min-height: 297mm; background: #fff; }
            .transaction-document { width: 210mm; min-height: 297mm; padding: 12mm; }
          }
          .transaction-document { width: 100%; }
          .doc-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
          .doc-logo { display: block; width: 47%; max-width: 325px; height: auto; object-fit: contain; object-position: left top; }
          .doc-heading { width: 53%; color: #102a4d; text-align: right; }
          .doc-heading h1 { margin: 0; font-size: 20pt; font-weight: 800; line-height: 1.15; text-align: right; }
          .doc-title-row { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 4px; }
          .doc-title-row p { margin: 0; color: #c9772d; font-size: 12pt; font-weight: 700; white-space: nowrap; }
          .doc-title-rule { position: relative; flex: 0 0 42%; height: 12px; }
          .doc-title-rule::before, .doc-title-rule::after { position: absolute; right: 0; content: ""; height: 5px; }
          .doc-title-rule::before { top: 0; left: 0; background: #c9772d; }
          .doc-title-rule::after { top: 7px; width: 62%; background: #102a4d; }
          .doc-number { display: block; width: fit-content; margin: 10px 0 0 auto; border: 2px solid transparent; background: linear-gradient(#fff, #fff) padding-box, linear-gradient(90deg, #c9772d 0 48%, #102a4d 48% 100%) border-box; padding: 6px 10px; font-size: 10pt; font-weight: 800; text-align: right; }
          .doc-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin: 14px 0 10px; padding: 10px; border: 1.5px solid #102a4d; border-radius: 9px; background: #f1f5f9; }
          .doc-meta-column { display: grid; align-content: start; gap: 4px; min-width: 0; }
          .detail { display: grid; grid-template-columns: minmax(0, 1fr) 8px minmax(0, 1.1fr); gap: 4px; margin: 0; line-height: 1.25; }
          .detail > * { min-width: 0; overflow-wrap: anywhere; }
          .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .items th, .items td { border: 1px solid #7b8b9b; padding: 5px 6px; vertical-align: top; overflow-wrap: anywhere; }
          .items th { background: #102a4d; color: #fff; text-align: center; }
          .items th:first-child { width: 5%; }
          .items th:nth-child(2) { width: 14%; }
          .items th:nth-child(3) { width: 31%; }
          .items th:nth-child(4) { width: 8%; }
          .items th:nth-child(5) { width: 10%; }
          .items th:nth-child(6), .items th:nth-child(7) { width: 16%; }
          .center { text-align: center; }
          .number { text-align: right; white-space: nowrap; }
          .money { text-align: right; }
          .summary { width: 48%; margin: 0 0 0 auto; border: 1px solid #7b8b9b; border-top: 0; padding: 5px 8px; }
          .summary-row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
          .summary-total { border-top: 1px solid #7b8b9b; padding-top: 5px; color: #102a4d; font-weight: 700; }
          .doc-notes { margin-top: 12px; line-height: 1.35; white-space: pre-wrap; }
          .doc-terms { margin-top: 12px; }
          .doc-terms ol { margin: 5px 0; padding-left: 18px; }
          .approval { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; padding: 8px 10px; border-left: 4px solid #102a4d; background: #f1f5f9; }
          .approval img { width: 58px; height: 58px; object-fit: contain; }
          .doc-signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px; text-align: center; break-inside: avoid; }
          .signature { min-height: 100px; display: flex; flex-direction: column; align-items: center; }
          .signature-heading, .signature-role { display: flex; width: 100%; flex-direction: column; align-items: center; line-height: 1.25; text-align: center; }
          .signature-heading { min-height: 26px; font-weight: 700; }
          .signature-heading small, .signature-role small { margin-top: 2px; color: #64748b; font-size: 7.5pt; font-weight: 400; }
          .signature-approval-status { display: inline-block; margin: 4px 0; border-radius: 999px; padding: 3px 8px; font-size: 7pt; font-weight: 800; letter-spacing: .3px; }
          .signature-approval-status.approved { border: 1px solid #15803d; background: #f0fdf4; color: #166534; }
          .signature-approval-status.pending { border: 1px solid #b45309; background: #fffbeb; color: #92400e; }
          .signature-approval-date { color: #64748b; font-size: 7pt; }
          .signature-with-approval .signature-approval { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
          .signature-with-approval .signature-name { margin-top: 0; }
          .signature-name { min-height: 42px; display: flex; align-items: end; justify-content: center; margin-top: auto; }
          .signature-with-qr { min-height: 160px; }
          .signature-qr { display: flex; width: 100%; align-self: stretch; align-items: center; justify-content: center; margin: 4px 0 0; text-align: center; }
          .signature-qr img { display: block; width: 84px; height: 84px; margin-inline: auto; object-fit: contain; }
          .signature-approval-qr .signature-name { min-height: 30px; margin-top: 4px; }
          .doc-footer { display: flex; align-items: center; gap: 10px; margin-top: 18px; color: #c9772d; font-weight: 900; letter-spacing: 1.5px; }
          .doc-footer::before { content: ""; height: 4px; flex: 1; background: #c9772d; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .transaction-document { padding: 0; }
            .items tr { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <main class="transaction-document">
          <header class="doc-header">
            <img class="doc-logo" src="${escapeHtml(document.logoDataUrl)}" alt="Skala Prioritas Engineering" />
            <div class="doc-heading">
              <h1>${escapeHtml(document.title)}</h1>
              <div class="doc-title-row">
                <span class="doc-title-rule"></span>
                <p>${escapeHtml(document.subtitle)}</p>
              </div>
              <div class="doc-number"><strong>NO. ${escapeHtml(document.kind)}: ${escapeHtml(document.number)}</strong></div>
            </div>
          </header>
          <section class="doc-meta">
            <div class="doc-meta-column">${document.leftDetails.map(detail).join("")}</div>
            <div class="doc-meta-column">${detail({ label: "Tanggal / Date", value: document.date })}${document.rightDetails.map(detail).join("")}</div>
          </section>
          <table class="items">
            <thead>
              ${
                isDeliveryOrder
                  ? "<tr><th>No</th><th>KODE BARANG / ITEM CODE</th><th>MATERIAL</th><th>QTY</th><th>SATUAN / UNIT</th><th>KETERANGAN</th></tr>"
                  : "<tr><th>No</th><th>KODE BARANG / ITEM CODE</th><th>DESKRIPSI BARANG / DESCRIPTION</th><th>QTY</th><th>SATUAN / UNIT</th><th>HARGA SATUAN / UNIT PRICE</th><th>TOTAL / AMOUNT</th></tr>"
              }
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ${summary}${notes}${terms}${approval}
          <section class="doc-signatures">${signatures}</section>
          <footer class="doc-footer">ADAPT, IMPROVISE AND FINISH</footer>
        </main>
      </body>
    </html>`;
}
