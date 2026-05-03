import EmployeeProfilePageClient from "../EmployeeProfilePageClient";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ effectifs?: string }>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const employeeId = Number(id);

  return (
    <EmployeeProfilePageClient
      employeeId={Number.isFinite(employeeId) ? employeeId : null}
      openEffectifsSection={sp.effectifs === "1"}
    />
  );
}
