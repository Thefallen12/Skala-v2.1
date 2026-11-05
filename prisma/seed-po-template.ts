import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { DocType } from "../src/generated/prisma/enums";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");

const prisma = new PrismaClient();

const name = "Template Purchase Order Material";
const contentHtml = `
  <table class="po-header">
    <tbody><tr>
      <td><h1 class="po-title">PURCHASE ORDER</h1></td>
      <td><p class="po-logo">LOGO</p></td>
    </tr></tbody>
  </table>
  <table class="po-meta">
    <tbody><tr>
      <td><strong>PO NO.:</strong> {{nomor_dokumen}}</td>
      <td><strong>DATE:</strong> {{tanggal}}</td>
      <td><strong>DUE DATE:</strong> {{due_date}}</td>
    </tr></tbody>
  </table>
  <table class="po-parties">
    <thead><tr><th>FROM</th><th>VENDOR</th></tr></thead>
    <tbody><tr>
      <td>
        <strong>SKALA PRIORITAS</strong><br>
        Requester: {{nama_requester}}<br>
        Proyek: {{nama_proyek}}<br>
        Request: {{judul_request}}<br>
        {{lokasi_pengiriman}}
      </td>
      <td>
        <strong>{{nama_vendor}}</strong><br>
        {{alamat_vendor}}<br>
        {{kontak_vendor}}
      </td>
    </tr></tbody>
  </table>
  <table class="items po-items">
    <thead><tr>
      <th>DESCRIPTION</th>
      <th class="number">QTY</th>
      <th class="money">UNIT PRICE</th>
      <th class="money">AMOUNT</th>
    </tr></thead>
    <tbody><tr>
      <td>Contoh material</td>
      <td>1</td>
      <td>Rp 0</td>
      <td>Rp 0</td>
    </tr></tbody>
  </table>
  <table class="po-summary">
    <tbody><tr>
      <td class="po-notes"><strong>NOTES:</strong><br>{{catatan}}</td>
      <td>
        <table class="po-totals"><tbody>
          <tr><th>SUBTOTAL</th><td class="money">{{total_biaya}}</td></tr>
          <tr><th>DISCOUNT</th><td class="money">{{diskon}}</td></tr>
          <tr><th>TAXES</th><td class="money">{{pajak}}</td></tr>
          <tr><th>TOTAL</th><td class="money"><strong>{{total_biaya}}</strong></td></tr>
        </tbody></table>
      </td>
    </tr></tbody>
  </table>
  <p class="po-footer">TERIMA KASIH ATAS KERJA SAMA ANDA!</p>
  <table class="po-verification"><tbody><tr>
    <td><strong>Dokumen resmi</strong><br>{{nomor_dokumen}}</td>
    <td>{{qr_signature}}</td>
  </tr>
    </tbody>
  </table>
`;

async function main() {
  const existing = await prisma.documentTemplate.findFirst({
    where: { name, type: DocType.PURCHASE_ORDER },
    select: { id: true },
  });
  const data = {
    name,
    type: DocType.PURCHASE_ORDER,
    contentHtml,
    variables:
      "nomor_dokumen,nomor_request,judul_request,tanggal,tanggal_spk,due_date,nama_proyek,nama_klien,nama_requester,nama_vendor,alamat_vendor,kontak_vendor,lokasi_pengiriman,items_table,items_rows,items,total_biaya,diskon,pajak,catatan,verification_url,qr_signature",
  };

  if (existing) {
    await prisma.documentTemplate.update({
      where: { id: existing.id },
      data,
    });
    console.log(`Updated ${name} (${existing.id})`);
    return;
  }

  const created = await prisma.documentTemplate.create({ data });
  console.log(`Created ${name} (${created.id})`);
}

main()
  .catch((error: unknown) => {
    console.error("PO template seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
