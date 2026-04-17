import EmployeeProfilePageClient from "../EmployeeProfilePageClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employeeId = Number(id);

  return (
    <EmployeeProfilePageClient
      employeeId={Number.isFinite(employeeId) ? employeeId : null}
    />
  );
}
