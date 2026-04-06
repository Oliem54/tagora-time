"use client";

import Link from "next/link";
import { ChangeEvent, useMemo, useState } from "react";

export default function NewTerrainFolderPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
  }

  function handleAudioChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setAudioFile(file);
  }

  const totalFilesText = useMemo(() => {
    if (selectedFiles.length === 0) return "Aucun fichier sélectionné";
    if (selectedFiles.length === 1) return "1 fichier sélectionné";
    return `${selectedFiles.length} fichiers sélectionnés`;
  }, [selectedFiles]);

  return (
    <main className="min-h-screen bg-white text-black p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold">Ajouter un dossier terrain</h1>
            <p className="text-gray-600 mt-2">
              Créez un dossier pour une livraison, un ramassage, un dommage ou tout autre document terrain
            </p>
          </div>

          <Link
            href="/employe/documents"
            className="px-5 py-3 rounded-xl border border-gray-300 hover:bg-gray-100 transition text-center"
          >
            Retour aux documents
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 shadow-sm p-6 md:p-8">
          <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Client
                </label>
                <input
                  type="text"
                  placeholder="Nom du client"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Référence obligatoire
                </label>
                <input
                  type="text"
                  placeholder="Ex: RAM-1038"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Type de dossier
              </label>
              <select className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black bg-white">
                <option>Choisir un type</option>
                <option>Livraison</option>
                <option>Ramassage</option>
                <option>Dommage à la livraison</option>
                <option>Dommage avant ramassage</option>
                <option>État du véhicule</option>
                <option>Document signé</option>
                <option>Autre</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Commentaire
              </label>
              <textarea
                rows={5}
                placeholder="Ajoutez un commentaire ou une note importante"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Ajouter des photos ou documents
                </label>
                <input
                  type="file"
                  multiple
                  onChange={handleFilesChange}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Vous pouvez sélectionner plusieurs photos ou fichiers
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                <h2 className="text-lg font-bold mb-2">Aperçu des fichiers</h2>
                <p className="text-sm text-gray-600 mb-3">{totalFilesText}</p>

                {selectedFiles.length > 0 ? (
                  <ul className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      >
                        {index + 1}. {file.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">
                    Aucune photo ou document sélectionné pour le moment.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-5">
              <div>
                <h2 className="text-2xl font-bold">Confirmation vocale</h2>
                <p className="text-gray-600 mt-2">
                  Utilisez cette option pour faire confirmer verbalement la livraison ou le ramassage par le client.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Type de confirmation
                </label>
                <select className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black bg-white">
                  <option>Aucune confirmation vocale</option>
                  <option>Confirmation de livraison</option>
                  <option>Confirmation de ramassage</option>
                  <option>Confirmation avec réserve</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Texte suggéré au livreur
                </label>
                <textarea
                  rows={8}
                  readOnly
                  value={`Bonjour, nous sommes le [date], il est [heure]. Je confirme la livraison ou le ramassage au nom de [compagnie]. Pour nos dossiers, j’aimerais enregistrer votre confirmation pour la référence [référence]. Est-ce que vous acceptez d’être enregistré?

Phrase suggérée pour le client :

Je soussigné(e), [nom du client], confirme avoir reçu ou remis les items liés à la référence [référence], en date du [date] à [heure]. Je confirme l’état suivant : [conforme ou avec réserve]. Mes commentaires sont les suivants : [commentaire].`}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 bg-white text-gray-700 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Résultat de la confirmation
                  </label>
                  <select className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black bg-white">
                    <option>À enregistrer</option>
                    <option>Acceptée sans réserve</option>
                    <option>Acceptée avec réserve</option>
                    <option>Refusée</option>
                    <option>Client absent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Fichier audio
                  </label>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioChange}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-white border border-gray-200 p-4">
                <h2 className="text-lg font-bold mb-2">Aperçu du fichier audio</h2>

                {audioFile ? (
                  <p className="text-sm text-gray-700">{audioFile.name}</p>
                ) : (
                  <p className="text-sm text-gray-500">
                    Aucun fichier audio sélectionné pour le moment.
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  type="button"
                  className="px-6 py-4 rounded-xl bg-black text-white font-semibold text-lg hover:opacity-90 transition"
                >
                  Démarrer l’enregistrement
                </button>

                <button
                  type="button"
                  className="px-6 py-4 rounded-xl border border-black text-black font-semibold text-lg hover:bg-black hover:text-white transition"
                >
                  Arrêter l’enregistrement
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                type="submit"
                className="px-6 py-4 rounded-xl bg-black text-white font-semibold text-lg hover:opacity-90 transition"
              >
                Enregistrer le dossier
              </button>

              <button
                type="button"
                className="px-6 py-4 rounded-xl border border-black text-black font-semibold text-lg hover:bg-black hover:text-white transition"
              >
                Envoyer à la direction
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}