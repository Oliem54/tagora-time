import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black px-6 pt-12 pb-6 md:pt-16">
      <div className="w-full max-w-4xl mx-auto text-center">
        <div className="flex items-center justify-center mb-8">
          <Image
            src="/logo.png"
            alt="Logo TAGORA"
            width={220}
            height={220}
            priority
          />
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
            className="tagora-dark-action px-8 py-4 rounded-xl font-semibold text-lg transition"
          >
            Connexion employé
          </Link>

          <Link
            href="/direction"
            className="tagora-dark-outline-action px-8 py-4 rounded-xl border font-semibold text-lg transition"
          >
            Connexion direction
          </Link>
        </div>
      </div>
    </main>
  );
}
