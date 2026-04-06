"use client";

import { useEffect, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import { supabase } from "@/lib/supabase/client";

export default function Page() {
  const [livraisons, setLivraisons] = useState<any[]>([]);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [chauffeurs, setChauffeurs] = useState<any[]>([]);
  const [vehicules, setVehicules] = useState<any[]>([]);
  const [remorques, setRemorques] = useState<any[]>([]);

  const [filtre, setFiltre] = useState({
    chauffeur_id: "",
    vehicule_id: "",
    remorque_id: "",
  });

  const [form, setForm] = useState({
    dossier_id: "",
    adresse: "",
    date_livraison: "",
    heure_prevue: "",
    chauffeur_id: "",
    vehicule_id: "",
    remorque_id: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: liv } = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .order("id", { ascending: false });

    const { data: dos } = await supabase.from("dossiers").select("*");
    const { data: ch } = await supabase.from("chauffeurs").select("*").eq("actif", true);
    const { data: ve } = await supabase.from("vehicules").select("*").eq("actif", true);
    const { data: re } = await supabase.from("remorques").select("*").eq("actif", true);

    setLivraisons(liv || []);
    setDossiers(dos || []);
    setChauffeurs(ch || []);
    setVehicules(ve || []);
    setRemorques(re || []);
  }

  async function createLivraison() {
    await supabase.from("livraisons_planifiees").insert([
      {
        dossier_id: Number(form.dossier_id),
        adresse: form.adresse,
        date_livraison: form.date_livraison,
        heure_prevue: form.heure_prevue,
        chauffeur_id: form.chauffeur_id || null,
        vehicule_id: form.vehicule_id || null,
        remorque_id: form.remorque_id || null,
        statut: "planifiee",
      },
    ]);

    setForm({
      dossier_id: "",
      adresse: "",
      date_livraison: "",
      heure_prevue: "",
      chauffeur_id: "",
      vehicule_id: "",
      remorque_id: "",
    });

    fetchData();
  }

  function getNomChauffeur(id: any) {
    return chauffeurs.find((c) => c.id == id)?.nom || "-";
  }

  function getNomVehicule(id: any) {
    return vehicules.find((v) => v.id == id)?.nom || "-";
  }

  function getNomRemorque(id: any) {
    return remorques.find((r) => r.id == id)?.nom || "-";
  }

  const livraisonsFiltrees = livraisons.filter((l) => {
    return (
      (!filtre.chauffeur_id || l.chauffeur_id == filtre.chauffeur_id) &&
      (!filtre.vehicule_id || l.vehicule_id == filtre.vehicule_id) &&
      (!filtre.remorque_id || l.remorque_id == filtre.remorque_id)
    );
  });

  return (
    <main style={{ padding: 20 }}>
      <HeaderTagora title="Calendrier des livraisons" />

      {/* FILTRES */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <select onChange={(e) => setFiltre({ ...filtre, chauffeur_id: e.target.value })}>
          <option value="">Tous chauffeurs</option>
          {chauffeurs.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>

        <select onChange={(e) => setFiltre({ ...filtre, vehicule_id: e.target.value })}>
          <option value="">Tous véhicules</option>
          {vehicules.map((v) => (
            <option key={v.id} value={v.id}>{v.nom}</option>
          ))}
        </select>

        <select onChange={(e) => setFiltre({ ...filtre, remorque_id: e.target.value })}>
          <option value="">Toutes remorques</option>
          {remorques.map((r) => (
            <option key={r.id} value={r.id}>{r.nom}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 30 }}>
        
        {/* FORM */}
        <div style={{ width: 350 }}>
          <h3>Nouvelle livraison</h3>

          <select onChange={(e) => setForm({ ...form, dossier_id: e.target.value })}>
            <option value="">Choisir un dossier</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>{d.nom || d.client}</option>
            ))}
          </select>

          <input placeholder="Adresse" onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
          <input type="date" onChange={(e) => setForm({ ...form, date_livraison: e.target.value })} />
          <input placeholder="Heure prévue" onChange={(e) => setForm({ ...form, heure_prevue: e.target.value })} />

          <select onChange={(e) => setForm({ ...form, chauffeur_id: e.target.value })}>
            <option value="">Chauffeur</option>
            {chauffeurs.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>

          <select onChange={(e) => setForm({ ...form, vehicule_id: e.target.value })}>
            <option value="">Véhicule</option>
            {vehicules.map((v) => (
              <option key={v.id} value={v.id}>{v.nom}</option>
            ))}
          </select>

          <select onChange={(e) => setForm({ ...form, remorque_id: e.target.value })}>
            <option value="">Remorque</option>
            {remorques.map((r) => (
              <option key={r.id} value={r.id}>{r.nom}</option>
            ))}
          </select>

          <button onClick={createLivraison} style={{ marginTop: 10 }}>
            Ajouter la livraison
          </button>
        </div>

        {/* LISTE */}
        <div style={{ flex: 1 }}>
          <h3>Livraisons</h3>

          {livraisonsFiltrees.map((l) => (
            <div key={l.id} style={{ padding: 10, borderBottom: "1px solid #ddd" }}>
              <div><b>Adresse:</b> {l.adresse}</div>
              <div><b>Date:</b> {l.date_livraison}</div>
              <div><b>Chauffeur:</b> {getNomChauffeur(l.chauffeur_id)}</div>
              <div><b>Véhicule:</b> {getNomVehicule(l.vehicule_id)}</div>
              <div><b>Remorque:</b> {getNomRemorque(l.remorque_id)}</div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}