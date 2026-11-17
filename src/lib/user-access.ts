import { UserRole } from "@prisma/client";

export function canManageUsers(role: UserRole): boolean {
  return (
    role === UserRole.ADMINISTRATIONS ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR
  );
}

export const userManagerRoles = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
] as const;

export const executiveLeadershipRoles = [
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.ADMINISTRATIONS,
] as const;

export const financeDashboardRoles = [
  UserRole.FINANCE,
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
] as const;

export const financeOperatorRoles = [
  UserRole.FINANCE,
  UserRole.DEPUTY_DIRECTOR,
] as const;

export const logisticsOperatorRoles = [
  UserRole.LOGISTICS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.ADMINISTRATIONS,
] as const;

export function isDeputyDirector(role: UserRole): boolean {
  return role === UserRole.DEPUTY_DIRECTOR;
}

export function isExecutiveLeadership(role: UserRole): boolean {
  return (executiveLeadershipRoles as readonly UserRole[]).includes(role);
}

export function canAccessFinanceDashboard(role: UserRole): boolean {
  return (financeDashboardRoles as readonly UserRole[]).includes(role);
}

export function canOperateFinanceActions(role: UserRole): boolean {
  return (financeOperatorRoles as readonly UserRole[]).includes(role);
}

export function canOperateLogisticsActions(role: UserRole): boolean {
  return (logisticsOperatorRoles as readonly UserRole[]).includes(role);
}

export function canIssuePurchaseOrders(role: UserRole): boolean {
  return canOperateLogisticsActions(role);
}

export function canIssueDeliveryOrders(role: UserRole): boolean {
  return canOperateLogisticsActions(role);
}

export function canViewAphRecords(role: UserRole): boolean {
  return (
    role === UserRole.FINANCE ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR
  );
}

export const drawingAccessRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.DRAFTER,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
];

export const drawingUploadRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.DRAFTER,
];

export const drawingReviewRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
];
