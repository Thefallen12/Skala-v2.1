---
target: all dashboard app routes UX audit
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\lenov\\Documents\\fik skala\\Skala-v2.1\\src\\app\\(DashboardLayout)"
timestamp: 2026-11-16T04-50-58Z
slug: src-app-dashboardlayout
---
Method: dual-agent (A: 99a24db2-2e6b-418d-8b2b-e3b9fbd5e8d4 · B: 16d095c6-2bfb-4213-9dae-c4d41eb49879)

## Ringkasan penilaian

**Arah utama:** UI sudah kaya fungsi, tetapi terlalu sering meminta pengguna memilih dari banyak pintu masuk sebelum pekerjaan yang perlu diselesaikan terlihat. Prioritas perbaikan sebaiknya: **tampilkan tugas yang perlu ditindaklanjuti, kurangi pilihan setara, lalu jelaskan istilah/status dan pastikan keterbacaan.**

**Cakupan:** struktur sumber semua 31 halaman aplikasi diperiksa. Tampilan langsung ditinjau pada Beranda, Tiket, Proyek, Logistik, Keuangan, dan Persetujuan; Keuangan juga diperiksa pada lebar mobile 390×844. Sesi yang terlihat memakai role Wakil Direktur. Aksi mutasi seperti membuat tiket, menyetujui, atau membayar tidak dijalankan; role lain belum diuji secara visual.

## Kesehatan UX — heuristik Nielsen

| # | Heuristik | Skor | Temuan utama |
|---|---|---:|---|
| 1 | Status sistem terlihat | 3/4 | Tahap/status dan badge antrean terlihat, tetapi umur atau tenggat pekerjaan kurang menonjol. |
| 2 | Sesuai bahasa dunia nyata | 2/4 | Label Indonesia membantu, tetapi APH, DED, CCO, BAST, SPK, PO, dan DO mengasumsikan pengetahuan domain. |
| 3 | Kontrol dan kebebasan pengguna | 3/4 | Pencarian, filter, navigasi balik, dan keluar dari modal tersedia; undo untuk keputusan yang sudah disimpan belum terverifikasi. |
| 4 | Konsistensi dan standar | 2/4 | Kerangka aplikasi cukup seragam, tetapi navigasi pekerjaan berbeda-beda: Logistik 7 tab, Keuangan 7 tujuan, detail Proyek 6 tab. |
| 5 | Pencegahan kesalahan | 2/4 | Validasi ada di beberapa form, tetapi perlindungan dan konfirmasi aksi berisiko belum diuji menyeluruh. |
| 6 | Kenali, jangan hafalkan | 3/4 | Label, breadcrumb, pencarian, dan hitungan membantu; sebagian tujuan penting masih tersembunyi di tab/menu. |
| 7 | Fleksibilitas dan efisiensi | 2/4 | Quick action, pencarian `Ctrl+K`, dan bulk selection membantu; jalur cepat untuk tugas rutin masih terbatas. |
| 8 | Minimalis dan fokus | 2/4 | Beranda dan Keuangan menampilkan banyak metrik, aksi, grafik, dan ringkasan yang saling berebut perhatian. |
| 9 | Bantu mengenali dan pulih dari error | 2/4 | Kode sumber menunjukkan toast sukses/error, tetapi pemulihan tanpa kehilangan isian atau pembatalan keputusan belum diverifikasi. |
| 10 | Bantuan dan dokumentasi | 1/4 | Deskripsi halaman tersedia, tetapi bantuan kontekstual atau glosarium tugas tidak terlihat pada layar yang ditinjau. |
| **Total** |  | **22/40** | **Cukup** — perlu perbaikan nyata pada prioritas dan kemudahan menemukan pekerjaan. |

### Beban kognitif

**Tinggi: 6 dari 8 pemeriksaan gagal atau lemah.** Pengelompokan dan hitungan membantu, tetapi fokus, hierarki, jumlah pilihan, penyajian bertahap, dan kebutuhan membandingkan banyak alternatif masih membebani.

Contoh pilihan di atas ambang praktis empat: Beranda menampilkan 6 quick actions; Logistik 7 tab (`LogisticsHub.tsx:906–956`); Keuangan 7 tujuan kerja (`FinanceHub.tsx:1823`); detail Proyek 6 tab (`ProjectWorkstationMaster.tsx:2893–2928`). Ini membuat pengguna harus memetakan sendiri “saya harus mulai dari mana?”

## Kekhususan produk dan hal yang sudah bekerja

**Penilaian:** alur dan istilah operasional terasa dibuat untuk Skala Prioritas Engineering, tetapi tampilan dashboard masih cukup generik. Peluang terbesarnya adalah menjadikan **langkah berikutnya per role** lebih menonjol daripada daftar seluruh kemampuan sistem.

Yang sudah bekerja:
- Navigasi dikelompokkan, mengikuti akses role, menunjukkan lokasi aktif, dan menyediakan pencarian serta quick action (`Sidebar.tsx`, `sidebaritems.ts`, `Search.tsx`, `DashboardLayoutClient.tsx`).
- Halaman Tiket membuat status alur dan hitungan antrean mudah dipindai; tabel dapat dicari.
- Keuangan dan Persetujuan memberi hitungan pekerjaan serta label tindakan yang konkret; Persetujuan juga punya tampilan riwayat.

## Prioritas perbaikan

1. **[P1] Beranda memiliki terlalu banyak titik awal yang bersaing.** Enam KPI, enam quick actions, dan lima tahap proses muncul sebelum pekerjaan terbaru menjadi fokus. **Perbaikan:** dahulukan antrean “Perlu tindakan Anda” yang dipersonalisasi per role; tampilkan 1–3 shortcut utama, pindahkan sisanya ke “Aksi lainnya”, dan jadikan diagram proses sekunder/lipat. Sumber: `src/app/(DashboardLayout)/page.tsx:397`, `TopCards.tsx:119–131`, `WorkflowSchemaBoard.tsx:256–473`. *Arah: `/impeccable distill`.*
2. **[P1] Antrean kerja Keuangan berada setelah ringkasan dan grafik.** Pengguna harus melewati KPI/grafik untuk mencapai antrean seperti PO dan tagihan, terutama terasa pada layar mobile. **Perbaikan:** tempatkan antrean dan hitungan tindakannya di atas; pindahkan grafik ke ringkasan sekunder. Sumber: `FinanceHub.tsx:1790–1880, 3106–3136`. *Arah: `/impeccable layout`.*
3. **[P2] Tujuh tab Logistik terlihat setara.** Tiket masuk, stok, PO/DO, alat, armada, vendor, dan kontrak menambah beban memilih. **Perbaikan:** kelompokkan menjadi beberapa area utama—misalnya Permintaan, Pengadaan/Stok, Armada—lalu tampilkan tugas rinci setelah area dipilih dan urutkan sesuai role. Sumber: `LogisticsHub.tsx:906–956`. *Arah: `/impeccable distill`.*
4. **[P2] Navigasi bawah mobile menyembunyikan Keuangan untuk role eksekutif yang diamati.** Keuangan masih dapat dibuka lewat drawer, jadi bukan jalan buntu, tetapi pengguna harus mencari ulang. **Perbaikan:** sediakan “Lainnya” atau pilih tujuan berdasarkan modul yang benar-benar boleh diakses dan frekuensi kerja; jangan menghilangkan modul yang tersedia tanpa petunjuk. Sumber: `MobileBottomNav.tsx:118–196`. *Arah: `/impeccable adapt`.*
5. **[P2] Istilah domain dan kontras dapat menghambat pemahaman.** Akronim tidak selalu dijelaskan. Pemeriksaan browser juga menemukan banyak indikasi `low-contrast`; detector sumber statis tidak menemukan isu, dan temuan browser tidak dipetakan ke elemen sumber tertentu. **Perbaikan:** perluas istilah saat pertama muncul dan ukur ulang kontras pada elemen yang ditandai sebelum menetapkan perbaikannya. Sumber label: `sidebaritems.ts`, `WorkflowSchemaBoard.tsx`, `ExecutiveApprovalHub.tsx`. *Arah: `/impeccable clarify` dan audit kontras terarah.*

## Temuan detector dan batas verifikasi

- Detector statis pada `src/app/(DashboardLayout)` selesai dengan exit code 0 dan hasil `[]` (**0 temuan**).
- Detector pada halaman browser melaporkan `low-contrast` di Beranda (57–58), Tiket (47), Proyek (54), Logistik (35–37), dan Persetujuan (3). `skipped-heading` juga muncul pada Proyek dan Persetujuan. Jumlah sedikit berubah antar pemuatan; lokasi menunjuk chunk Next.js, bukan elemen sumber yang pasti. Anggap ini **indikasi untuk verifikasi**, bukan daftar bug terkonfirmasi.
- Tab audit baru dapat memuat detector pada lima rute tersebut. Saya belum memverifikasi overlay masih tampil di tab browser Anda, jadi saya tidak mengklaim overlay terlihat di sana.
- Temuan tampilan berasal dari role Wakil Direktur; alur aksi tulis, role lain, dan seluruh variasi responsive belum diuji.

## Persona: tanda bahaya

- **Direktur/Wakil Direktur di ponsel:** Keuangan tidak tampil di bottom nav yang diamati; perpindahan dari Persetujuan memerlukan drawer.
- **Koordinator Logistik:** tujuh tab sejajar belum menunjukkan pekerjaan mana yang paling mendesak.
- **PIC lapangan baru:** istilah DED, opname, dan Kurva S, ditambah enam tab detail Proyek, mengasumsikan familiaritas dengan sistem.

## Catatan kecil

- Nilai “Total Estimasi” di tampilan Tiket terpotong dengan elipsis sehingga jumlahnya tidak terbaca (`TicketFilter.tsx:142–150`).
- Judul/lokasi halaman di header dapat terpotong pada lebar desktop/tablet tertentu (`Header.tsx:31–40, 130–180`).
- Widget lokasi di Beranda bisa menambah gangguan jika lokasi bukan kebutuhan awal semua role (`CurrentLocation.tsx`).

## Pertanyaan desain

- Untuk Wakil Direktur, apakah Beranda sebaiknya memulai dari keputusan tertunda dan umurnya, bukan KPI dan diagram proses?
- Dari enam quick action Beranda, mana 1–3 yang paling sering dipakai setiap role?
- Apakah semua modul tetap harus tampak di navigasi mobile, atau cukup lewat “Lainnya” yang jelas?
