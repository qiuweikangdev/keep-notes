import { Check } from "lucide-react";
import { layoutOptions, type LayoutName } from "@/config/layouts";
import { cn } from "@/lib/cn";

interface LayoutSelectorProps {
  value: LayoutName;
  onChange: (layout: LayoutName) => void;
  className?: string;
}

function LayoutPreview({ layout }: { layout: LayoutName }) {
  const isMinimal = layout === "minimal";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "layout-preview flex h-[54px] w-[112px] flex-col overflow-hidden rounded-md",
        isMinimal && "layout-preview--minimal",
      )}
    >
      <span className="layout-preview__titlebar flex h-[9px] shrink-0 items-center">
        <span className="layout-preview__traffic-lights flex items-center">
          <span className="layout-preview__traffic-light layout-preview__traffic-light--close" />
          <span className="layout-preview__traffic-light layout-preview__traffic-light--minimize" />
          <span className="layout-preview__traffic-light layout-preview__traffic-light--maximize" />
        </span>
        <span className="layout-preview__window-control" />
        <span className="layout-preview__titlebar-line" />
      </span>
      <span className="flex min-h-0 flex-1">
        <span className="layout-preview__sidebar w-[34px] shrink-0">
          <span className="layout-preview__sidebar-heading" />
          <span className="layout-preview__sidebar-row layout-preview__sidebar-row--active" />
          <span className="layout-preview__sidebar-row" />
          <span className="layout-preview__sidebar-row layout-preview__sidebar-row--short" />
        </span>
        <span
          className={cn(
            "layout-preview__editor flex-1",
            isMinimal ? "mx-0.5 my-1" : "border-l",
          )}
        >
          <span className="layout-preview__editor-heading" />
          <span className="layout-preview__editor-line" />
          <span className="layout-preview__editor-line layout-preview__editor-line--short" />
          <span className="layout-preview__editor-line" />
        </span>
      </span>
    </span>
  );
}

export function LayoutSelector({
  value,
  onChange,
  className,
}: LayoutSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="界面布局"
      className={cn("grid grid-cols-2 gap-2", className)}
    >
      {layoutOptions.map((option) => {
        const isSelected = option.name === value;

        return (
          <button
            key={option.name}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={option.label}
            title={option.description}
            data-selected={isSelected ? "true" : undefined}
            className="layout-option relative rounded-lg p-2 text-left outline-none"
            onClick={() => onChange(option.name)}
          >
            <LayoutPreview layout={option.name} />
            <span className="mt-1.5 flex items-center gap-1.5 px-0.5">
              <span
                className="flex-1 text-[11px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {option.label}
              </span>
              {isSelected ? (
                <span className="layout-option__check flex h-4 w-4 items-center justify-center rounded-full">
                  <Check aria-hidden="true" className="h-2.5 w-2.5" />
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
