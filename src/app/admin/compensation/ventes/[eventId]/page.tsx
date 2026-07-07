import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import AdminCompensationEventDetailClient from "./AdminCompensationEventDetailClient";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function AdminCompensationEventDetailPage({ params }: PageProps) {
  const { eventId } = await params;

  return (
    <AdminFinanceGate moduleLabel="Compensation">
      <AdminCompensationEventDetailClient eventId={eventId} />
    </AdminFinanceGate>
  );
}
