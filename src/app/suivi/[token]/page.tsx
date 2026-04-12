import SuiviClientPage from "./SuiviClientPage";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <SuiviClientPage token={token} />;
}
