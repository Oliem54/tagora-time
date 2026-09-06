import type { ReactNode } from "react";
import { cn } from "@/app/components/ui/cn";

export type HororaStateTone = "empty" | "info" | "success" | "warning" | "danger" | "error";

type HororaStateBannerProps = {
  tone?: HororaStateTone;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2;
};

export default function HororaStateBanner({
  tone = "info",
  title,
  children,
  action,
  className,
  headingLevel = 2,
}: HororaStateBannerProps) {
  const TitleTag = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className={cn("horora-state", `horora-state--${tone}`, className)} role="status">
      <TitleTag className="horora-state-title">{title}</TitleTag>
      <div className="horora-state-body">{children}</div>
      {action}
    </section>
  );
}
