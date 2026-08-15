-- ============================================================
-- TAGORA Time — Historical schema bootstrap (SaaS 1B.1B)
-- Timestamp: 20260409120000 — before 20260410_120000_company_activation_and_payroll.sql
--
-- Source: staging schema-only dump (public) dated 2026-07-13
-- Project ref source: qokyobcvplzufshydhih (read-only)
-- Dump: %TEMP%\\tagora-time-staging-schema-2026-07-13.sql (NOT in Git)
--
-- Purpose:
--   Reproduce historical tables/functions missing CREATE TABLE in migrations
--   so local rebuilds can replay through SaaS 1B.1 foundation migrations.
--
-- Includes:
--   - 20 mandated historical tables (excludes public.test)
--   - dependency tables required by LANGUAGE sql historical functions:
--       horodateur_exceptions, horodateur_current_state, horodateur_shifts
--   - additive column upgrades on public.horodateur_events to match staging
--     (event_time and related columns used by recompute helpers)
--
-- Rules:
--   - schema-only, no data/seeds/secrets
--   - excludes public.test
--   - no organization_id on mandated business tables
--   - deferred FKs to objects created by later migrations:
--       gps_base_events_base_id_fkey -> gps_bases
--       horodateur_punch_challenges_punch_zone_id_fkey -> horodateur_punch_zones
--   - OWNER/GRANT/POLICY from remote dump intentionally omitted for local safety
-- ============================================================

-- >>> ENUM types (idempotent via DO blocks)

DO $$ BEGIN
  CREATE TYPE "public"."horodateur_actor_role" AS ENUM (
    'employe',
    'direction',
    'systeme'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."horodateur_event_status" AS ENUM (
    'normal',
    'en_attente',
    'approuve',
    'refuse'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."horodateur_exception_status" AS ENUM (
    'en_attente',
    'approuve',
    'refuse',
    'modifie'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."horodateur_exception_type" AS ENUM (
    'outside_schedule',
    'direction_manual_correction',
    'shift_too_long',
    'incoherent_pause',
    'incoherent_dinner',
    'invalid_sequence',
    'missing_punch_adjustment',
    'desktop_punch_phone_unavailable'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."horodateur_shift_status" AS ENUM (
    'ouvert',
    'ferme',
    'en_attente',
    'valide'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."horodateur_source_kind" AS ENUM (
    'employe',
    'direction',
    'automatique',
    'qr'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."horodateur_state_kind" AS ENUM (
    'hors_quart',
    'en_quart',
    'en_pause',
    'en_diner',
    'termine'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- >>> TABLES (mandated + function dependencies)

CREATE TABLE IF NOT EXISTS "public"."account_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "requested_role" "text",
    "requested_permissions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "assigned_role" "text",
    "assigned_permissions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "last_error" "text",
    "audit_log" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "full_name" "text",
    "company" "text",
    "portal_source" "text",
    "message" "text",
    "review_note" "text",
    "invited_user_id" "uuid",
    "review_lock_token" "uuid",
    "review_started_at" timestamp with time zone,
    CONSTRAINT "account_requests_assigned_role_check" CHECK ((("assigned_role" IS NULL) OR ("assigned_role" = ANY (ARRAY['employe'::"text", 'direction'::"text"])))),
    CONSTRAINT "account_requests_company_check" CHECK (("company" = ANY (ARRAY['oliem_solutions'::"text", 'titan_produits_industriels'::"text"]))),
    CONSTRAINT "account_requests_portal_source_check" CHECK (("portal_source" = ANY (ARRAY['employe'::"text", 'direction'::"text"]))),
    CONSTRAINT "account_requests_requested_role_check" CHECK (("requested_role" = ANY (ARRAY['employe'::"text", 'direction'::"text"]))),
    CONSTRAINT "account_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'invited'::"text", 'active'::"text", 'refused'::"text", 'error'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."vehicules" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nom" "text",
    "plaque" "text",
    "description" "text",
    "actif" boolean DEFAULT true,
    "notes" "text"
);

CREATE TABLE IF NOT EXISTS "public"."remorques" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nom" "text",
    "plaque" "text",
    "description" "text",
    "actif" boolean DEFAULT true,
    "notes" "text"
);

CREATE TABLE IF NOT EXISTS "public"."chauffeurs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nom" "text",
    "telephone" "text",
    "courriel" "text",
    "actif" boolean DEFAULT true,
    "notes" "text",
    "vehicule_id" bigint,
    "remorque_id" bigint,
    "numero_permis" "text",
    "classe_permis" "text",
    "expiration_permis" "date",
    "restrictions_permis" "text",
    "photo_permis_recto_url" "text",
    "photo_permis_verso_url" "text",
    "taux_horaire" numeric,
    "cout_km" numeric,
    "cout_fixe" numeric,
    "taux_base_titan" numeric,
    "auth_user_id" "uuid",
    "primary_company" "text",
    "can_work_for_oliem_solutions" boolean DEFAULT true NOT NULL,
    "can_work_for_titan_produits_industriels" boolean DEFAULT false NOT NULL,
    "social_benefits_percent" numeric(5,2) DEFAULT 15 NOT NULL,
    "titan_billable" boolean DEFAULT false NOT NULL,
    "schedule_start" time without time zone,
    "schedule_end" time without time zone,
    "planned_daily_hours" numeric(5,2),
    "planned_weekly_hours" numeric(5,2),
    "scheduled_work_days" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "pause_minutes" integer DEFAULT 15 NOT NULL,
    "expected_breaks_count" integer DEFAULT 0 NOT NULL,
    "break_1_label" "text",
    "break_1_minutes" integer,
    "break_1_paid" boolean DEFAULT true NOT NULL,
    "break_2_label" "text",
    "break_2_minutes" integer,
    "break_2_paid" boolean DEFAULT true NOT NULL,
    "break_3_label" "text",
    "break_3_minutes" integer,
    "break_3_paid" boolean DEFAULT true NOT NULL,
    "break_am_enabled" boolean DEFAULT false NOT NULL,
    "break_am_time" time without time zone,
    "break_am_minutes" integer,
    "break_am_paid" boolean DEFAULT true NOT NULL,
    "lunch_enabled" boolean DEFAULT false NOT NULL,
    "lunch_time" time without time zone,
    "lunch_minutes" integer,
    "lunch_paid" boolean DEFAULT false NOT NULL,
    "break_pm_enabled" boolean DEFAULT false NOT NULL,
    "break_pm_time" time without time zone,
    "break_pm_minutes" integer,
    "break_pm_paid" boolean DEFAULT true NOT NULL,
    "sms_alert_depart_terrain" boolean DEFAULT true NOT NULL,
    "sms_alert_arrivee_terrain" boolean DEFAULT true NOT NULL,
    "sms_alert_sortie" boolean DEFAULT true NOT NULL,
    "sms_alert_retour" boolean DEFAULT true NOT NULL,
    "sms_alert_pause_debut" boolean DEFAULT true NOT NULL,
    "sms_alert_pause_fin" boolean DEFAULT true NOT NULL,
    "sms_alert_dinner_debut" boolean DEFAULT true NOT NULL,
    "sms_alert_dinner_fin" boolean DEFAULT true NOT NULL,
    "sms_alert_quart_debut" boolean DEFAULT true NOT NULL,
    "sms_alert_quart_fin" boolean DEFAULT true NOT NULL,
    "alert_email_enabled" boolean DEFAULT true NOT NULL,
    "alert_sms_enabled" boolean DEFAULT true NOT NULL,
    "is_direction_alert_recipient" boolean DEFAULT false NOT NULL,
    "primary_department" "text",
    "secondary_departments" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "can_deliver" boolean DEFAULT false NOT NULL,
    "default_weekly_hours" numeric,
    "schedule_active" boolean DEFAULT true NOT NULL,
    "primary_location" "text",
    "secondary_locations" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "usual_schedule" "jsonb",
    "weekly_schedule_config" "jsonb",
    "fonctions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "fonction_autre" "text",
    "account_invited_at" timestamp with time zone,
    "account_invited_by_user_id" "uuid",
    "account_invited_by_name" "text",
    "account_invitation_status" "text",
    "account_invitation_error" "text",
    CONSTRAINT "chauffeurs_primary_company_check" CHECK (("primary_company" = ANY (ARRAY['oliem_solutions'::"text", 'titan_produits_industriels'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."dossiers" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nom" "text",
    "client" "text",
    "description" "text",
    "user_id" "uuid",
    "nb_photos" bigint DEFAULT '0'::bigint,
    "nb_notes" bigint DEFAULT '0'::bigint,
    "nb_fichiers" bigint DEFAULT '0'::bigint,
    "statut" "text" DEFAULT 'Nouveau'::"text"
);

CREATE TABLE IF NOT EXISTS "public"."notes_dossier" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dossier_id" bigint,
    "contenu" "text",
    "user_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."photos_dossier" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dossier_id" bigint,
    "image_url" "text",
    "user_id" "uuid",
    "type_media" "text",
    "proof_type" "text",
    "proof_name" "text",
    "linked_record_type" "text",
    "linked_record_id" bigint
);

CREATE TABLE IF NOT EXISTS "public"."sorties_terrain" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vehicule" "text",
    "client" "text",
    "dossier" "text",
    "km_depart" "text",
    "km_arrivee" "text",
    "notes" "text",
    "statut" "text",
    "user_id" "uuid",
    "heure_depart" time without time zone,
    "heure_retour" time without time zone,
    "temps_total" "text",
    "dossier_id" bigint,
    "livraison_id" bigint,
    "chauffeur_id" bigint,
    "vehicule_id" bigint,
    "remorque_id" bigint,
    "date_sortie" "date",
    "km_retour" integer,
    "km_total" integer,
    "refacturer_a_titan" boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS "public"."livraisons_planifiees" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dossier_id" bigint,
    "client" "text",
    "adresse" "text",
    "date_livraison" "date",
    "heure_prevue" "text",
    "chauffeur" "text",
    "vehicule" "text",
    "ordre_arret" bigint,
    "statut" "text" DEFAULT 'planifiee+3+'::"text",
    "note_direction" "text",
    "heure_depart_reelle" timestamp with time zone,
    "heure_arrivee_reelle" timestamp with time zone,
    "heure_livree" timestamp with time zone,
    "notification_client_envoyee" boolean DEFAULT false,
    "client_email" "text",
    "client_tel" "text",
    "user_id" "uuid",
    "livreur_user_id" "uuid",
    "km_depart" double precision,
    "km_arrivee" double precision,
    "temps_total" "text",
    "preuve_photo_url" "text",
    "signature_client_url" "text",
    "commentaire_livreur" "text",
    "chauffeur_id" bigint,
    "vehicule_id" bigint,
    "livraisons_planifiees" bigint,
    "remorque_id" bigint,
    "type_operation" "text",
    "ville" "text",
    "code_postal" "text",
    "province" "text",
    "latitude" double precision,
    "longitude" double precision,
    "note_chauffeur" "text",
    "commentaire_operationnel" "text",
    "client_phone" "text",
    "postal_code" "text",
    "contact_name" "text",
    "contact_phone_primary" "text",
    "contact_phone_primary_ext" "text",
    "contact_phone_secondary" "text",
    "contact_phone_secondary_ext" "text",
    "company_context" "text" NOT NULL,
    "created_by_name" "text",
    "created_by_user_id" "uuid",
    "scheduled_by_user_id" "uuid",
    "scheduled_by_name" "text",
    "updated_by_user_id" "uuid",
    "updated_by_name" "text",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "item_location" "text",
    "pickup_address" "text",
    "payment_status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "payment_balance_due" numeric(10,2) DEFAULT 0 NOT NULL,
    "payment_method" "text",
    "payment_note" "text",
    "payment_confirmed_at" timestamp with time zone,
    "payment_confirmed_by_user_id" "uuid",
    "payment_confirmed_by_name" "text",
    CONSTRAINT "livraisons_planifiees_company_context_check" CHECK (("company_context" = ANY (ARRAY['oliem_solutions'::"text", 'titan_produits_industriels'::"text"]))),
    CONSTRAINT "livraisons_planifiees_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['paid'::"text", 'balance_due'::"text", 'confirmed_on_delivery'::"text"]))),
    CONSTRAINT "livraisons_planifiees_type_operation_check" CHECK ((("type_operation" IS NULL) OR ("type_operation" = ANY (ARRAY['livraison_client'::"text", 'ramassage_client'::"text"]))))
);

CREATE TABLE IF NOT EXISTS "public"."temps_titan" (
    "id" bigint NOT NULL,
    "employe_id" bigint,
    "date_travail" "date",
    "heure_debut" time without time zone,
    "heure_fin" time without time zone,
    "duree_totale" "text",
    "type_travail" "text",
    "notes" "text",
    "ajoute_manuellement" boolean DEFAULT true,
    "cree_par_direction" boolean DEFAULT true,
    "taux_refacture" numeric,
    "montant_total" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "salaire_horaire_base" numeric,
    "benefice_marginal_horaire" numeric,
    "taux_total_titan" numeric,
    "montant_salaire" numeric,
    "montant_benefice" numeric,
    "salaire_horaire" numeric,
    "montant_total_titan" numeric,
    "total_benefice" numeric,
    "total_salaire" numeric,
    "total_titan" numeric,
    "date_facture_titan" "date",
    "duree_heures" numeric,
    "employe_nom" "text",
    "livraison" "text",
    "marge_h" numeric,
    "refacturee_a_titan" boolean DEFAULT true,
    "reference_facture_titan" "text",
    "statut_paiement_titan" "text",
    "taux_refacture_h" numeric,
    "taux_salaire_h" numeric,
    "taux_total_h" numeric
);

CREATE TABLE IF NOT EXISTS "public"."delivery_day_closures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "closure_date" "date" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    CONSTRAINT "delivery_day_closures_reason_check" CHECK (("reason" = ANY (ARRAY['journee_complete'::"text", 'tempete'::"text", 'manque_chauffeur'::"text", 'conge'::"text", 'inventaire'::"text", 'surcharge'::"text", 'entretien_flotte'::"text", 'autre'::"text"]))),
    CONSTRAINT "delivery_day_closures_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."department_coverage_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "department" "text" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "end_time" time without time zone DEFAULT '17:00:00'::time without time zone NOT NULL,
    "min_employees" integer DEFAULT 0 NOT NULL,
    "min_hours" numeric DEFAULT 0 NOT NULL,
    "requirement_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "department_coverage_requirements_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7))),
    CONSTRAINT "department_coverage_requirements_min_employees_check" CHECK (("min_employees" >= 0)),
    CONSTRAINT "department_coverage_requirements_min_hours_check" CHECK (("min_hours" >= (0)::numeric)),
    CONSTRAINT "department_coverage_requirements_requirement_source_check" CHECK (("requirement_source" = ANY (ARRAY['manual'::"text", 'delivery_based'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."employee_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" bigint NOT NULL,
    "department" "text" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "planned_hours" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location" "text",
    CONSTRAINT "employee_schedules_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'confirmed'::"text", 'cancelled'::"text", 'absent'::"text", 'completed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."employee_usual_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" bigint NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "department" "text",
    "location" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_usual_schedules_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7)))
);

CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "module" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "text",
    "status" "text" DEFAULT 'nouveau'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."gps_base_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "chauffeur_id" bigint,
    "company_context" "text" NOT NULL,
    "gps_position_id" "uuid",
    "base_id" "uuid",
    "event_type" "text" NOT NULL,
    "event_label" "text",
    "latitude" numeric(9,6) NOT NULL,
    "longitude" numeric(9,6) NOT NULL,
    "distance_m" numeric(10,2),
    "rayon_metres" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "gps_base_events_company_context_check" CHECK (("company_context" = ANY (ARRAY['oliem_solutions'::"text", 'titan_produits_industriels'::"text"]))),
    CONSTRAINT "gps_base_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['gps_base_entered'::"text", 'gps_base_exited'::"text", 'gps_base_arrived'::"text", 'gps_base_returned'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."horodateur" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."horodateur_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" bigint NOT NULL,
    "shift_id" "uuid",
    "source_event_id" "uuid" NOT NULL,
    "exception_type" "public"."horodateur_exception_type" NOT NULL,
    "reason_label" "text" NOT NULL,
    "details" "text",
    "impact_minutes" integer DEFAULT 0 NOT NULL,
    "status" "public"."horodateur_exception_status" DEFAULT 'en_attente'::"public"."horodateur_exception_status" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "requested_by_user_id" "uuid",
    "reviewed_at" timestamp with time zone,
    "reviewed_by_user_id" "uuid",
    "review_note" "text",
    "approved_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "direction_reminder_email_notified_at" timestamp with time zone,
    "direction_reminder_sms_notified_at" timestamp with time zone,
    "direction_email_notified_at" timestamp with time zone,
    "direction_sms_notified_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "public"."horodateur_current_state" (
    "employee_id" bigint NOT NULL,
    "current_state" "public"."horodateur_state_kind" DEFAULT 'hors_quart'::"public"."horodateur_state_kind" NOT NULL,
    "last_event_id" "uuid",
    "last_event_type" "text",
    "last_event_at" timestamp with time zone,
    "company_context" "text",
    "has_open_exception" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "horodateur_current_state_company_context_check" CHECK ((("company_context" IS NULL) OR ("company_context" = ANY (ARRAY['oliem_solutions'::"text", 'titan_produits_industriels'::"text"]))))
);

CREATE TABLE IF NOT EXISTS "public"."horodateur_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" bigint NOT NULL,
    "work_date" "date" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "company_context" "text" NOT NULL,
    "shift_start_at" timestamp with time zone,
    "shift_end_at" timestamp with time zone,
    "gross_minutes" integer DEFAULT 0 NOT NULL,
    "paid_break_minutes" integer DEFAULT 0 NOT NULL,
    "unpaid_break_minutes" integer DEFAULT 0 NOT NULL,
    "unpaid_lunch_minutes" integer DEFAULT 0 NOT NULL,
    "worked_minutes" integer DEFAULT 0 NOT NULL,
    "payable_minutes" integer DEFAULT 0 NOT NULL,
    "approved_exception_minutes" integer DEFAULT 0 NOT NULL,
    "pending_exception_minutes" integer DEFAULT 0 NOT NULL,
    "anomalies_count" integer DEFAULT 0 NOT NULL,
    "status" "public"."horodateur_shift_status" DEFAULT 'ouvert'::"public"."horodateur_shift_status" NOT NULL,
    "last_recomputed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "horodateur_shifts_company_context_check" CHECK (("company_context" = ANY (ARRAY['oliem_solutions'::"text", 'titan_produits_industriels'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."horodateur_punch_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" bigint NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "initiated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "confirmed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "company_context" "text",
    "note_desktop" "text",
    "approval_note" "text",
    "result_event_id" "uuid",
    "gps_latitude" numeric,
    "gps_longitude" numeric,
    "gps_accuracy_meters" numeric,
    "gps_validated" boolean,
    "zone_key" "text",
    "punch_zone_id" "uuid",
    "error_reason" "text",
    "confirmed_by_device" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "company_key" "text",
    "location_key" "text",
    "note" "text",
    CONSTRAINT "horodateur_punch_challenges_action_check" CHECK (("action" = ANY (ARRAY['punch_in'::"text", 'punch_out'::"text"]))),
    CONSTRAINT "horodateur_punch_challenges_company_context_check" CHECK ((("company_context" IS NULL) OR ("company_context" = ANY (ARRAY['oliem_solutions'::"text", 'titan_produits_industriels'::"text"])))),
    CONSTRAINT "horodateur_punch_challenges_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'confirmed'::"text", 'expired'::"text", 'cancelled'::"text", 'failed'::"text", 'approval_pending'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."remorque_unavailabilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "remorque_id" bigint NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    CONSTRAINT "chk_remorque_unavailabilities_time_range" CHECK (("start_at" < "end_at")),
    CONSTRAINT "remorque_unavailabilities_reason_check" CHECK (("reason" = ANY (ARRAY['entretien'::"text", 'brise'::"text", 'deja_occupe'::"text", 'inspection'::"text", 'reservation_interne'::"text", 'tempete'::"text", 'conge'::"text", 'inventaire'::"text", 'surcharge'::"text", 'autre'::"text"]))),
    CONSTRAINT "remorque_unavailabilities_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."vehicule_unavailabilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicule_id" bigint NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    CONSTRAINT "chk_vehicule_unavailabilities_time_range" CHECK (("start_at" < "end_at")),
    CONSTRAINT "vehicule_unavailabilities_reason_check" CHECK (("reason" = ANY (ARRAY['entretien'::"text", 'brise'::"text", 'deja_occupe'::"text", 'inspection'::"text", 'reservation_interne'::"text", 'tempete'::"text", 'conge'::"text", 'inventaire'::"text", 'surcharge'::"text", 'autre'::"text"]))),
    CONSTRAINT "vehicule_unavailabilities_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text"])))
);


-- >>> Additive upgrade of horodateur_events (created earlier by 20260408_190000)
-- Staging dump is the source of truth for columns used by historical recompute SQL.

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "user_id" "uuid" NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "event_type" "text" NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "event_time" timestamp with time zone DEFAULT "now"() NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "note" "text";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "source_module" "text" DEFAULT 'horodateur'::"text";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT "now"() NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "employee_id" bigint NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "actor_user_id" "uuid";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "work_date" "date";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "week_start_date" "date";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "actor_role" "public"."horodateur_actor_role" DEFAULT 'employe'::"public"."horodateur_actor_role" NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "source_kind" "public"."horodateur_source_kind" DEFAULT 'employe'::"public"."horodateur_source_kind" NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "status" "public"."horodateur_event_status" DEFAULT 'normal'::"public"."horodateur_event_status" NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "requires_approval" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "exception_code" "public"."horodateur_exception_type";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "approved_by" "uuid";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "rejected_by" "uuid";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "rejected_at" timestamp with time zone;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "approval_note" "text";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "related_event_id" "uuid";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "is_manual_correction" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "occurred_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"());

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "notes" "text";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "company_context" "text";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "punch_source" "text";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "punch_zone_key" "text";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "punch_zone_id" "uuid";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "zone_validated" boolean;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "gps_latitude" numeric;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "gps_longitude" numeric;

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "work_company_key" "text";

ALTER TABLE "public"."horodateur_events" ADD COLUMN IF NOT EXISTS "employer_company_key" "text";


-- >>> SEQUENCES


-- >>> TABLE CONSTRAINTS AND DEFAULTS

ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."chauffeurs"
    ADD CONSTRAINT "chauffeurs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."delivery_day_closures"
    ADD CONSTRAINT "delivery_day_closures_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."department_coverage_requirements"
    ADD CONSTRAINT "department_coverage_requirements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."dossiers"
    ADD CONSTRAINT "dossiers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."employee_schedules"
    ADD CONSTRAINT "employee_schedules_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."employee_usual_schedules"
    ADD CONSTRAINT "employee_usual_schedules_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."gps_base_events"
    ADD CONSTRAINT "gps_base_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."horodateur_current_state"
    ADD CONSTRAINT "horodateur_current_state_pkey" PRIMARY KEY ("employee_id");

ALTER TABLE ONLY "public"."horodateur_exceptions"
    ADD CONSTRAINT "horodateur_exceptions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."horodateur_exceptions"
    ADD CONSTRAINT "horodateur_exceptions_source_event_key" UNIQUE ("source_event_id");

ALTER TABLE ONLY "public"."horodateur"
    ADD CONSTRAINT "horodateur_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."horodateur_punch_challenges"
    ADD CONSTRAINT "horodateur_punch_challenges_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."horodateur_shifts"
    ADD CONSTRAINT "horodateur_shifts_employee_work_date_key" UNIQUE ("employee_id", "work_date");

ALTER TABLE ONLY "public"."horodateur_shifts"
    ADD CONSTRAINT "horodateur_shifts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."livraisons_planifiees"
    ADD CONSTRAINT "livraisons_planifiees_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."notes_dossier"
    ADD CONSTRAINT "notes_dossier_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."photos_dossier"
    ADD CONSTRAINT "photos_dossier_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."remorque_unavailabilities"
    ADD CONSTRAINT "remorque_unavailabilities_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."remorques"
    ADD CONSTRAINT "remorques_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."sorties_terrain"
    ADD CONSTRAINT "sorties_terrain_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."temps_titan"
    ADD CONSTRAINT "temps_titan_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."vehicule_unavailabilities"
    ADD CONSTRAINT "vehicule_unavailabilities_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."vehicules"
    ADD CONSTRAINT "vehicules_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."chauffeurs"
    ADD CONSTRAINT "chauffeurs_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."delivery_day_closures"
    ADD CONSTRAINT "delivery_day_closures_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."delivery_day_closures"
    ADD CONSTRAINT "delivery_day_closures_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."employee_schedules"
    ADD CONSTRAINT "employee_schedules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."chauffeurs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."employee_usual_schedules"
    ADD CONSTRAINT "employee_usual_schedules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."chauffeurs"("id") ON DELETE CASCADE;

-- deferred FK (target created later): gps_base_events_base_id_fkey

ALTER TABLE ONLY "public"."gps_base_events"
    ADD CONSTRAINT "gps_base_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."horodateur_current_state"
    ADD CONSTRAINT "horodateur_current_state_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."chauffeurs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."horodateur_current_state"
    ADD CONSTRAINT "horodateur_current_state_last_event_id_fkey" FOREIGN KEY ("last_event_id") REFERENCES "public"."horodateur_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."horodateur_exceptions"
    ADD CONSTRAINT "horodateur_exceptions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."chauffeurs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."horodateur_exceptions"
    ADD CONSTRAINT "horodateur_exceptions_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."horodateur_exceptions"
    ADD CONSTRAINT "horodateur_exceptions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."horodateur_exceptions"
    ADD CONSTRAINT "horodateur_exceptions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."horodateur_shifts"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."horodateur_exceptions"
    ADD CONSTRAINT "horodateur_exceptions_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "public"."horodateur_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."horodateur_punch_challenges"
    ADD CONSTRAINT "horodateur_punch_challenges_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."horodateur_punch_challenges"
    ADD CONSTRAINT "horodateur_punch_challenges_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."chauffeurs"("id") ON DELETE CASCADE;

-- deferred FK (target created later): horodateur_punch_challenges_punch_zone_id_fkey

ALTER TABLE ONLY "public"."horodateur_punch_challenges"
    ADD CONSTRAINT "horodateur_punch_challenges_result_event_id_fkey" FOREIGN KEY ("result_event_id") REFERENCES "public"."horodateur_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."horodateur_shifts"
    ADD CONSTRAINT "horodateur_shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."chauffeurs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."livraisons_planifiees"
    ADD CONSTRAINT "livraisons_planifiees_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."livraisons_planifiees"
    ADD CONSTRAINT "livraisons_planifiees_payment_confirmed_by_user_id_fkey" FOREIGN KEY ("payment_confirmed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."livraisons_planifiees"
    ADD CONSTRAINT "livraisons_planifiees_scheduled_by_user_id_fkey" FOREIGN KEY ("scheduled_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."livraisons_planifiees"
    ADD CONSTRAINT "livraisons_planifiees_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."remorque_unavailabilities"
    ADD CONSTRAINT "remorque_unavailabilities_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."remorque_unavailabilities"
    ADD CONSTRAINT "remorque_unavailabilities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."remorque_unavailabilities"
    ADD CONSTRAINT "remorque_unavailabilities_remorque_id_fkey" FOREIGN KEY ("remorque_id") REFERENCES "public"."remorques"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."sorties_terrain"
    ADD CONSTRAINT "sorties_terrain_chauffeur_id_fkey" FOREIGN KEY ("chauffeur_id") REFERENCES "public"."chauffeurs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."sorties_terrain"
    ADD CONSTRAINT "sorties_terrain_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons_planifiees"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."sorties_terrain"
    ADD CONSTRAINT "sorties_terrain_remorque_id_fkey" FOREIGN KEY ("remorque_id") REFERENCES "public"."remorques"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."sorties_terrain"
    ADD CONSTRAINT "sorties_terrain_vehicule_id_fkey" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."temps_titan"
    ADD CONSTRAINT "temps_titan_employe_id_fkey" FOREIGN KEY ("employe_id") REFERENCES "public"."chauffeurs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."vehicule_unavailabilities"
    ADD CONSTRAINT "vehicule_unavailabilities_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."vehicule_unavailabilities"
    ADD CONSTRAINT "vehicule_unavailabilities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."vehicule_unavailabilities"
    ADD CONSTRAINT "vehicule_unavailabilities_vehicule_id_fkey" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE RESTRICT;


-- >>> INDEXES

CREATE UNIQUE INDEX IF NOT EXISTS "idx_chauffeurs_auth_user_id" ON "public"."chauffeurs" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_chauffeurs_direction_alert_recipient" ON "public"."chauffeurs" USING "btree" ("is_direction_alert_recipient") WHERE ("is_direction_alert_recipient" = true);

CREATE INDEX IF NOT EXISTS "idx_chauffeurs_primary_company" ON "public"."chauffeurs" USING "btree" ("primary_company");

CREATE INDEX IF NOT EXISTS "idx_chauffeurs_telephone" ON "public"."chauffeurs" USING "btree" ("telephone") WHERE ("telephone" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_delivery_day_closures_date" ON "public"."delivery_day_closures" USING "btree" ("closure_date");

CREATE INDEX IF NOT EXISTS "idx_delivery_day_closures_status" ON "public"."delivery_day_closures" USING "btree" ("status");

CREATE INDEX IF NOT EXISTS "idx_employee_schedules_date_department" ON "public"."employee_schedules" USING "btree" ("scheduled_date", "department");

CREATE INDEX IF NOT EXISTS "idx_employee_schedules_employee_date" ON "public"."employee_schedules" USING "btree" ("employee_id", "scheduled_date");

CREATE INDEX IF NOT EXISTS "idx_employee_usual_schedules_employee_day" ON "public"."employee_usual_schedules" USING "btree" ("employee_id", "day_of_week");

CREATE INDEX IF NOT EXISTS "idx_gps_base_events_base_date" ON "public"."gps_base_events" USING "btree" ("base_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_gps_base_events_chauffeur_date" ON "public"."gps_base_events" USING "btree" ("chauffeur_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_gps_base_events_company_date" ON "public"."gps_base_events" USING "btree" ("company_context", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_gps_base_events_occurred_at" ON "public"."gps_base_events" USING "btree" ("occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_gps_base_events_position_id" ON "public"."gps_base_events" USING "btree" ("gps_position_id");

CREATE INDEX IF NOT EXISTS "idx_gps_base_events_type_date" ON "public"."gps_base_events" USING "btree" ("event_type", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_gps_base_events_user_date" ON "public"."gps_base_events" USING "btree" ("user_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_current_state_exception" ON "public"."horodateur_current_state" USING "btree" ("has_open_exception", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_current_state_kind" ON "public"."horodateur_current_state" USING "btree" ("current_state", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_events_employee_occurred_at" ON "public"."horodateur_events" USING "btree" ("employee_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_events_employee_work_date" ON "public"."horodateur_events" USING "btree" ("employee_id", "work_date" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_events_pending" ON "public"."horodateur_events" USING "btree" ("employee_id", "event_time" DESC) WHERE ("status" = 'en_attente'::"public"."horodateur_event_status");

CREATE INDEX IF NOT EXISTS "idx_horodateur_events_status" ON "public"."horodateur_events" USING "btree" ("status", "event_time" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_events_status_occurred_at" ON "public"."horodateur_events" USING "btree" ("status", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_events_user_occurred_at_legacy" ON "public"."horodateur_events" USING "btree" ("user_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_events_week_start" ON "public"."horodateur_events" USING "btree" ("employee_id", "week_start_date" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_events_work_date" ON "public"."horodateur_events" USING "btree" ("employee_id", "work_date" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_exceptions_direction_reminder_email_notified" ON "public"."horodateur_exceptions" USING "btree" ("direction_reminder_email_notified_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_exceptions_direction_reminder_sms_notified" ON "public"."horodateur_exceptions" USING "btree" ("direction_reminder_sms_notified_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_exceptions_employee_status" ON "public"."horodateur_exceptions" USING "btree" ("employee_id", "status", "requested_at");

CREATE INDEX IF NOT EXISTS "idx_horodateur_exceptions_status_requested" ON "public"."horodateur_exceptions" USING "btree" ("status", "requested_at");

CREATE INDEX IF NOT EXISTS "idx_horodateur_punch_challenges_auth_user_id" ON "public"."horodateur_punch_challenges" USING "btree" ("auth_user_id");

CREATE INDEX IF NOT EXISTS "idx_horodateur_punch_challenges_company_key" ON "public"."horodateur_punch_challenges" USING "btree" ("company_key");

CREATE INDEX IF NOT EXISTS "idx_horodateur_punch_challenges_employee_id" ON "public"."horodateur_punch_challenges" USING "btree" ("employee_id");

CREATE INDEX IF NOT EXISTS "idx_horodateur_punch_challenges_employee_pending" ON "public"."horodateur_punch_challenges" USING "btree" ("employee_id", "status") WHERE ("status" = 'pending'::"text");

CREATE INDEX IF NOT EXISTS "idx_horodateur_punch_challenges_expires" ON "public"."horodateur_punch_challenges" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"text");

CREATE INDEX IF NOT EXISTS "idx_horodateur_punch_challenges_expires_at" ON "public"."horodateur_punch_challenges" USING "btree" ("expires_at");

CREATE INDEX IF NOT EXISTS "idx_horodateur_punch_challenges_location_key" ON "public"."horodateur_punch_challenges" USING "btree" ("location_key");

CREATE INDEX IF NOT EXISTS "idx_horodateur_punch_challenges_status" ON "public"."horodateur_punch_challenges" USING "btree" ("status");

CREATE INDEX IF NOT EXISTS "idx_horodateur_punch_challenges_token_hash" ON "public"."horodateur_punch_challenges" USING "btree" ("token_hash");

CREATE INDEX IF NOT EXISTS "idx_horodateur_shifts_employee_week" ON "public"."horodateur_shifts" USING "btree" ("employee_id", "week_start_date" DESC);

CREATE INDEX IF NOT EXISTS "idx_horodateur_shifts_status_work_date" ON "public"."horodateur_shifts" USING "btree" ("status", "work_date" DESC);

CREATE INDEX IF NOT EXISTS "idx_livraisons_planifiees_company_context" ON "public"."livraisons_planifiees" USING "btree" ("company_context", "date_livraison" DESC);

CREATE INDEX IF NOT EXISTS "idx_livraisons_planifiees_created_at" ON "public"."livraisons_planifiees" USING "btree" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_livraisons_planifiees_created_by_user_id" ON "public"."livraisons_planifiees" USING "btree" ("created_by_user_id");

CREATE INDEX IF NOT EXISTS "idx_livraisons_planifiees_updated_by_user_id" ON "public"."livraisons_planifiees" USING "btree" ("updated_by_user_id");

CREATE INDEX IF NOT EXISTS "idx_photos_dossier_linked_record" ON "public"."photos_dossier" USING "btree" ("linked_record_type", "linked_record_id");

CREATE INDEX IF NOT EXISTS "idx_photos_dossier_proof_type" ON "public"."photos_dossier" USING "btree" ("proof_type");

CREATE INDEX IF NOT EXISTS "idx_remorque_unavailabilities_remorque_period" ON "public"."remorque_unavailabilities" USING "btree" ("remorque_id", "start_at", "end_at");

CREATE INDEX IF NOT EXISTS "idx_remorque_unavailabilities_start_at" ON "public"."remorque_unavailabilities" USING "btree" ("start_at");

CREATE INDEX IF NOT EXISTS "idx_remorque_unavailabilities_status" ON "public"."remorque_unavailabilities" USING "btree" ("status");

CREATE INDEX IF NOT EXISTS "idx_vehicule_unavailabilities_start_at" ON "public"."vehicule_unavailabilities" USING "btree" ("start_at");

CREATE INDEX IF NOT EXISTS "idx_vehicule_unavailabilities_status" ON "public"."vehicule_unavailabilities" USING "btree" ("status");

CREATE INDEX IF NOT EXISTS "idx_vehicule_unavailabilities_vehicule_period" ON "public"."vehicule_unavailabilities" USING "btree" ("vehicule_id", "start_at", "end_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_account_requests_pending_email" ON "public"."account_requests" USING "btree" ("lower"("email")) WHERE ("status" = 'pending'::"text");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_delivery_day_closures_active_date" ON "public"."delivery_day_closures" USING "btree" ("closure_date") WHERE ("status" = 'active'::"text");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_department_coverage_requirements_department_day_source" ON "public"."department_coverage_requirements" USING "btree" ("department", "day_of_week", "requirement_source");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_gps_base_events_exact_position_event" ON "public"."gps_base_events" USING "btree" ("gps_position_id", "base_id", "event_type");


-- >>> FUNCTIONS

CREATE OR REPLACE FUNCTION "public"."approve_horodateur_exception"("p_exception_id" "uuid", "p_reviewed_by_user_id" "uuid" DEFAULT NULL::"uuid", "p_review_note" "text" DEFAULT NULL::"text", "p_approved_minutes" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_source_event_id uuid;
begin
  update public.horodateur_exceptions
  set
    status = 'approuve'::public.horodateur_exception_status,
    reviewed_at = timezone('utc'::text, now()),
    reviewed_by_user_id = p_reviewed_by_user_id,
    review_note = p_review_note,
    approved_minutes = coalesce(p_approved_minutes, approved_minutes, impact_minutes)
  where id = p_exception_id
  returning source_event_id into v_source_event_id;

  if v_source_event_id is not null then
    update public.horodateur_events
    set
      status = 'approuve'::public.horodateur_event_status,
      approved_by = p_reviewed_by_user_id,
      approved_at = timezone('utc'::text, now()),
      approval_note = p_review_note,
      requires_approval = false
    where id = v_source_event_id;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."reject_horodateur_exception"("p_exception_id" "uuid", "p_reviewed_by_user_id" "uuid" DEFAULT NULL::"uuid", "p_review_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_source_event_id uuid;
begin
  update public.horodateur_exceptions
  set
    status = 'refuse'::public.horodateur_exception_status,
    reviewed_at = timezone('utc'::text, now()),
    reviewed_by_user_id = p_reviewed_by_user_id,
    review_note = p_review_note,
    approved_minutes = null
  where id = p_exception_id
  returning source_event_id into v_source_event_id;

  if v_source_event_id is not null then
    update public.horodateur_events
    set
      status = 'refuse'::public.horodateur_event_status,
      rejected_by = p_reviewed_by_user_id,
      rejected_at = timezone('utc'::text, now()),
      approval_note = p_review_note,
      requires_approval = false
    where id = v_source_event_id;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."recompute_horodateur_current_state"("p_employee_id" bigint) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
with latest as (
  select
    e.id as last_event_id,
    e.event_type as last_event_type,
    e.event_time as last_event_at,
    case
      when e.event_type in ('clock_in', 'shift_start') then 'en_quart'::public.horodateur_state_kind
      when e.event_type in ('break_start', 'pause_start') then 'en_pause'::public.horodateur_state_kind
      when e.event_type in ('break_end', 'pause_end') then 'en_quart'::public.horodateur_state_kind
      when e.event_type in ('lunch_start', 'diner_start', 'dinner_start') then 'en_diner'::public.horodateur_state_kind
      when e.event_type in ('lunch_end', 'diner_end', 'dinner_end') then 'en_quart'::public.horodateur_state_kind
      when e.event_type in ('clock_out', 'shift_end') then 'termine'::public.horodateur_state_kind
      else 'hors_quart'::public.horodateur_state_kind
    end as current_state
  from public.horodateur_events e
  where e.employee_id = p_employee_id
    and e.status <> 'refuse'::public.horodateur_event_status
  order by e.event_time desc nulls last, e.created_at desc nulls last, e.id desc
  limit 1
),
open_exception as (
  select exists (
    select 1
    from public.horodateur_exceptions x
    where x.employee_id = p_employee_id
      and x.status = 'en_attente'::public.horodateur_exception_status
  ) as has_open_exception
),
deleted as (
  delete from public.horodateur_current_state
  where employee_id = p_employee_id
    and not exists (select 1 from latest)
  returning 1
),
upserted as (
  insert into public.horodateur_current_state (
    employee_id,
    current_state,
    last_event_id,
    last_event_type,
    last_event_at,
    has_open_exception
  )
  select
    p_employee_id,
    l.current_state,
    l.last_event_id,
    l.last_event_type,
    l.last_event_at,
    o.has_open_exception
  from latest l
  cross join open_exception o
  on conflict (employee_id)
  do update set
    current_state = excluded.current_state,
    last_event_id = excluded.last_event_id,
    last_event_type = excluded.last_event_type,
    last_event_at = excluded.last_event_at,
    has_open_exception = excluded.has_open_exception,
    updated_at = timezone('utc'::text, now())
  returning 1
)
select null::void;
$$;

CREATE OR REPLACE FUNCTION "public"."recompute_horodateur_shift"("p_employee_id" bigint, "p_work_date" "date") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
with existing_shift as (
  select id
  from public.horodateur_shifts
  where employee_id = p_employee_id
    and work_date = p_work_date
  limit 1
),
base_events as (
  select
    e.id,
    e.employee_id,
    coalesce(e.work_date, (e.event_time at time zone 'utc')::date) as work_date,
    e.event_type,
    e.event_time
  from public.horodateur_events e
  where e.employee_id = p_employee_id
    and coalesce(e.work_date, (e.event_time at time zone 'utc')::date) = p_work_date
    and e.status <> 'refuse'::public.horodateur_event_status
),
agg as (
  select
    employee_id,
    work_date,
    date_trunc('week', work_date::timestamp)::date as week_start_date,
    min(event_time) filter (
      where event_type in ('clock_in', 'shift_start')
    ) as shift_start_at,
    max(event_time) filter (
      where event_type in ('clock_out', 'shift_end')
    ) as shift_end_at
  from base_events
  group by employee_id, work_date
),
break_starts as (
  select
    id,
    event_time,
    row_number() over (order by event_time, id) as rn
  from base_events
  where event_type in ('break_start', 'pause_start')
),
break_ends as (
  select
    id,
    event_time,
    row_number() over (order by event_time, id) as rn
  from base_events
  where event_type in ('break_end', 'pause_end')
),
break_pairs as (
  select
    greatest(0, floor(extract(epoch from (e.event_time - s.event_time)) / 60))::int as minutes
  from break_starts s
  join break_ends e
    on e.rn = s.rn
   and e.event_time > s.event_time
),
lunch_starts as (
  select
    id,
    event_time,
    row_number() over (order by event_time, id) as rn
  from base_events
  where event_type in ('lunch_start', 'diner_start', 'dinner_start')
),
lunch_ends as (
  select
    id,
    event_time,
    row_number() over (order by event_time, id) as rn
  from base_events
  where event_type in ('lunch_end', 'diner_end', 'dinner_end')
),
lunch_pairs as (
  select
    greatest(0, floor(extract(epoch from (e.event_time - s.event_time)) / 60))::int as minutes
  from lunch_starts s
  join lunch_ends e
    on e.rn = s.rn
   and e.event_time > s.event_time
),
stats as (
  select
    coalesce((select sum(minutes) from break_pairs), 0)::int as unpaid_break_minutes,
    coalesce((select sum(minutes) from lunch_pairs), 0)::int as unpaid_lunch_minutes,
    (
      abs((select count(*) from break_starts) - (select count(*) from break_ends))
      + abs((select count(*) from lunch_starts) - (select count(*) from lunch_ends))
    )::int as pair_anomalies
),
exception_stats as (
  select
    coalesce(sum(
      case
        when x.status = 'approuve'::public.horodateur_exception_status
        then coalesce(x.approved_minutes, x.impact_minutes, 0)
        else 0
      end
    ), 0)::int as approved_exception_minutes,
    coalesce(sum(
      case
        when x.status = 'en_attente'::public.horodateur_exception_status
        then coalesce(x.impact_minutes, 0)
        else 0
      end
    ), 0)::int as pending_exception_minutes
  from public.horodateur_exceptions x
  where x.employee_id = p_employee_id
    and x.shift_id in (select id from existing_shift)
),
deleted as (
  delete from public.horodateur_shifts s
  where s.employee_id = p_employee_id
    and s.work_date = p_work_date
    and not exists (select 1 from agg)
  returning 1
),
upserted as (
  insert into public.horodateur_shifts (
    employee_id,
    work_date,
    week_start_date,
    company_context,
    shift_start_at,
    shift_end_at,
    gross_minutes,
    paid_break_minutes,
    unpaid_break_minutes,
    unpaid_lunch_minutes,
    worked_minutes,
    payable_minutes,
    approved_exception_minutes,
    pending_exception_minutes,
    anomalies_count,
    status,
    last_recomputed_at
  )
  select
    a.employee_id,
    a.work_date,
    a.week_start_date,
    'oliem_solutions',
    a.shift_start_at,
    a.shift_end_at,
    case
      when a.shift_start_at is not null and a.shift_end_at is not null
      then greatest(0, floor(extract(epoch from (a.shift_end_at - a.shift_start_at)) / 60))::int
      else 0
    end as gross_minutes,
    0,
    s.unpaid_break_minutes,
    s.unpaid_lunch_minutes,
    case
      when a.shift_start_at is not null and a.shift_end_at is not null
      then greatest(
        0,
        floor(extract(epoch from (a.shift_end_at - a.shift_start_at)) / 60)::int
        - s.unpaid_break_minutes
        - s.unpaid_lunch_minutes
      )
      else 0
    end as worked_minutes,
    case
      when a.shift_start_at is not null and a.shift_end_at is not null
      then greatest(
        0,
        floor(extract(epoch from (a.shift_end_at - a.shift_start_at)) / 60)::int
        - s.unpaid_break_minutes
        - s.unpaid_lunch_minutes
      )
      else 0
    end as payable_minutes,
    ex.approved_exception_minutes,
    ex.pending_exception_minutes,
    (
      s.pair_anomalies
      + case
          when a.shift_start_at is not null and a.shift_end_at is null then 1
          else 0
        end
    )::int as anomalies_count,
    case
      when a.shift_start_at is not null and a.shift_end_at is null
      then 'ouvert'::public.horodateur_shift_status
      else 'ferme'::public.horodateur_shift_status
    end as status,
    timezone('utc'::text, now())
  from agg a
  cross join stats s
  cross join exception_stats ex
  on conflict (employee_id, work_date)
  do update set
    week_start_date = excluded.week_start_date,
    company_context = excluded.company_context,
    shift_start_at = excluded.shift_start_at,
    shift_end_at = excluded.shift_end_at,
    gross_minutes = excluded.gross_minutes,
    paid_break_minutes = excluded.paid_break_minutes,
    unpaid_break_minutes = excluded.unpaid_break_minutes,
    unpaid_lunch_minutes = excluded.unpaid_lunch_minutes,
    worked_minutes = excluded.worked_minutes,
    payable_minutes = excluded.payable_minutes,
    approved_exception_minutes = excluded.approved_exception_minutes,
    pending_exception_minutes = excluded.pending_exception_minutes,
    anomalies_count = excluded.anomalies_count,
    status = excluded.status,
    last_recomputed_at = excluded.last_recomputed_at,
    updated_at = timezone('utc'::text, now())
  returning 1
)
select null::void;
$$;

CREATE OR REPLACE FUNCTION "public"."trg_recompute_horodateur_current_state"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_horodateur_current_state(old.employee_id);
    return old;
  end if;

  perform public.recompute_horodateur_current_state(new.employee_id);

  if tg_op = 'UPDATE' and old.employee_id is distinct from new.employee_id then
    perform public.recompute_horodateur_current_state(old.employee_id);
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."trg_recompute_horodateur_shift"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_horodateur_shift(
      old.employee_id,
      coalesce(old.work_date, (old.event_time at time zone 'utc')::date)
    );
    return old;
  end if;

  perform public.recompute_horodateur_shift(
    new.employee_id,
    coalesce(new.work_date, (new.event_time at time zone 'utc')::date)
  );

  if tg_op = 'UPDATE' then
    if old.employee_id is distinct from new.employee_id
       or coalesce(old.work_date, (old.event_time at time zone 'utc')::date)
          is distinct from
          coalesce(new.work_date, (new.event_time at time zone 'utc')::date) then
      perform public.recompute_horodateur_shift(
        old.employee_id,
        coalesce(old.work_date, (old.event_time at time zone 'utc')::date)
      );
    end if;
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."trg_recompute_horodateur_shift_from_exception"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    if old.employee_id is not null and old.shift_id is not null then
      perform public.recompute_horodateur_shift(
        old.employee_id,
        (
          select s.work_date
          from public.horodateur_shifts s
          where s.id = old.shift_id
        )
      );
    end if;

    return old;
  end if;

  if new.employee_id is not null and new.shift_id is not null then
    perform public.recompute_horodateur_shift(
      new.employee_id,
      (
        select s.work_date
        from public.horodateur_shifts s
        where s.id = new.shift_id
      )
    );
  end if;

  if tg_op = 'UPDATE'
     and old.shift_id is distinct from new.shift_id
     and old.employee_id is not null
     and old.shift_id is not null then
    perform public.recompute_horodateur_shift(
      old.employee_id,
      (
        select s.work_date
        from public.horodateur_shifts s
        where s.id = old.shift_id
      )
    );
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."horodateur_punch_challenges_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_updated_at_gps_bases"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_admin_improvement_notification_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."validate_livraison_planning_guardrails"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_date date;
  v_time time;
  v_start_at timestamptz;
  v_end_at timestamptz;

  v_new_status text;
  v_new_is_cancelled boolean;

  v_old_status text;
  v_old_is_cancelled boolean;
  v_plan_unchanged boolean;
begin
  -- 1) NEW uniquement (safe pour INSERT)
  v_new_status := lower(coalesce(trim(new.statut), ''));
  v_new_is_cancelled := v_new_status in (
    'annulee', 'annulÃ©e', 'annule', 'annulÃ©', 'cancelled', 'canceled'
  );

  -- 2) Si NEW est annulÃ©: bypass
  if v_new_is_cancelled then
    return new;
  end if;

  -- 3) Si date_livraison est null: bypass
  if new.date_livraison is null then
    return new;
  end if;

  -- 4) Lecture OLD uniquement en UPDATE
  if tg_op = 'UPDATE' then
    v_old_status := lower(coalesce(trim(old.statut), ''));
    v_old_is_cancelled := v_old_status in (
      'annulee', 'annulÃ©e', 'annule', 'annulÃ©', 'cancelled', 'canceled'
    );

    v_plan_unchanged :=
      new.date_livraison is not distinct from old.date_livraison
      and new.heure_prevue is not distinct from old.heure_prevue
      and new.vehicule_id is not distinct from old.vehicule_id
      and new.remorque_id is not distinct from old.remorque_id;

    -- Skip si progression opÃ©rationnelle sans changement planning
    -- et sans rÃ©activation d'un statut annulÃ©
    if v_plan_unchanged and not (v_old_is_cancelled and not v_new_is_cancelled) then
      return new;
    end if;
  end if;

  -- FenÃªtre de validation
  if new.heure_prevue is null or trim(new.heure_prevue::text) = '' then
    v_time := time '08:00';
  else
    v_time := (new.heure_prevue::text)::time;
  end if;

  v_date := new.date_livraison::date;
  v_start_at := (v_date::timestamp + v_time) AT TIME ZONE 'America/Toronto';
  v_end_at := v_start_at + interval '60 minutes';

  -- JournÃ©e fermÃ©e active
  if exists (
    select 1
    from public.delivery_day_closures ddc
    where ddc.closure_date = v_date
      and ddc.status = 'active'
  ) then
    raise exception 'JOURNEE_LIVRAISON_FERMEE: Cette journÃ©e de livraison est fermÃ©e.';
  end if;

  -- VÃ©hicule indisponible actif (si vehicule_id non null)
  if new.vehicule_id is not null then
    if exists (
      select 1
      from public.vehicule_unavailabilities vu
      where vu.vehicule_id = new.vehicule_id
        and vu.status = 'active'
        and v_start_at < vu.end_at
        and v_end_at > vu.start_at
    ) then
      raise exception 'VEHICULE_INDISPONIBLE: Ce vÃ©hicule est indisponible pour cette plage horaire.';
    end if;
  end if;

  -- Remorque indisponible active (si remorque_id non null)
  if new.remorque_id is not null then
    if exists (
      select 1
      from public.remorque_unavailabilities ru
      where ru.remorque_id = new.remorque_id
        and ru.status = 'active'
        and v_start_at < ru.end_at
        and v_end_at > ru.start_at
    ) then
      raise exception 'REMORQUE_INDISPONIBLE: Cette remorque est indisponible pour cette plage horaire.';
    end if;
  end if;

  return new;
end;
$$;


-- >>> TRIGGERS


-- >>> END historical schema bootstrap
