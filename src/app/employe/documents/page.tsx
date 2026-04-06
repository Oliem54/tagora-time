import Link from "next/link";

export default function EmployeDocumentsPage() {
  return (
    <main className="min-h-screen bg-white text-black p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold">Mes documents terrain</h1>
            <p className="text-gray-600 mt-2">
              Gérez vos preuves photo, bons de livraison, ramassages et documents client
            </p>
          </div>

          <Link
            href="/employe/dashboard"
            className="px-5 py-3 rounded-xl border border-gray-300 hover:bg-gray-100 transition text-center"
          >
            Retour au tableau de bord
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <div className="rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-2">Total dossiers</h2>
            <p className="text-4xl font-bold">12</p>
            <p className="text-gray-600 mt-2">Documents créés</p>
          </div>

          <div className="rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-2">Envoyés</h2>
            <p className="text-4xl font-bold">9</p>
            <p className="text-gray-600 mt-2">À la direction et à l’utilisateur</p>
          </div>

          <div className="rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-2">En attente</h2>
            <p className="text-4xl font-bold">3</p>
            <p className="text-gray-600 mt-2">À compléter ou envoyer</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Link
            href="/employe/documents/new"
            className="px-6 py-4 rounded-xl bg-black text-white font-semibold text-lg hover:opacity-90 transition text-center"
          >
            Ajouter un dossier terrain
          </Link>

          <Link
            href="/employe/documents/new"
            className="px-6 py-4 rounded-xl border border-black text-black font-semibold text-lg hover:bg-black hover:text-white transition text-center"
          >
            Ajouter des photos
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 px-6 py-4 bg-gray-50 font-semibold">
            <div>Référence</div>
            <div>Client</div>
            <div>Type</div>
            <div>Date</div>
            <div>Statut</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 px-6 py-4 border-t border-gray-200">
            <div>RAM-1038</div>
            <div>Client Tremblay</div>
            <div>Ramassage</div>
            <div>2026-04-03</div>
            <div className="text-green-600 font-medium">Envoyé</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 px-6 py-4 border-t border-gray-200">
            <div>LIV-24001</div>
            <div>Client Dupont</div>
            <div>Livraison</div>
            <div>2026-04-03</div>
            <div className="text-green-600 font-medium">Envoyé</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 px-6 py-4 border-t border-gray-200">
            <div>VIN-123456</div>
            <div>Client Gagnon</div>
            <div>Dommage avant ramassage</div>
            <div>2026-04-03</div>
            <div className="text-orange-500 font-medium">En attente</div>
          </div>
        </div>
      </div>
    </main>
  );
}