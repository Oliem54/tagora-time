import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type AppCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  tone?: "default" | "muted" | "elevated";
};

export default function AppCard({
  children,
  className,
  tone = "default",
  ...props
}: AppCardProps) {
  return (
    <div
      className={cn(
        "ui-card",
        tone === "muted" && "ui-card-muted",
        tone === "elevated" && "ui-card-elevated",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
