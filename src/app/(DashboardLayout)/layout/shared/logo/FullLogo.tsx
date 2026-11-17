"use client";

import { BrandLogo } from "@/components/ui/brand-logo";

const FullLogo = () => {
  return (
    <div className="flex items-center gap-2.5 overflow-hidden">
      <BrandLogo
        alt="Skala Prioritas Engineering"
        width={45}
        height={40}
        className="h-10 w-[45px] shrink-0 rounded-md object-contain dark:bg-white dark:p-1"
      />
      <span className="flex min-w-0 flex-col leading-tight max-[390px]:hidden">
        <span className="truncate text-sm font-bold text-primary dark:text-foreground">
          SKALA PRIORITAS
        </span>
        <span className="type-p3 font-semibold uppercase tracking-[0.14em] text-secondary">
          Engineering
        </span>
      </span>
    </div>
  );
};

export default FullLogo;
