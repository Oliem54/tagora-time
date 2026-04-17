"use client";

import { ChangeEvent, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";

export default function NewDirectionTerrainFolderPage() {
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
    if (selectedFiles.length === 0) return "Aucun fichier selectionne";
    if (selectedFiles.length === 1) return "1 fichier selectionne";
    return `${selectedFiles.length} fichiers selectionnes`;
  }, [selectedFiles]);

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg" style={{ maxWidth: 1120 }}>
        <HeaderTagora
          title="Ajouter un dossier terrain"
          subtitle="Creez un dossier pour une livraison, un ramassage, un dommage ou tout autre document terrain."
        />

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 md:p-8">
          <form className="space-y-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2">Client</label>
                <input
                  type="text"
                  placeholder="Nom du client"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Reference obligatoire
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
              <select className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black">
                <option>Choisir un type</option>
                <option>Livraison</option>
                <option>Ramassage</option>
                <option>Dommage a la livraison</option>
                <option>Dommage avant ramassage</option>
                <option>Etat du vehicule</option>
                <option>Document signe</option>
                <option>Autre</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Commentaire</label>
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
                <p className="mt-2 text-sm text-gray-500">
                  Vous pouvez selectionner plusieurs photos ou fichiers.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <h2 className="mb-2 text-lg font-bold">Apercu des fichiers</h2>
                <p className="mb-3 text-sm text-gray-600">{totalFilesText}</p>

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
                    Aucun photo ou document selectionne pour le moment.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-5">
              <div>
                <h2 className="text-2xl font-bold">Confirmation vocale</h2>
                <p className="mt-2 text-gray-600">
                  Utilisez cette option pour faire confirmer verbalement la
                  livraison ou le ramassage par le client.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Type de confirmation
                </label>
                <select className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black">
                  <option>Aucune confirmation vocale</option>
                  <option>Confirmation de livraison</option>
                  <option>Confirmation de ramassage</option>
                  <option>Confirmation avec reserve</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Texte suggere au livreur
                </label>
                <textarea
                  rows={8}
                  readOnly
                  value={`Bonjour, nous sommes le [date], il est [heure]. Je confirme la livraison ou le ramassage au nom de [compagnie]. Pour nos dossiers, j'aimerais enregistrer votre confirmation pour la reference [reference]. Est-ce que vous acceptez d'etre enregistre?\n\nPhrase suggeree pour le client :\n\nJe soussigne(e), [nom du client], confirme avoir recu ou remis les items lies a la reference [reference], en date du [date] a [heure]. Je confirme l'etat suivant : [conforme ou avec reserve]. Mes commentaires sont les suivants : [commentaire].`}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-700 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Resultat de la confirmation
                  </label>
                  <select className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black">
                    <option>A enregistrer</option>
                    <option>Acceptee sans reserve</option>
                    <option>Acceptee avec reserve</option>
                    <option>Refusee</option>
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

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h2 className="mb-2 text-lg font-bold">Apercu du fichier audio</h2>

                {audioFile ? (
                  <p className="text-sm text-gray-700">{audioFile.name}</p>
                ) : (
                  <p className="text-sm text-gray-500">
                    Aucun fichier audio selectionne pour le moment.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <button
                  type="button"
                  className="tagora-dark-action rounded-xl px-6 py-4 text-lg font-semibold transition"
                >
                  Demarrer l&apos;enregistrement
                </button>

                <button
                  type="button"
                  className="tagora-dark-outline-action rounded-xl border px-6 py-4 text-lg font-semibold transition"
                >
                  Arreter l&apos;enregistrement
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <button
                type="submit"
                className="tagora-dark-action rounded-xl px-6 py-4 text-lg font-semibold transition"
              >
                Creer
              </button>

              <button
                type="button"
                className="tagora-dark-outline-action rounded-xl border px-6 py-4 text-lg font-semibold transition"
              >
                Envoyer a la direction
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
