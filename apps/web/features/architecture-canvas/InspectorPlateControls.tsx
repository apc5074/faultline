"use client";

import type { ReactNode } from "react";

export function InspectorDataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="inspector-plate__row">
      <span className="inspector-plate__row-label">{label}</span>
      <span className="inspector-plate__row-value tabular">{value}</span>
    </div>
  );
}

export function InspectorStepper({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div className="inspector-plate__stepper">
      <span className="inspector-plate__stepper-label">{label}</span>
      <div className="inspector-plate__stepper-controls">
        <button
          type="button"
          className="inspector-plate__stepper-btn"
          disabled={disabled || value <= min}
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span className="inspector-plate__stepper-value tabular">{value}</span>
        <button
          type="button"
          className="inspector-plate__stepper-btn"
          disabled={disabled || value >= max}
          aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function InspectorSegControl<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
  formatOption = (option) => option,
}: {
  label: string;
  value: T;
  options: readonly T[];
  disabled?: boolean;
  onChange: (next: T) => void;
  formatOption?: (option: T) => string;
}) {
  return (
    <div className="inspector-plate__seg">
      <span className="inspector-plate__seg-label">{label}</span>
      <div className="inspector-plate__seg-group" role="group" aria-label={label}>
        {options.map((option, index) => (
          <button
            key={option}
            type="button"
            className={`inspector-plate__seg-btn${value === option ? " inspector-plate__seg-btn--active" : ""}${index > 0 ? " inspector-plate__seg-btn--joined" : ""}`}
            disabled={disabled}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {formatOption(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
