import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Génère la migration SQL complète (UTF-8) pour app_communication_templates. */
const phase1 = new Set([
  "horodateur_exception_created_direction_email",
  "horodateur_exception_created_direction_sms",
  "horodateur_exception_approved_employee_email",
  "horodateur_exception_approved_employee_sms",
  "horodateur_exception_rejected_employee_email",
  "horodateur_exception_rejected_employee_sms",
  "schedule_request_created_direction_email",
  "schedule_request_created_direction_sms",
  "schedule_request_approved_employee_email",
  "schedule_request_approved_employee_sms",
  "schedule_request_rejected_employee_email",
  "schedule_request_rejected_employee_sms",
  "employee_schedule_updated_email",
  "employee_schedule_updated_sms",
  "employee_shift_updated_email",
  "employee_shift_updated_sms",
]);

const rows = [
  [
    "horodateur_exception_created_direction_email",
    "Horodateur",
    "email",
    "direction_admin",
    "Exception horodateur — direction (courriel)",
    "Alerte lorsqu'une exception horodateur est en attente.",
    "TAGORA Time — Exception horodateur à traiter",
    "Employé : {{employee_name}}\nType : {{exception_type}}\nMotif : {{system_reason}}\nNote employé : {{employee_note}}\nApprouver : {{approve_url}}\nRefuser : {{reject_url}}\nVoir : {{action_url}}",
  ],
  [
    "horodateur_exception_created_direction_sms",
    "Horodateur",
    "sms",
    "direction_admin",
    "Exception horodateur — direction (SMS)",
    "SMS pour la direction.",
    "",
    "TAGORA Time. Exception {{exception_type}} — {{employee_name}}. {{action_url}}",
  ],
  [
    "horodateur_exception_approved_employee_email",
    "Horodateur",
    "email",
    "employee",
    "Exception approuvée — employé",
    "",
    "Votre exception horodateur a été approuvée",
    "Bonjour {{employee_name}},\n\nVotre demande d'exception a été approuvée.\n\n{{action_url}}",
  ],
  [
    "horodateur_exception_approved_employee_sms",
    "Horodateur",
    "sms",
    "employee",
    "Exception approuvée — SMS",
    "",
    "",
    "TAGORA Time : exception horodateur approuvée. {{action_url}}",
  ],
  [
    "horodateur_exception_rejected_employee_email",
    "Horodateur",
    "email",
    "employee",
    "Exception refusée — employé",
    "",
    "Votre exception horodateur a été refusée",
    "Bonjour {{employee_name}},\n\nVotre demande a été refusée.\nNote : {{decision_note}}\n\n{{action_url}}",
  ],
  [
    "horodateur_exception_rejected_employee_sms",
    "Horodateur",
    "sms",
    "employee",
    "Exception refusée — SMS",
    "",
    "",
    "TAGORA Time : exception refusée. {{action_url}}",
  ],
  [
    "schedule_request_created_direction_email",
    "Demandes d'horaire",
    "email",
    "direction_admin",
    "Nouvelle demande d'horaire",
    "",
    "Nouvelle demande d'horaire ou d'exception à approuver",
    "Demande de {{employee_name}}\nType : {{request_type}}\nPériode : {{request_period}}\nJustification : {{employee_note}}\n\n{{action_url}}",
  ],
  [
    "schedule_request_created_direction_sms",
    "Demandes d'horaire",
    "sms",
    "direction_admin",
    "Nouvelle demande — SMS",
    "",
    "",
    "TAGORA Time : nouvelle demande horaire/exception de {{employee_name}}. {{action_url}}",
  ],
  [
    "schedule_request_approved_employee_email",
    "Demandes d'horaire",
    "email",
    "employee",
    "Demande approuvée",
    "",
    "Votre demande TAGORA Time a été approuvée",
    "Bonjour {{employee_name}},\n\nVotre demande a été approuvée.\n\n{{dashboard_url}}",
  ],
  [
    "schedule_request_approved_employee_sms",
    "Demandes d'horaire",
    "sms",
    "employee",
    "Demande approuvée — SMS",
    "",
    "",
    "TAGORA Time : demande d'horaire approuvée. {{dashboard_url}}",
  ],
  [
    "schedule_request_rejected_employee_email",
    "Demandes d'horaire",
    "email",
    "employee",
    "Demande refusée",
    "",
    "Votre demande TAGORA Time a été refusée",
    "Bonjour {{employee_name}},\n\nVotre demande a été refusée.\n\n{{dashboard_url}}",
  ],
  [
    "schedule_request_rejected_employee_sms",
    "Demandes d'horaire",
    "sms",
    "employee",
    "Demande refusée — SMS",
    "",
    "",
    "TAGORA Time : demande refusée. Consultez l'application.",
  ],
  [
    "employee_schedule_updated_email",
    "Horaire employé",
    "email",
    "employee",
    "Horaire mis à jour",
    "",
    "Votre horaire TAGORA Time a été mis à jour",
    "Bonjour {{employee_name}},\n\nVotre horaire a été mis à jour.\n\n{{dashboard_url}}",
  ],
  [
    "employee_schedule_updated_sms",
    "Horaire employé",
    "sms",
    "employee",
    "Horaire mis à jour — SMS",
    "",
    "",
    "TAGORA Time : votre horaire a été mis à jour. {{dashboard_url}}",
  ],
  [
    "employee_shift_updated_email",
    "Horaire employé",
    "email",
    "employee",
    "Quart modifié",
    "",
    "Votre horaire TAGORA Time a été mis à jour",
    "Bonjour {{employee_name}},\n\nUn quart a été ajouté ou modifié.\n\n{{dashboard_url}}",
  ],
  [
    "employee_shift_updated_sms",
    "Horaire employé",
    "sms",
    "employee",
    "Quart modifié — SMS",
    "",
    "",
    "TAGORA Time : quart ajouté ou modifié. {{dashboard_url}}",
  ],
  [
    "employee_expense_created_direction_email",
    "Dépenses employé",
    "email",
    "direction_admin",
    "Dépense signalée (direction)",
    "",
    "Nouvelle dépense employé",
    "{{employee_name}} — {{amount}} — {{client_name}}\n{{action_url}}",
  ],
  [
    "employee_expense_created_direction_sms",
    "Dépenses employé",
    "sms",
    "direction_admin",
    "Dépense signalée SMS",
    "",
    "",
    "TAGORA Time : dépense {{employee_name}} {{amount}}",
  ],
  [
    "employee_expense_processed_employee_email",
    "Dépenses employé",
    "email",
    "employee",
    "Dépense traitée",
    "",
    "Mise à jour dépense",
    "Bonjour {{employee_name}}, statut : {{expense_status}}",
  ],
  [
    "employee_expense_paid_employee_email",
    "Dépenses employé",
    "email",
    "employee",
    "Dépense payée",
    "",
    "Dépense payée",
    "Bonjour {{employee_name}}, dépense payée.",
  ],
  [
    "employee_expense_rejected_employee_email",
    "Dépenses employé",
    "email",
    "employee",
    "Dépense refusée",
    "",
    "Dépense refusée",
    "Bonjour {{employee_name}}, dépense refusée.",
  ],
  [
    "employee_expense_status_updated_employee_sms",
    "Dépenses employé",
    "sms",
    "employee",
    "Statut dépense SMS",
    "",
    "",
    "TAGORA Time : dépense {{expense_status}}",
  ],
  [
    "incident_damage_created_direction_email",
    "Incidents / dommages",
    "email",
    "direction_admin",
    "Incident / dommage",
    "",
    "Incident à vérifier",
    "{{employee_name}} — {{mission_name}}\n{{employee_note}}\n{{action_url}}",
  ],
  [
    "incident_damage_created_direction_sms",
    "Incidents / dommages",
    "sms",
    "direction_admin",
    "Incident SMS",
    "",
    "",
    "TAGORA Time : incident {{mission_name}}",
  ],
  [
    "internal_note_created_direction_email",
    "Notes internes",
    "email",
    "direction_admin",
    "Note interne",
    "",
    "Nouvelle note interne",
    "{{employee_name}} — {{mission_name}}\n{{employee_note}}",
  ],
  [
    "internal_note_created_direction_sms",
    "Notes internes",
    "sms",
    "direction_admin",
    "Note interne SMS",
    "",
    "",
    "TAGORA Time : note interne mission.",
  ],
  [
    "account_request_pending_direction_email",
    "Comptes",
    "email",
    "direction_admin",
    "Demande de compte",
    "",
    "Nouvelle demande de compte",
    "{{employee_name}} {{request_type}}\n{{action_url}}",
  ],
  [
    "account_request_pending_direction_sms",
    "Comptes",
    "sms",
    "direction_admin",
    "Demande compte SMS",
    "",
    "",
    "TAGORA Time : demande de compte.",
  ],
  [
    "account_approved_employee_email",
    "Comptes",
    "email",
    "employee",
    "Compte approuvé",
    "",
    "Votre accès TAGORA Time",
    "Bonjour {{employee_name}}, compte approuvé. {{action_url}}",
  ],
  [
    "account_rejected_employee_email",
    "Comptes",
    "email",
    "employee",
    "Compte refusé",
    "",
    "Demande refusée",
    "Bonjour {{employee_name}}, demande refusée.",
  ],
  [
    "improvement_created_direction_email",
    "Améliorations",
    "email",
    "direction_admin",
    "Amélioration",
    "",
    "Nouvelle suggestion",
    "{{employee_note}}\n{{action_url}}",
  ],
  [
    "improvement_created_direction_sms",
    "Améliorations",
    "sms",
    "direction_admin",
    "Amélioration SMS",
    "",
    "",
    "TAGORA Time : nouvelle amélioration.",
  ],
  [
    "internal_mention_email",
    "Améliorations",
    "email",
    "direction_admin",
    "Mention interne",
    "",
    "Mention",
    "{{employee_name}} vous a mentionné.\n{{employee_note}}",
  ],
  [
    "delivery_late_direction_email",
    "Livraisons / ramassages",
    "email",
    "direction_admin",
    "Livraison en retard",
    "",
    "Livraison en retard",
    "Livraison {{delivery_id}} {{client_name}}",
  ],
  [
    "delivery_late_direction_sms",
    "Livraisons / ramassages",
    "sms",
    "direction_admin",
    "Livraison retard SMS",
    "",
    "",
    "TAGORA Time : livraison en retard {{delivery_id}}",
  ],
  [
    "pickup_late_direction_email",
    "Livraisons / ramassages",
    "email",
    "direction_admin",
    "Ramassage en retard",
    "",
    "Ramassage en retard",
    "Ramassage {{delivery_id}}",
  ],
  [
    "pickup_late_direction_sms",
    "Livraisons / ramassages",
    "sms",
    "direction_admin",
    "Ramassage SMS",
    "",
    "",
    "TAGORA Time : ramassage en retard",
  ],
  [
    "delivery_proof_missing_direction_email",
    "Livraisons / ramassages",
    "email",
    "direction_admin",
    "Preuve manquante",
    "",
    "Preuve manquante",
    "Livraison {{delivery_id}}",
  ],
  [
    "driver_missing_direction_email",
    "Livraisons / ramassages",
    "email",
    "direction_admin",
    "Livreur manquant",
    "",
    "Livreur manquant",
    "Mission {{mission_name}}",
  ],
  [
    "titan_time_pending_direction_email",
    "Refacturation Titan",
    "email",
    "direction_admin",
    "Temps Titan",
    "",
    "Temps à valider",
    "{{employee_name}} {{request_period}}",
  ],
  [
    "titan_km_pending_direction_email",
    "Refacturation Titan",
    "email",
    "direction_admin",
    "KM Titan",
    "",
    "KM à valider",
    "{{employee_name}}",
  ],
  [
    "titan_billing_ready_direction_email",
    "Refacturation Titan",
    "email",
    "direction_admin",
    "Facturation prête",
    "",
    "Refacturation prête",
    "{{company_name}}",
  ],
  [
    "notification_failure_direction_email",
    "Système",
    "email",
    "direction_admin",
    "Échec courriel",
    "",
    "Échec envoi",
    "Canal : détail dans le centre d'alertes. {{employee_note}}",
  ],
  [
    "notification_failure_direction_sms",
    "Système",
    "sms",
    "direction_admin",
    "Échec SMS",
    "",
    "",
    "TAGORA Time : échec envoi notification",
  ],
  [
    "missing_configuration_direction_email",
    "Système",
    "email",
    "direction_admin",
    "Config manquante",
    "",
    "Configuration manquante",
    "Vérifier les clés API et la configuration.",
  ],
  [
    "missing_api_key_direction_email",
    "Système",
    "email",
    "direction_admin",
    "Clé API",
    "",
    "Clé API manquante",
    "Configurer Resend/Twilio.",
  ],
];

function escSql(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

/** Corps/sujet en literal E'...' avec \n explicites (une ligne SQL). */
function escE(s) {
  return (
    "E'" +
    s
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "''")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "") +
    "'"
  );
}

const lines = [];
lines.push("-- Seed genere par scripts/build-communication-template-seed.mjs");
for (const r of rows) {
  const [key, cat, ch, aud, name, desc, subj, body] = r;
  const impl = phase1.has(key) ? "connected" : "planned";
  const subjSql = subj ? escE(subj) : "null";
  const descSql = desc && desc.trim() ? escE(desc) : "null";
  const bodySql = escE(body);
  lines.push(
    `INSERT INTO public.app_communication_templates (template_key, category, channel, audience, name, description, subject, body, default_subject, default_body, active, variables, implementation_status, is_system) VALUES ('${escSql(key)}', '${escSql(cat)}', '${ch}', '${aud}', '${escSql(name)}', ${descSql}, ${subjSql}, ${bodySql}, ${subjSql === "null" ? "null" : subjSql}, ${bodySql}, true, '[]'::jsonb, '${impl}', true) ON CONFLICT (template_key, channel, audience) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, subject = EXCLUDED.subject, body = EXCLUDED.body, default_subject = EXCLUDED.default_subject, default_body = EXCLUDED.default_body, implementation_status = EXCLUDED.implementation_status, updated_at = timezone('utc', now());`
  );
}
const createSql = `
-- Inventaire et contenu des modèles courriel/SMS (éditable dans /direction/alertes/communications).

create table if not exists public.app_communication_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  template_key text not null,
  category text not null,
  channel text not null,
  audience text not null,
  name text not null,
  description text null,
  subject text null,
  body text not null,
  active boolean not null default true,
  variables jsonb not null default '[]'::jsonb,
  default_subject text null,
  default_body text null,
  is_system boolean not null default true,
  implementation_status text not null default 'planned',
  updated_by uuid null references auth.users (id) on delete set null,
  constraint app_communication_templates_channel_chk check (channel in ('email','sms')),
  constraint app_communication_templates_audience_chk check (audience in ('employee','direction_admin','direction','admin')),
  constraint app_communication_templates_impl_chk check (implementation_status in ('connected','planned','inactive','to_configure')),
  constraint app_communication_templates_unique_triplet unique (template_key, channel, audience)
);

create index if not exists idx_app_communication_templates_cat
  on public.app_communication_templates (category);
create index if not exists idx_app_communication_templates_impl
  on public.app_communication_templates (implementation_status);

create or replace function public.set_communication_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_app_communication_templates_updated_at on public.app_communication_templates;
create trigger trg_app_communication_templates_updated_at
  before update on public.app_communication_templates
  for each row execute function public.set_communication_templates_updated_at();

alter table public.app_communication_templates enable row level security;

comment on table public.app_communication_templates is
  'Modèles de communications : textes éditables par direction/admin ; envoi via service role.';
`;

const outPath = path.join(
  __dirname,
  "../supabase/migrations/20260509120000_app_communication_templates.sql"
);
fs.writeFileSync(outPath, createSql.trim() + "\n\n" + lines.join("\n") + "\n", "utf8");
console.log("Wrote", outPath);
