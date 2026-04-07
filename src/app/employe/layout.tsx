import AuthGate from "@/app/components/AuthGate";

export default function EmployeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate areaRole="employe" publicPaths={["/employe", "/employe/login"]}>
      {children}
    </AuthGate>
  );
}
