/**
 * Libellés gestionnaire pour les cartes « Indicateurs techniques » (phase 2).
 * Les identifiants correspondent à alert-center-phase2.server.ts — pas de logique métier ici.
 */

export type QueueRowForUi = {
  id: string;
  label: string;
  description: string;
  href: string;
  count: number;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  source?: "journal" | "derived" | "phase1";
};

export type TechnicalDetailLine = { label: string; value: string };

export type HumanTechnicalIndicator = {
  title: string;
  summary: string;
  probableCause: string;
  recommendedAction: string;
  badgePriority: string;
  badgeSource: string;
  badgeAggregation: string;
  technicalDetails: TechnicalDetailLine[];
};

const PRIORITY_HUMAN: Record<QueueRowForUi["priority"], string> = {
  critical: "Priorité critique",
  high: "Priorité élevée",
  medium: "Priorité modérée",
  low: "Priorité faible",
};

function sourceBadge(row: QueueRowForUi): string {
  if (row.source === "journal") return "Source : journal unifié";
  if (row.source === "derived") return "Source : suivi automatisé";
  return "Source : système";
}

function aggregationBadge(row: QueueRowForUi): string {
  if (row.source === "journal") return "Détail par entrée";
  if (row.source === "derived") return "Données regroupées";
  return "Vue synthétique";
}

function baseTechnicalRows(row: QueueRowForUi): TechnicalDetailLine[] {
  return [
    { label: "Identifiant interne de la file", value: row.id },
    { label: "Libellé référence (serveur)", value: row.label },
    { label: "Description référence (serveur)", value: row.description },
    { label: "Catégorie système", value: row.category },
    { label: "Code priorité", value: row.priority },
    { label: "Type de source", value: row.source ?? "—" },
  ];
}

export function humanizeTechnicalIndicator(row: QueueRowForUi): HumanTechnicalIndicator {
  const n = row.count;
  const badgePriority = PRIORITY_HUMAN[row.priority] ?? row.priority;
  const badgeSource = sourceBadge(row);
  const badgeAggregation = aggregationBadge(row);
  let title = row.label;
  let summary = "";
  let probableCause = "";
  let recommendedAction = "";
  let extraTech: TechnicalDetailLine[] = [];

  switch (row.id) {
    case "echecs-notifications":
      title = "Échecs SMS / courriel";
      summary =
        n === 0
          ? "Aucun échec récent sur les canaux d’envoi."
          : `${n} échec${n > 1 ? "s" : ""} d’envoi détecté${n > 1 ? "s" : ""} sur les notifications SMS ou courriel.`;
      probableCause =
        "Souvent : fournisseur indisponible, authentification SMS/courriel ou paramètres d’envoi à ajuster.";
      recommendedAction =
        "Ouvrir le journal filtré sur les échecs pour traiter chaque ligne, ou relancer après vérification configuration.";
      extraTech = [
        {
          label: "Historique des envois",
          value: "Courriel : app_alert_deliveries · SMS : sms_alerts_log",
        },
        { label: "Période d’analyse (référence système)", value: "90 jours glissants" },
      ];
      break;
    case "notes-mentions-erreur":
      title = "Erreurs d’envoi — notes internes";
      summary =
        n === 0
          ? "Aucune mention interne en erreur d’envoi récente."
          : `${n} mention${n > 1 ? "s" : ""} interne${n > 1 ? "s" : ""} en erreur d’envoi courriel.`;
      probableCause = "Résolution DNS, boîte expéditrice, pièces jointes ou limite fournisseur.";
      recommendedAction =
        "Ouvrir la vue détail du journal pour identifier l’employé ou le contexte, puis corriger ou archiver.";
      extraTech = [
        { label: "Table principal", value: "internal_mentions (statut erreur_email)" },
        { label: "Période", value: "90 jours glissants" },
      ];
      break;
    case "journal-app-alerts":
      title = "Alertes ouvertes à traiter";
      summary =
        n === 0
          ? "Aucune entrée ouverte ou en échec dans le journal."
          : `${n} alerte${n > 1 ? "s" : ""} ouverte${n > 1 ? "s" : ""} ou en échec technique dans le journal central.`;
      probableCause =
        "Flux métiers (notifications, horodateur, livraisons…) ayant remonté un incident ou une action requise.";
      recommendedAction =
        "Parcourir le journal ci-dessous, traiter ou archiver selon la gravité.";
      extraTech = [{ label: "Table", value: "app_alerts" }];
      break;
    case "depenses-employe":
      title = "Dépenses employé à traiter";
      summary =
        n === 0
          ? "Aucune dépense en attente de traitement."
          : `${n} demande${n > 1 ? "s" : ""} de dépense à valider ou suivre.`;
      probableCause = "Dépôt récent par un employé ou étape de validation manquante.";
      recommendedAction = "Ouvrir le module ressources / effectifs pour valider ou demander un complément.";
      extraTech = [{ label: "Table (réf.)", value: "employe_depenses" }];
      break;
    case "incidents-livraison":
      title = "Incidents livraison / dommages";
      summary =
        n === 0
          ? "Aucun incident ouvert sur les livraisons."
          : `${n} incident${n > 1 ? "s" : ""} ouvert${n > 1 ? "s" : ""} lié${n > 1 ? "s" : ""} aux livraisons.`;
      probableCause = "Sinistre, retard majeur ou litige client signalé sur une livraison.";
      recommendedAction = "Ouvrir la vue livraisons pour consulter l’incident et mettre à jour le statut.";
      extraTech = [{ label: "Table (réf.)", value: "delivery_incidents" }];
      break;
    case "horodateur-exceptions":
      title = "Exceptions horodateur";
      summary =
        n === 0
          ? "Aucune exception horodateur en attente."
          : `${n} exception${n > 1 ? "s" : ""} à traiter dans le module horodateur.`;
      probableCause = "Pointage manquant, conflit d’horaire ou règle métier non respectée.";
      recommendedAction = "Ouvrir le module horodateur pour analyser et résoudre chaque exception.";
      extraTech = [{ label: "Table (réf.)", value: "horodateur_exceptions" }];
      break;
    case "employee-leave-return-soon":
      title = "Retours congés à vérifier";
      summary =
        n === 0
          ? "Aucun retour employé à prévoir dans la fenêtre de suivi."
          : `${n} employé${n > 1 ? "s" : ""} avec retour prévu (fenêtre ~3 jours) à confirmer.`;
      probableCause = "Fin de congé proche selon le planning enregistré.";
      recommendedAction = "Vérifier avec l’équipe les retours effectifs et ajuster les fiches si besoin.";
      extraTech = [{ label: "Source", value: "employee_leave_periods" }];
      break;
    case "livraisons-retard":
      title = "Livraisons en retard";
      summary =
        n === 0
          ? "Aucune livraison signalée en retard."
          : `${n} livraison${n > 1 ? "s" : ""} avec statut retard à surveiller.`;
      probableCause = "Retard de chargement, route ou problème opérationnel sur le terrain.";
      recommendedAction = "Ouvrir la liste des livraisons pour prioriser les retards et informer les clients si nécessaire.";
      extraTech = [{ label: "Source (réf.)", value: "livraisons_planifiees (statut en_retard)" }];
      break;
    case "titan-validation":
      title = "Refacturation intercompagnies";
      summary =
        n === 0
          ? "Aucune ligne en attente de validation pour la refacturation intercompagnies."
          : `${n} élément${n > 1 ? "s" : ""} à valider pour la refacturation intercompagnies.`;
      probableCause = "Données horaires ou taux nécessitant validation avant prise en compte.";
      recommendedAction =
        "Ouvrir le module Suivi des heures pour valider ou corriger les lignes en attente.";
      extraTech = [{ label: "Source (réf.)", value: "temps_titan (si présente en base)" }];
      break;
    default:
      summary =
        n === 0
          ? "Aucun élément actif pour cette file."
          : `${n} élément${n > 1 ? "s" : ""} à suivre dans cette file.`;
      probableCause = "Variable selon le type d’alerte ; consulter le détail technique si besoin.";
      recommendedAction = "Utiliser le bouton Ouvrir pour accéder au module concerné.";
  }

  return {
    title,
    summary,
    probableCause,
    recommendedAction,
    badgePriority,
    badgeSource,
    badgeAggregation,
    technicalDetails: [
      { label: "Origine du signal", value: badgeSource },
      { label: "Type de vue (comptage)", value: badgeAggregation },
      ...extraTech,
      ...baseTechnicalRows(row),
    ],
  };
}
