import type { ReactNode } from "react";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

type MarketingShellProps = {
  children: ReactNode;
  currentPath?: string;
};

export default function MarketingShell({
  children,
  currentPath = "/",
}: MarketingShellProps) {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#eff4ff_0%,#f6f8fc_24%,#fbfcfe_54%,#f3f7ff_100%)] text-slate-950">
      <div className="absolute inset-x-0 top-0 -z-20 overflow-hidden">
        <div className="mx-auto h-[720px] max-w-[1600px] bg-[radial-gradient(circle_at_top_left,rgba(96,120,255,0.34),transparent_30%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_24%),radial-gradient(circle_at_center,rgba(15,23,42,0.18),transparent_50%),linear-gradient(180deg,#071629_0%,#0c2240_58%,#15335c_100%)]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[380px] -z-10 overflow-hidden">
        <div className="mx-auto h-[900px] max-w-[1500px] bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08),transparent_38%),radial-gradient(circle_at_20%_30%,rgba(148,163,184,0.1),transparent_26%)]" />
      </div>

      <SiteHeader currentPath={currentPath} />
      {children}
      <SiteFooter />
    </main>
  );
}
