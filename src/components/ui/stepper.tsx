"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StepperStep {
  id?: string;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Indeks langkah aktif berbasis 0 (0 = Step 1). */
  currentStep: number;
  orientation?: "horizontal" | "vertical";
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

interface StepItemProps {
  step: StepperStep;
  index: number;
  isLast: boolean;
  status: "completed" | "current" | "upcoming";
  orientation: "horizontal" | "vertical";
  clickable: boolean;
  onSelect?: (stepIndex: number) => void;
}

function StepItem({
  step,
  index,
  isLast,
  status,
  orientation,
  clickable,
  onSelect,
}: StepItemProps) {
  const isCompleted = status === "completed";
  const isCurrent = status === "current";

  const indicator = (
    <span
      className={cn(
        "type-p3 flex size-7 shrink-0 items-center justify-center rounded-full border font-semibold tabular-nums transition-colors",
        isCompleted &&
          "border-primary bg-primary text-primary-foreground",
        isCurrent &&
          "border-primary bg-primary/15 text-primary ring-2 ring-primary/25",
        status === "upcoming" &&
          "border-border bg-muted text-muted-foreground",
      )}
    >
      {isCompleted ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        index + 1
      )}
    </span>
  );

  const labelBlock = (
    <span className="min-w-0 text-left">
      <span
        className={cn(
          "type-p2 block truncate",
          isCurrent
            ? "font-semibold text-foreground"
            : isCompleted
              ? "font-medium text-foreground"
              : "font-medium text-muted-foreground",
        )}
      >
        {step.label}
      </span>
      {step.description ? (
        <span className="type-p3 block truncate text-muted-foreground">
          {step.description}
        </span>
      ) : null}
    </span>
  );

  if (orientation === "vertical") {
    return (
      <li
        aria-current={isCurrent ? "step" : undefined}
        className="relative flex gap-3 pb-5 last:pb-0"
      >
        {!isLast ? (
          <span
            aria-hidden="true"
            className={cn(
              "absolute left-3.5 top-8 bottom-1 w-px -translate-x-1/2",
              isCompleted ? "bg-primary" : "bg-border",
            )}
          />
        ) : null}
        {clickable && onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(index)}
            className="flex min-w-0 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {indicator}
            {labelBlock}
          </button>
        ) : (
          <div className="flex min-w-0 items-start gap-3">
            {indicator}
            {labelBlock}
          </div>
        )}
      </li>
    );
  }

  return (
    <li
      aria-current={isCurrent ? "step" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-2",
        !isLast && "flex-1",
      )}
    >
      {clickable && onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(index)}
          className="flex min-w-0 items-center gap-2 rounded-lg py-1 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {indicator}
          {labelBlock}
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-2 py-1 pr-1">
          {indicator}
          {labelBlock}
        </div>
      )}
      {!isLast ? (
        <span
          aria-hidden="true"
          className={cn(
            "h-px min-w-4 flex-1 transition-colors",
            isCompleted ? "bg-primary" : "bg-border",
          )}
        />
      ) : null}
    </li>
  );
}

export function Stepper({
  steps,
  currentStep,
  orientation = "horizontal",
  onStepClick,
  className,
}: StepperProps) {
  return (
    <nav aria-label="Tahapan Proses" className={cn("w-full", className)}>
      <ol
        className={cn(
          orientation === "vertical"
            ? "flex flex-col"
            : "flex items-center gap-2 overflow-x-auto pb-1",
        )}
      >
        {steps.map((step, index) => {
          const status =
            index < currentStep
              ? "completed"
              : index === currentStep
                ? "current"
                : "upcoming";
          const clickable = Boolean(onStepClick && index <= currentStep);

          return (
            <StepItem
              key={step.id ?? `${step.label}-${index}`}
              step={step}
              index={index}
              isLast={index === steps.length - 1}
              status={status}
              orientation={orientation}
              clickable={clickable}
              onSelect={onStepClick}
            />
          );
        })}
      </ol>
    </nav>
  );
}
