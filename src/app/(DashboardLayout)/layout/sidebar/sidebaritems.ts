export interface ChildItem {
  id?: number | string
  name?: string
  subtitle?: string
  icon?: string
  url?: string
  menuKey?: string
  badgeLabel?: string
  children?: ChildItem[]
  requiresUserManagement?: boolean
  requiresLogistics?: boolean
  requiresExecutive?: boolean
  requiresFinance?: boolean
  requiresProjects?: boolean
  requiresDrafter?: boolean
  requiresNonMover?: boolean
}

export interface MenuItem {
  heading?: string
  stepNumber?: string
  name?: string
  icon?: string
  id?: number | string
  url?: string
  menuKey?: string
  children?: ChildItem[]
  requiresNonMover?: boolean
}

const SidebarContent: MenuItem[] = [
  {
    heading: '01 · Komando & Jadwal',
    stepNumber: '01',
    children: [
      {
        name: 'Command Center',
        subtitle: 'Ringkasan & Alur Kerja',
        icon: 'solar:widget-2-bold-duotone',
        url: '/',
        menuKey: 'dashboard',
      },
      {
        name: 'Jadwal & Timesheet',
        subtitle: 'Tugas Harian & Habit',
        icon: 'solar:calendar-mark-bold-duotone',
        url: '/apps/habits',
        menuKey: 'habits',
      },
      {
        name: 'Catatan Operasional',
        subtitle: 'Memo & Dokumentasi Tim',
        icon: 'solar:notes-bold-duotone',
        url: '/apps/notes',
        menuKey: 'notes',
      },
    ],
  },
  {
    heading: '02 · Proyek & Teknik',
    stepNumber: '02',
    children: [
      {
        name: 'Master Proyek & GIS',
        subtitle: 'Data Proyek, Kurva & Peta',
        icon: 'solar:buildings-2-bold-duotone',
        url: '/apps/projects',
        menuKey: 'master_proyek',
        requiresProjects: true,
      },
      {
        name: 'Jadwal Proyek (Gantt)',
        subtitle: 'Timeline, Fase & Milestone',
        icon: 'solar:calendar-date-bold-duotone',
        url: '/apps/projects/schedule',
        menuKey: 'master_proyek',
        requiresProjects: true,
      },
      {
        name: 'Peta Survei Lapangan',
        subtitle: 'WebGIS & Titik Koordinat',
        icon: 'solar:map-point-wave-bold-duotone',
        url: '/apps/projects/map',
        menuKey: 'master_proyek',
        requiresProjects: true,
      },
      {
        name: 'Gambar Kerja (DED)',
        subtitle: 'Shop Drawing & As-Built',
        icon: 'solar:ruler-pen-bold-duotone',
        url: '/apps/drafter',
        menuKey: 'drafter',
        requiresDrafter: true,
      },
    ],
  },
  {
    heading: '03 · Pengadaan & Logistik',
    stepNumber: '03',
    children: [
      {
        name: 'Tiket & Permintaan',
        subtitle: 'Material, Alat & Dana',
        icon: 'solar:ticket-bold-duotone',
        url: '/apps/tickets',
        menuKey: 'tickets',
        requiresNonMover: true,
      },
      {
        id: 'nav-logistics-hub',
        name: 'Logistik & Pengiriman',
        subtitle: 'Tugas Pengiriman & DO',
        icon: 'solar:delivery-bold-duotone',
        url: '/apps/logistics',
        menuKey: 'logistik',
        requiresLogistics: true,
      },
      {
        id: 'nav-logistics-stock',
        name: 'Gudang & Stok Material',
        subtitle: 'Inventaris & Beli Stok',
        icon: 'solar:box-bold-duotone',
        url: '/apps/logistics/stock',
        menuKey: 'logistik',
        requiresLogistics: true,
      },
      {
        name: 'Order PO & Surat Jalan',
        subtitle: 'Buat & Kelola PO / DO',
        icon: 'solar:clipboard-list-bold-duotone',
        url: '/apps/orders',
        menuKey: 'documents',
        requiresNonMover: true,
      },
    ],
  },
  {
    heading: '04 · Otorisasi & Keuangan',
    stepNumber: '04',
    children: [
      {
        name: 'Persetujuan Direksi',
        subtitle: 'Otorisasi PO, Tiket & SPK',
        icon: 'solar:shield-check-bold-duotone',
        url: '/apps/approvals',
        menuKey: 'approvals',
        requiresExecutive: true,
      },
      {
        name: 'Finance & Kas Proyek',
        subtitle: 'Pencairan, Buku Kas & APH',
        icon: 'solar:wallet-money-bold-duotone',
        url: '/apps/finance',
        menuKey: 'finance_hub',
        requiresFinance: true,
      },
    ],
  },
  {
    heading: '05 · Dokumen & Sistem',
    stepNumber: '05',
    children: [
      {
        name: 'Arsip Dokumen Terbit',
        subtitle: 'Dokumen Resmi Ber-QR',
        icon: 'solar:documents-bold-duotone',
        url: '/apps/documents/issued',
        menuKey: 'documents_issued',
        requiresNonMover: true,
      },
      {
        name: 'Generator Dokumen',
        subtitle: 'Tanda Tangan & Terbit',
        icon: 'solar:document-text-bold-duotone',
        url: '/apps/documents',
        menuKey: 'documents',
      },
      {
        name: 'Template Surat & PO',
        subtitle: 'Editor Format Dokumen',
        icon: 'solar:document-add-bold-duotone',
        url: '/apps/templates',
        menuKey: 'templates',
      },
      {
        name: 'Pengaturan Sistem',
        subtitle: 'Pengguna, Hak Akses & Menu',
        icon: 'solar:settings-bold-duotone',
        url: '/apps/settings',
        menuKey: 'settings',
      },
    ],
  },
]

export default SidebarContent
