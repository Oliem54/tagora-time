export const marketingNavigation = [
  { label: "Accueil", href: "/" },
  { label: "Logiciel", href: "/logiciel" },
  { label: "Etiquettes", href: "/etiquettes" },
  { label: "Contact", href: "/contact" },
] as const;

export const marketingConnectionLinks = {
  root: "/connexion",
  app: "https://app.tagora.ca",
  employe: "https://app.tagora.ca/employe",
  direction: "https://app.tagora.ca/direction",
  demoMailto: "mailto:contact@tagora.ca?subject=Demande%20de%20demo%20TAGORA",
  contactMailto: "mailto:contact@tagora.ca",
} as const;
