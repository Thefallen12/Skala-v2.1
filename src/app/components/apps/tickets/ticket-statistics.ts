import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import { TicketRequestCategory, TicketType } from "@prisma/client";

export type TicketStatisticsMonth = {
  key: string;
  label: string;
  count: number;
  totalCents: bigint;
};

export type TicketMonthlyStatistics = {
  months: TicketStatisticsMonth[];
  totalCount: number;
  totalCents: bigint;
};

export function categoryForTicket(ticket: TicketRow): TicketRequestCategory {
  if (ticket.requestCategory) return ticket.requestCategory;
  if (ticket.type === TicketType.OPERATIONAL) return TicketRequestCategory.OPS;
  if (ticket.type === TicketType.MATERIAL) return TicketRequestCategory.MATERIAL;
  return TicketRequestCategory.OFFICE;
}

export function getTotalTicketValueInCents(tickets: TicketRow[]): bigint {
  return tickets.reduce((sum, ticket) => {
    const amount = ticket.totalAmount;
    if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount)) return sum;
    const [whole, fraction = ""] = amount.split(".");
    return sum + BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  }, BigInt(0));
}

export function formatTicketCurrency(amountInCents: bigint): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number((amountInCents + BigInt(50)) / BigInt(100)));
}

export function getTicketMonthlyStatistics(
  tickets: TicketRow[],
  monthCount: number,
  category: TicketRequestCategory | "ALL" = "ALL",
): TicketMonthlyStatistics {
  const latestMonth = new Date();
  latestMonth.setDate(1);
  latestMonth.setHours(0, 0, 0, 0);

  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(latestMonth);
    date.setMonth(date.getMonth() - (monthCount - index - 1));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: new Intl.DateTimeFormat("id-ID", {
        month: "short",
        year: monthCount > 12 ? "2-digit" : undefined,
      }).format(date),
      count: 0,
      totalCents: BigInt(0),
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));

  for (const ticket of tickets) {
    if (category !== "ALL" && categoryForTicket(ticket) !== category) continue;
    const createdAt = new Date(ticket.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
    const month = monthByKey.get(key);
    if (!month) continue;

    month.count += 1;
    if (ticket.totalAmount && /^\d+(\.\d{1,2})?$/.test(ticket.totalAmount)) {
      const [whole, fraction = ""] = ticket.totalAmount.split(".");
      month.totalCents +=
        BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
    }
  }

  return {
    months,
    totalCount: months.reduce((sum, month) => sum + month.count, 0),
    totalCents: months.reduce((sum, month) => sum + month.totalCents, BigInt(0)),
  };
}
