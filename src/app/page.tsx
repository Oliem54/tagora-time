import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black px-6 pt-12 pb-6 md:pt-16">
      <div className="w-full max-w-4xl mx-auto text-center">
        <div className="flex items-center justify-center gap-4 mb-8">
          <Image
            src="/logo.png"
            alt="Logo TAGORA"
            width={220}
            height={220}
            priority
          />
          <span className="text-5xl md:text-6xl font-bold">Time</span>
        </div>

        <p className="text-xl md:text-2xl text-gray-700 mb-3">
          Pointage, heures, terrain, dépenses et approbations
        </p>

        <p className="text-base md:text-lg text-gray-500 max-w-2xl mx-auto mb-10">
          Une plateforme simple pour gérer les employés, les horaires, les sorties terrain
          et les validations de la direction.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/employe"
            className="px-8 py-4 rounded-xl bg-black text-white font-semibold text-lg hover:opacity-90 transition"
          >
            Connexion employé
          </Link>

          <Link
            href="/direction"
            className="px-8 py-4 rounded-xl border border-black text-black font-semibold text-lg hover:bg-black hover:text-white transition"
          >
            Connexion direction
          </Link>
        </div>
      </div>
    </main>
  );
}