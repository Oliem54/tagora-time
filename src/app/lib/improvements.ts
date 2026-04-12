export const IMPROVEMENT_MODULE_OPTIONS = [
  "Horodateur",
  "Terrain",
  "Livraisons",
  "Documents",
  "Ressources",
  "Tableau de bord",
  "Approbation",
  "Authentification",
  "Generalites",
] as const;

export const IMPROVEMENT_PRIORITY_OPTIONS = [
  "Faible",
  "Moyenne",
  "Elevee",
] as const;

export const IMPROVEMENT_DEFAULT_STATUS = "nouveau" as const;

export type ImprovementModule = (typeof IMPROVEMENT_MODULE_OPTIONS)[number];
export type ImprovementPriority = (typeof IMPROVEMENT_PRIORITY_OPTIONS)[number];
export type ImprovementStatus = typeof IMPROVEMENT_DEFAULT_STATUS;
