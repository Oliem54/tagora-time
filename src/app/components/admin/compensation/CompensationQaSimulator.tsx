"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import {
  COMPENSATION_QA_DEFAULTS,
  isCompensationQaSimulatorAllowed,
} from "@/app/lib/commissions/compensation-qa.shared";

type CompensationQaSimulatorProps = {
  onCreated?: () => void;
};

type FormState = {
  chauffeur_id: string;
  amount: string;
  sold_at: string;
  sale_state: string;
  company_context: string;
  external_reference: string;
  label: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function defaultForm(): FormState {
  return {
    chauffeur_id: String(COMPENSATION_QA_DEFAULTS.chauffeur_id),
    amount: COMPENSATION_QA_DEFAULTS.amount.toFixed(2),
    sold_at: todayIsoDate(),
    sale_state: COMPENSATION_QA_DEFAULTS.sale_state,
    company_context: COMPENSATION_QA_DEFAULTS.company_context,
    external_reference: COMPENSATION_QA_DEFAULTS.external_reference,
    label: COMPENSATION_QA_DEFAULTS.label,
  };
}

export default function CompensationQaSimulator({ onCreated }: CompensationQaSimulatorProps) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(() => defaultForm());

  useEffect(() => {
    setAllowed(
      isCompensationQaSimulatorAllowed({
        hostname: window.location.hostname,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      })
    );
  }, []);

  if (!allowed) {
    return null;
  }

  const submit = async () => {
    setBusy(true);
    setError("");

    try {
      const response = await commissionsFetch("/api/admin/compensation/qa-simulate-event", {
        method: "POST",
        body: JSON.stringify({
          chauffeur_id: Number(form.chauffeur_id),
          amount: Number(form.amount),
          sold_at: form.sold_at,
          sale_state: form.sale_state,
          company_context: form.company_context,
          external_reference: form.external_reference,
          label: form.label,
          notes: COMPENSATION_QA_DEFAULTS.notes,
          status: COMPENSATION_QA_DEFAULTS.status,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        event?: { id?: string };
        error?: string;
        errors?: string[];
      };

      if (!response.ok || !payload.event?.id) {
        throw new Error(
          payload.error ?? payload.errors?.[0] ?? "Simulation QA impossible."
        );
      }

      setOpen(false);
      onCreated?.();
      router.push(`/admin/compensation/ventes/${payload.event.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Simulation QA impossible."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="compensation-qa-simulator">
      <button
        type="button"
        className="tagora-dark-outline-action tagora-page-navigation-button"
        onClick={() => {
          setForm(defaultForm());
          setError("");
          setOpen((current) => !current);
        }}
      >
        <FlaskConical size={16} aria-hidden />
        <span>Simuler un événement de commission</span>
      </button>

      {open ? (
        <div className="compensation-qa-panel" role="region" aria-label="Simulateur QA">
          <p className="compensation-qa-panel__lead">
            Cette action simule la réception d’un événement externe aux fins de QA.
          </p>
          <p className="compensation-qa-panel__note">
            Donnée QA staging uniquement — employé test {COMPENSATION_QA_DEFAULTS.chauffeur_id}{" "}
            ({COMPENSATION_QA_DEFAULTS.chauffeur_label}). Identifiez ou annulez via la référence{" "}
            <code>{COMPENSATION_QA_DEFAULTS.external_reference}</code>.
          </p>

          <div className="compensation-qa-form">
            <label>
              Employé / chauffeur (ID)
              <input
                value={form.chauffeur_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, chauffeur_id: event.target.value }))
                }
              />
            </label>
            <label>
              Montant
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, amount: event.target.value }))
                }
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={form.sold_at}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sold_at: event.target.value }))
                }
              />
            </label>
            <label>
              État source
              <select
                value={form.sale_state}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sale_state: event.target.value }))
                }
              >
                <option value="sold">sold</option>
                <option value="delivered">delivered</option>
                <option value="invoiced">invoiced</option>
                <option value="collected">collected</option>
              </select>
            </label>
            <label>
              Compagnie / contexte
              <input
                value={form.company_context}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    company_context: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Référence externe
              <input
                value={form.external_reference}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    external_reference: event.target.value,
                  }))
                }
              />
            </label>
            <label className="compensation-qa-form__full">
              Libellé
              <input
                value={form.label}
                onChange={(event) =>
                  setForm((current) => ({ ...current, label: event.target.value }))
                }
              />
            </label>
          </div>

          {error ? <p className="compensation-qa-panel__error">{error}</p> : null}

          <div className="compensation-qa-panel__actions">
            <button
              type="button"
              className="tagora-dark-outline-action"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Fermer
            </button>
            <button
              type="button"
              className="tagora-dark-action"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Création…" : "Créer l’événement QA"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
