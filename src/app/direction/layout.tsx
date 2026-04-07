import AuthGate from "@/app/components/AuthGate";

export default function DirectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate areaRole="direction" publicPaths={["/direction", "/direction/login"]}>
      {children}
    </AuthGate>
  );
}
