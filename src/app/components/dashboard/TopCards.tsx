"use client";

import Link from "next/link";
import { Autoplay, FreeMode } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import {
  BriefcaseBusiness,
  Boxes,
  Clock3,
  ListChecks,
  Ticket,
  TrendingUp,
} from "lucide-react";

type DashboardCardIcon =
  | "projects"
  | "growth"
  | "tasks"
  | "tickets"
  | "stock"
  | "timesheet";

type DashboardCard = {
  title: string;
  value: string;
  caption: string;
  href: string;
  icon: DashboardCardIcon;
  color: "orange" | "blue" | "purple" | "teal" | "indigo" | "green";
};

const cardIcons = {
  projects: BriefcaseBusiness,
  growth: TrendingUp,
  tasks: ListChecks,
  tickets: Ticket,
  stock: Boxes,
  timesheet: Clock3,
} satisfies Record<DashboardCardIcon, typeof BriefcaseBusiness>;

const cardColors: Record<
  DashboardCard["color"],
  { card: string; icon: string; label: string; value: string }
> = {
  orange: {
    card: "border-orange-300 bg-gradient-to-br from-orange-100 to-amber-50 dark:border-orange-400/50 dark:from-orange-500/35 dark:to-amber-500/20",
    icon: "bg-orange-500 text-white shadow-sm shadow-orange-500/25",
    label: "text-orange-800 dark:text-orange-200",
    value: "text-orange-700 dark:text-orange-300",
  },
  blue: {
    card: "border-sky-300 bg-gradient-to-br from-sky-100 to-blue-50 dark:border-sky-400/50 dark:from-sky-500/35 dark:to-blue-500/20",
    icon: "bg-sky-500 text-white shadow-sm shadow-sky-500/25",
    label: "text-sky-800 dark:text-sky-200",
    value: "text-sky-700 dark:text-sky-300",
  },
  purple: {
    card: "border-violet-300 bg-gradient-to-br from-violet-100 to-purple-50 dark:border-violet-400/50 dark:from-violet-500/35 dark:to-purple-500/20",
    icon: "bg-violet-500 text-white shadow-sm shadow-violet-500/25",
    label: "text-violet-800 dark:text-violet-200",
    value: "text-violet-700 dark:text-violet-300",
  },
  teal: {
    card: "border-teal-300 bg-gradient-to-br from-teal-100 to-cyan-50 dark:border-teal-400/50 dark:from-teal-500/35 dark:to-cyan-500/20",
    icon: "bg-teal-500 text-white shadow-sm shadow-teal-500/25",
    label: "text-teal-800 dark:text-teal-200",
    value: "text-teal-700 dark:text-teal-300",
  },
  indigo: {
    card: "border-indigo-300 bg-gradient-to-br from-indigo-100 to-blue-50 dark:border-indigo-400/50 dark:from-indigo-500/35 dark:to-blue-500/20",
    icon: "bg-indigo-500 text-white shadow-sm shadow-indigo-500/25",
    label: "text-indigo-800 dark:text-indigo-200",
    value: "text-indigo-700 dark:text-indigo-300",
  },
  green: {
    card: "border-emerald-300 bg-gradient-to-br from-emerald-100 to-green-50 dark:border-emerald-400/50 dark:from-emerald-500/35 dark:to-green-500/20",
    icon: "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25",
    label: "text-emerald-800 dark:text-emerald-200",
    value: "text-emerald-700 dark:text-emerald-300",
  },
};

const DashboardCardLink = ({
  card,
  index,
}: {
  card: DashboardCard;
  index: number;
}) => {
  const colors = cardColors[card.color];
  const Icon = cardIcons[card.icon];

  return (
    <Link
      href={card.href}
      aria-label={`${card.title}: ${card.value}`}
      style={{ animationDelay: `${index * 75}ms` }}
      className={`dashboard-enter group relative block h-full min-w-0 rounded-xl border p-3 shadow-sm transition duration-300 ease-out hover:z-10 hover:-translate-y-1 hover:scale-[1.04] hover:saturate-110 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:p-4 ${colors.card}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2 sm:gap-3">
        <p className={`min-w-0 break-words text-xs font-bold ${colors.label}`}>
          {card.title}
        </p>
        <span className={`shrink-0 rounded-lg p-2 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 ${colors.icon}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className={`text-xl font-extrabold tabular-nums sm:text-2xl ${colors.value}`}>
        {card.value}
      </p>
      <p className="mt-1 break-words text-[11px] text-slate-500 dark:text-slate-400">
        {card.caption}
      </p>
    </Link>
  );
};

const TopCards = ({ cards }: { cards: readonly DashboardCard[] }) => {
  return (
    <Swiper
      slidesPerView={1.15}
      spaceBetween={12}
      loop={cards.length > 5}
      freeMode
      grabCursor
      speed={5000}
      autoplay={{
        delay: 1,
        disableOnInteraction: false,
        pauseOnMouseEnter: false,
      }}
      modules={[Autoplay, FreeMode]}
      breakpoints={{
        480: { slidesPerView: 2, spaceBetween: 12 },
        768: { slidesPerView: 3, spaceBetween: 16 },
        1024: { slidesPerView: 4, spaceBetween: 16 },
        1200: { slidesPerView: 5, spaceBetween: 16 },
      }}
      className="mySwiper w-full min-w-0"
    >
      {cards.map((card, index) => (
        <SwiperSlide key={card.title} className="h-auto">
          <DashboardCardLink card={card} index={index} />
        </SwiperSlide>
      ))}
    </Swiper>
  );
};

export { TopCards };
