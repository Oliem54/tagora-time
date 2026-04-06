import Image from "next/image";
import Link from "next/link";

export default function EmployePage() {
  return (
    <main className="min-h-screen bg-white text-black px-6 pt-8 pb-6 md:pt-10">
      <div className="w-full max-w-md mx-auto">
        <div className="flex justify-center mb-4">
          <Image
            src="/logo.png"
            alt="Logo TAGORA Time"
            width={540}
            height={540}
            priority
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-center mb-2">
            Espace employé
          </h1>

          <p className="text-center text-gray-600 mb-8">
            Connectez-vous pour accéder à votre espace
          </p>

          <form className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2">
                Courriel
              </label>
              <input
                type="email"
                placeholder="votre@courriel.com"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                placeholder="Votre mot de passe"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <Link
              href="/employe/dashboard"
              className="block w-full rounded-xl bg-black text-white py-3 font-semibold text-lg hover:opacity-90 transition text-center"
            >
              Se connecter
            </Link>
          </form>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-gray-600 hover:text-black">
              Retour à l’accueil
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}