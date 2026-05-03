import type { Metadata } from "next";
import AuthGate from "@/app/components/AuthGate";

export const metadata: Metadata = {
  title: {
    default: "Direction",
    template: "%s | Direction | Tagora",
  },
  description: "Espace direction Tagora.",
};

export default function DirectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate
      areaRole="direction"
      publicPaths={["/direction", "/direction/login"]}
      crossAreaReadPaths={[
        { pathPrefix: "/direction/effectifs", roles: ["employe"] },
      ]}
    >
      {children}
    </AuthGate>
  );
}
