import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import AdminCompensationEventsClient from "./AdminCompensationEventsClient";

export default function AdminCompensationVentesPage() {
  return (
    <AdminFinanceGate moduleLabel="Compensation">
      <AdminCompensationEventsClient />
    </AdminFinanceGate>
  );
}
