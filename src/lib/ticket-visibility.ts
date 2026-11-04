import type { Prisma } from "@prisma/client";
import {
  TicketStatus,
  TicketRequestCategory,
  TicketType,
  UserRole,
} from "@prisma/client";

export function getTicketPageVisibilityWhere(
  role: UserRole,
  userId: string,
): Prisma.TicketWhereInput {
  const requesterTickets: Prisma.TicketWhereInput = {
    requesterId: userId,
  };
  const nonAPHWhere: Prisma.TicketWhereInput = {
    OR: [
      { requestCategory: { not: TicketRequestCategory.APH } },
      { requestCategory: null },
    ],
  };

  const roleWhere = (() => {
    switch (role) {
    case UserRole.DIRECTOR:
      return {
        OR: [
          { status: { not: TicketStatus.DRAFT } },
          requesterTickets,
        ],
      };
    case UserRole.DEPUTY_DIRECTOR:
      return {
        OR: [
          {
            status: TicketStatus.COMPLETED,
            auditLogs: {
              some: { action: "FINANCE_PAYMENT_COMPLETED" },
            },
          },
          requesterTickets,
        ],
      };
    case UserRole.KOORDINATOR:
      return { OR: [{ status: TicketStatus.PENDING_DIRECTOR }, requesterTickets] };
    case UserRole.FINANCE:
      return {
        OR: [
          { status: TicketStatus.WAITING_FINANCE_PAYMENT },
          { status: TicketStatus.PROCESSED_FINANCE },
          { status: TicketStatus.PROCESSED_LOGISTIC },
          {
            status: TicketStatus.COMPLETED,
            OR: [
              { type: { in: [TicketType.COST, TicketType.OPERATIONAL] } },
              {
                type: TicketType.MATERIAL,
                transferReceiptUrl: { not: null },
              },
            ],
          },
          requesterTickets,
        ],
      };
    case UserRole.LOGISTICS:
      return {
        OR: [
          { status: TicketStatus.PROCESSED_LOGISTIC },
          { status: TicketStatus.ASSIGNED_TO_MOVER },
          { status: TicketStatus.IN_TRANSIT },
          {
            status: TicketStatus.WAITING_FINANCE_PAYMENT,
            type: TicketType.MATERIAL,
            purchaseReceiptUrl: { not: null },
          },
          { status: TicketStatus.COMPLETED, type: TicketType.MATERIAL },
          requesterTickets,
        ],
      };
    case UserRole.ADMINISTRATIONS:
      return {};
    default:
      return requesterTickets;
    }
  })();

  if (role === UserRole.DIRECTOR || role === UserRole.FINANCE) {
    return roleWhere;
  }

  return { AND: [roleWhere, nonAPHWhere] };
}
