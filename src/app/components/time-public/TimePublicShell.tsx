import type { ReactNode } from "react";
import TimeBrand from "./TimeBrand";

type TimePublicShellProps = {
  children: ReactNode;
  brandSize?: "hub" | "login";
  compact?: boolean;
  showWordmark?: boolean;
  logoSrc?: string;
};

export default function TimePublicShell({
  children,
  brandSize = "hub",
  compact = false,
  showWordmark = true,
  logoSrc,
}: TimePublicShellProps) {
  return (
    <main
      className={`time-public-shell${compact ? " time-public-shell--compact" : ""}${
        brandSize === "login" ? " time-public-shell--login" : " time-public-shell--hub"
      }`}
    >
      <div className="time-public-shell-inner">
        <header className="time-public-shell-header">
          <TimeBrand
            size={brandSize}
            variant="light"
            showWordmark={showWordmark}
            src={logoSrc}
          />
        </header>
        <div className="time-public-shell-body">{children}</div>
      </div>
    </main>
  );
}
