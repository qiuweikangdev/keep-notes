import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";
import type { ExternalOpenAppId } from "@shared/types";

interface ExternalOpenAppIconProps {
  appId: ExternalOpenAppId;
  iconDataUrl?: string;
  className?: string;
}

export function ExternalOpenAppIcon({
  appId,
  iconDataUrl,
  className,
}: ExternalOpenAppIconProps) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [iconDataUrl]);

  if (iconDataUrl && !hasImageError) {
    return (
      <img
        src={iconDataUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={() => setHasImageError(true)}
        className={cn("shrink-0 object-contain", className)}
      />
    );
  }

  const iconClassName = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[6px]",
    className,
  );

  if (appId === "vscode") {
    return (
      <span className={iconClassName} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-full w-full">
          <rect width="24" height="24" rx="5" fill="#E9F3FF" />
          <path
            d="M16.8 4.4 8.1 10.9 4.4 8.1 2.8 9.2v5.6l1.6 1.1 3.7-2.8 8.7 6.5 3.2-1.4V5.8l-3.2-1.4Z"
            fill="#007ACC"
          />
          <path
            d="M16.7 8.4 11.3 12l5.4 3.6V8.4ZM4.5 10.2 7.1 12l-2.6 1.8v-3.6Z"
            fill="#F7FBFF"
          />
        </svg>
      </span>
    );
  }

  if (appId === "zed") {
    return (
      <span className={iconClassName} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-full w-full">
          <rect width="24" height="24" rx="5" fill="#141414" />
          <rect
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="3.5"
            fill="none"
            stroke="#3A3A3A"
          />
          <path
            d="M7 7.2h10L8.2 16.8H17"
            fill="none"
            stroke="#D8D8D8"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path d="M8 13.7 13.8 7.2H17L8.2 16.8H7l1-3.1Z" fill="#3B3B3B" />
        </svg>
      </span>
    );
  }

  if (appId === "terminal") {
    return (
      <span className={iconClassName} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-full w-full">
          <rect width="24" height="24" rx="5" fill="#111315" />
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="3"
            fill="none"
            stroke="#545A60"
          />
          <path
            d="m6.5 8.5 3 2.6-3 2.6"
            fill="none"
            stroke="#D7DADC"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
          <path
            d="M11.5 15.2h5"
            stroke="#D7DADC"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      </span>
    );
  }

  if (appId === "file-manager") {
    return (
      <span className={iconClassName} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-full w-full">
          <rect width="24" height="24" fill="#58A9FF" />
          <path d="M12 0h12v24H12V0Z" fill="#1E86F5" />
          <path
            d="M0 14.8c3.1-.8 5.8-.6 8 .4 2.4 1.1 5.1 1.1 8.1 0 2.2-.8 4.8-.9 7.9-.2v9H0v-9.2Z"
            fill="#7EC5FF"
          />
          <path d="M12 0v24" stroke="#0B5EC8" strokeWidth="0.9" />
          <path
            d="M7.4 8.3v2.1M16.7 8.3v2.1M8.1 16.1c2.1 1.5 5.8 1.5 7.9 0"
            fill="none"
            stroke="#14385C"
            strokeLinecap="round"
            strokeWidth="1.25"
          />
          <path
            d="M11.5 4.6c-.7 2.6-1.6 4.9-2.6 7"
            fill="none"
            stroke="#14385C"
            strokeLinecap="round"
            strokeWidth="1"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className={iconClassName} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-full w-full">
        <rect width="24" height="24" rx="5" fill="#111111" />
        <path
          d="m6.3 3.8 12 8.2-5.1 1.2 2.7 5.2-2.8 1.4-2.7-5.1-4.1 3.4V3.8Z"
          fill="#F5F5F5"
        />
      </svg>
    </span>
  );
}
