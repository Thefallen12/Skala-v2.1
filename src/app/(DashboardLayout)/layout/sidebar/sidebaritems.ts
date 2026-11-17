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

export interface MenuAccessFlags {
  canManageUsers?: boolean
  canAccessLogistics?: boolean
  canAccessExecutive?: boolean
  canAccessFinance?: boolean
  canAccessProjects?: boolean
  canAccessDrafter?: boolean
  isMover?: boolean
  allowedMenuKeys?: string[]
}

export function isMenuItemAllowed(
  item: Pick<
    ChildItem,
    | 'menuKey'
    | 'requiresUserManagement'
    | 'requiresLogistics'
    | 'requiresExecutive'
    | 'requiresFinance'
    | 'requiresProjects'
    | 'requiresDrafter'
    | 'requiresNonMover'
  >,
  permissions: MenuAccessFlags
): boolean {
  const {
    canManageUsers = false,
    canAccessLogistics = false,
    canAccessExecutive = false,
    canAccessFinance = false,
    canAccessProjects = false,
    canAccessDrafter = false,
    isMover = false,
    allowedMenuKeys,
  } = permissions

  if (
    (item.menuKey &&
      allowedMenuKeys &&
      !allowedMenuKeys.includes(item.menuKey)) ||
    (item.requiresUserManagement && !canManageUsers) ||
    (item.requiresLogistics && !canAccessLogistics) ||
    (item.requiresExecutive && !canAccessExecutive) ||
    (item.requiresFinance && !canAccessFinance) ||
    (item.requiresProjects && !canAccessProjects) ||
    (item.requiresDrafter && !canAccessDrafter) ||
    (item.requiresNonMover && isMover)
  ) {
    return false
  }

  return true
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
    heading: '01 · Ringkasan',
    stepNumber: '01',
    children: [
      {
        name: 'Beranda',
        subtitle: 'Ringkasan & Alur Kerja',
        icon: 'solar:widget-2-bold-duotone',
        url: '/',
        menuKey: 'dashboard',
      },
      {
        name: 'Progres',
        subtitle: 'Jadwal & Timesheet',
        icon: 'solar:calendar-mark-bold-duotone',
        url: '/apps/habits',
        menuKey: 'habits',
      },
    ],
  },
  {
    heading: '02 · Proyek',
    stepNumber: '02',
    children: [
      {
        name: 'Proyek',
        subtitle: 'Data, Kurva S & Peta',
        icon: 'solar:buildings-2-bold-duotone',
        url: '/apps/projects',
        menuKey: 'master_proyek',
        requiresProjects: true,
      },
      {
        name: 'Jadwal Proyek',
        subtitle: 'Gantt & Milestone',
        icon: 'solar:calendar-date-bold-duotone',
        url: '/apps/projects/schedule',
        menuKey: 'master_proyek',
        requiresProjects: true,
      },
      {
        name: 'Gambar DED',
        subtitle: 'Shop & As-Built',
        icon: 'solar:ruler-pen-bold-duotone',
        url: '/apps/drafter',
        menuKey: 'drafter',
        requiresDrafter: true,
      },
    ],
  },
  {
    heading: '03 · Logistik',
    stepNumber: '03',
    children: [
      {
        name: 'Tiket',
        subtitle: 'Material, Alat & Dana',
        icon: 'solar:ticket-bold-duotone',
        url: '/apps/tickets',
        menuKey: 'tickets',
        requiresNonMover: true,
      },
      {
        id: 'nav-logistics-hub',
        name: 'Logistik',
        subtitle: 'Material & Pengiriman',
        icon: 'solar:delivery-bold-duotone',
        url: '/apps/logistics',
        menuKey: 'logistik',
        requiresLogistics: true,
      },
      {
        id: 'nav-logistics-docs',
        name: 'PO, KO & DO',
        subtitle: 'Penerbitan Dokumen',
        icon: 'solar:document-text-bold-duotone',
        url: '/apps/logistics?tab=documents',
        menuKey: 'logistik',
        requiresLogistics: true,
      },
      {
        id: 'nav-logistics-stock',
        name: 'Stok Gudang',
        subtitle: 'Inventaris Material',
        icon: 'solar:box-bold-duotone',
        url: '/apps/logistics/stock',
        menuKey: 'logistik',
        requiresLogistics: true,
      },
    ],
  },
  {
    heading: '04 · Keuangan',
    stepNumber: '04',
    children: [
      {
        name: 'Persetujuan',
        subtitle: 'Otorisasi Direksi',
        icon: 'solar:shield-check-bold-duotone',
        url: '/apps/approvals',
        menuKey: 'approvals',
        requiresExecutive: true,
      },
      {
        name: 'Keuangan',
        subtitle: 'Kas, APH & Pencairan',
        icon: 'solar:wallet-money-bold-duotone',
        url: '/apps/finance',
        menuKey: 'finance_hub',
        requiresFinance: true,
      },
    ],
  },
  {
    heading: '05 · Sistem',
    stepNumber: '05',
    children: [
      {
        name: 'Dokumen',
        subtitle: 'Arsip & Tanda Tangan',
        icon: 'solar:document-text-bold-duotone',
        url: '/apps/documents',
        menuKey: 'documents',
      },
      {
        name: 'Template',
        subtitle: 'Format Dokumen',
        icon: 'solar:document-add-bold-duotone',
        url: '/apps/templates',
        menuKey: 'templates',
      },
      {
        name: 'Pengaturan',
        subtitle: 'Pengguna & Akses',
        icon: 'solar:settings-bold-duotone',
        url: '/apps/settings',
        menuKey: 'settings',
      },
    ],
  },
]

export default SidebarContent
