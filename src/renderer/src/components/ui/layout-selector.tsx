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
      className={cn("layout-preview", isMinimal && "layout-preview--minimal")}
    >
      <span className="layout-preview__titlebar">
        {isMinimal ? (
          <>
            <span className="layout-preview__window-control" />
            <span className="layout-preview__minimal-tab">
              <span className="layout-preview__file-icon" />
              <span className="layout-preview__tab-line" />
            </span>
          </>
        ) : (
          <span className="layout-preview__titlebar-line" />
        )}
      </span>
      <span className="layout-preview__workspace">
        <span className="layout-preview__sidebar">
          {isMinimal ? (
            <>
              <span className="layout-preview__sidebar-heading" />
              <span className="layout-preview__sidebar-row layout-preview__sidebar-row--active" />
              <span className="layout-preview__sidebar-row" />
            </>
          ) : (
            <span className="layout-preview__sidebar-empty-state" />
          )}
        </span>
        <span className="layout-preview__editor">
          <span className="layout-preview__editor-tabbar">
            <span className="layout-preview__editor-tab" />
          </span>
          <span className="layout-preview__editor-content">
            <span className="layout-preview__editor-heading" />
            <span className="layout-preview__editor-line" />
            <span className="layout-preview__editor-line layout-preview__editor-line--short" />
            <span className="layout-preview__editor-line" />
          </span>
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
