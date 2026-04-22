"use client";

import Link from "next/link";
import { ChangeEvent, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";

const interventionTypes = [
  { value: "", label: "Choisir un type" },
  { value: "livraison", label: "Livraison" },
  { value: "ramassage", label: "Ramassage" },
  { value: "incident", label: "Incident / dommage" },
  { value: "depense", label: "Depense employe" },
  { value: "note_interne", label: "Note interne liee a mission" },
];

const confirmationTypes = [
  "Aucune confirmation vocale",
  "Confirmation de livraison",
  "Confirmation de ramassage",
  "Confirmation avec reserve",
];

const confirmationResults = [
  "A enregistrer",
  "Acceptee sans reserve",
  "Acceptee avec reserve",
  "Refusee",
  "Client absent",
];

export default function NewTerrainFolderPage() {
  const [typeIntervention, setTypeIntervention] = useState("");
  const [client, setClient] = useState("");
  const [referenceLiee, setReferenceLiee] = useState("");
  const [contactNom, setContactNom] = useState("");
  const [dateHeure, setDateHeure] = useState("");
  const [kmDepart, setKmDepart] = useState("");
  const [kmArrivee, setKmArrivee] = useState("");
  const [incidentUrgence, setIncidentUrgence] = useState("moyenne");
  const [depenseMontant, setDepenseMontant] = useState("");
  const [depenseCategorie, setDepenseCategorie] = useState("");
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
      <div className="tagora-app-content" style={{ maxWidth: 1400 }}>
        <HeaderTagora
          title="Nouvelle intervention"
          subtitle="Choisissez le type puis completez les preuves operationnelles."
        />

        <div className="tagora-split">
          <section className="tagora-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 className="section-title" style={{ marginBottom: 10 }}>Informations de l intervention</h2>
                <p className="tagora-note">
                  Renseignez le client, la reference liee, puis les preuves selon le type.
                </p>
              </div>

              <Link
                href="/employe/documents"
                className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
              >
                Retour
              </Link>
            </div>

            <form className="tagora-form-grid">
              <div>
                <label className="tagora-field-label">Type d intervention</label>
                <select
                  className="tagora-select"
                  value={typeIntervention}
                  onChange={(event) => setTypeIntervention(event.target.value)}
                >
                  {interventionTypes.map((type) => (
                    <option key={type.value || "empty"} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tagora-form-grid-2">
                <div>
                  <label className="tagora-field-label">Client</label>
                  <input
                    type="text"
                    placeholder="Nom du client"
                    className="tagora-input"
                    value={client}
                    onChange={(event) => setClient(event.target.value)}
                  />
                </div>

                <div>
                  <label className="tagora-field-label">Reference liee</label>
                  <input
                    type="text"
                    placeholder="Ex: LIV-2026-041"
                    className="tagora-input"
                    value={referenceLiee}
                    onChange={(event) => setReferenceLiee(event.target.value)}
                  />
                </div>
              </div>

              {(typeIntervention === "livraison" || typeIntervention === "ramassage") ? (
                <>
                  <div className="tagora-form-grid-2">
                    <div>
                      <label className="tagora-field-label">Nom du contact</label>
                      <input
                        type="text"
                        placeholder="Nom du contact"
                        className="tagora-input"
                        value={contactNom}
                        onChange={(event) => setContactNom(event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="tagora-field-label">Date / heure</label>
                      <input
                        type="datetime-local"
                        className="tagora-input"
                        value={dateHeure}
                        onChange={(event) => setDateHeure(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="tagora-form-grid-2">
                    <div>
                      <label className="tagora-field-label">KM depart</label>
                      <input
                        type="number"
                        className="tagora-input"
                        value={kmDepart}
                        onChange={(event) => setKmDepart(event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="tagora-field-label">KM arrivee</label>
                      <input
                        type="number"
                        className="tagora-input"
                        value={kmArrivee}
                        onChange={(event) => setKmArrivee(event.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              {typeIntervention === "incident" ? (
                <div>
                  <label className="tagora-field-label">Niveau d urgence</label>
                  <select
                    className="tagora-select"
                    value={incidentUrgence}
                    onChange={(event) => setIncidentUrgence(event.target.value)}
                  >
                    <option value="faible">Faible</option>
                    <option value="moyenne">Moyenne</option>
                    <option value="elevee">Elevee</option>
                    <option value="critique">Critique</option>
                  </select>
                </div>
              ) : null}

              {typeIntervention === "depense" ? (
                <div className="tagora-form-grid-2">
                  <div>
                    <label className="tagora-field-label">Montant</label>
                    <input
                      type="number"
                      step="0.01"
                      className="tagora-input"
                      value={depenseMontant}
                      onChange={(event) => setDepenseMontant(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="tagora-field-label">Categorie</label>
                    <input
                      type="text"
                      placeholder="Ex: Carburant"
                      className="tagora-input"
                      value={depenseCategorie}
                      onChange={(event) => setDepenseCategorie(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <label className="tagora-field-label">Notes operationnelles</label>
                <textarea
                  rows={5}
                  placeholder="Ajoutez un commentaire ou une note importante"
                  className="tagora-textarea"
                />
              </div>

              <div className="tagora-panel-muted">
                <div style={{ marginBottom: 12 }}>
                  <label className="tagora-field-label">Ajouter des photos ou documents</label>
                  <input type="file" multiple onChange={handleFilesChange} className="tagora-input" />
                </div>

                <p className="tagora-note">Vous pouvez selectionner plusieurs photos ou fichiers a la fois.</p>
              </div>

              <div className="tagora-panel-muted">
                <div style={{ marginBottom: 12 }}>
                  <h2 className="section-title" style={{ fontSize: 20, marginBottom: 10 }}>Confirmation vocale</h2>
                  <p className="tagora-note">
                    Preuve audio operationnelle du client (pas de biometrie vocale).
                  </p>
                </div>

                <div className="tagora-form-grid">
                  <div>
                    <label className="tagora-field-label">Type de confirmation</label>
                    <select className="tagora-select">
                      {confirmationTypes.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="tagora-field-label">Texte suggere a lire</label>
                    <textarea
                      rows={8}
                      readOnly
                      value={`Bonjour, nous sommes le [date], il est [heure]. Je confirme l intervention reference [reference]. Est-ce que vous acceptez d etre enregistre ?\n\nJe soussigne(e), [nom du client], confirme l operation [type] a [date/heure]. Commentaire : [note].`}
                      className="tagora-textarea"
                    />
                  </div>

                  <div className="tagora-form-grid-2">
                    <div>
                      <label className="tagora-field-label">Resultat de la confirmation</label>
                      <select className="tagora-select">
                        {confirmationResults.map((result) => (
                          <option key={result}>{result}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="tagora-field-label">Fichier audio</label>
                      <input type="file" accept="audio/*" onChange={handleAudioChange} className="tagora-input" />
                    </div>
                  </div>
                </div>

                <div className="tagora-actions" style={{ marginTop: 20 }}>
                  <button type="button" className="tagora-dark-action rounded-xl px-6 py-4 text-base font-semibold transition">
                    Demarrer enregistrement
                  </button>

                  <button type="button" className="tagora-dark-outline-action rounded-xl border px-6 py-4 text-base font-semibold transition">
                    Arreter enregistrement
                  </button>
                </div>
              </div>

              <div className="tagora-actions">
                <button type="submit" className="tagora-dark-action rounded-xl px-6 py-4 text-base font-semibold transition">
                  Creer l intervention
                </button>

                <button type="button" className="tagora-dark-outline-action rounded-xl border px-6 py-4 text-base font-semibold transition">
                  Ouvrir
                </button>
              </div>
            </form>
          </section>

          <aside className="tagora-stack">
            <div className="tagora-panel">
              <h2 className="section-title" style={{ marginBottom: 10 }}>Apercu des fichiers</h2>
              <p className="tagora-note" style={{ marginBottom: 16 }}>{totalFilesText}</p>

              {selectedFiles.length > 0 ? (
                <ul style={{ display: "grid", gap: 10, padding: 0, margin: 0, listStyle: "none" }}>
                  {selectedFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="tagora-panel-muted" style={{ padding: 14 }}>
                      <strong>{index + 1}.</strong> {file.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="tagora-panel-muted">
                  <p className="tagora-note">Aucune photo ou document selectionne pour le moment.</p>
                </div>
              )}
            </div>

            <div className="tagora-panel">
              <h2 className="section-title" style={{ marginBottom: 10 }}>Apercu audio</h2>
              <div className="tagora-panel-muted">
                <p className="tagora-note">
                  {audioFile ? audioFile.name : "Aucun fichier audio selectionne pour le moment."}
                </p>
              </div>
            </div>

            <div className="tagora-panel">
              <h2 className="section-title" style={{ marginBottom: 10 }}>Rappel qualite</h2>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#475569", lineHeight: 1.7 }}>
                <li>Verifier la reference avant envoi.</li>
                <li>Joindre les preuves photo essentielles.</li>
                <li>Ajouter une note concise si un ecart est constate.</li>
                <li>Envoyer a la direction seulement apres validation visuelle.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
