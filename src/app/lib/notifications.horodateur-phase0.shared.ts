export type HorodateurEmployeeExceptionDecisionOutcome =
  | "approved"
  | "rejected"
  | "adjusted";

export function resolveHorodateurEmployeeDecisionCopy(
  outcome: HorodateurEmployeeExceptionDecisionOutcome
) {
  switch (outcome) {
    case "approved":
      return {
        emailSubject: "TAGORA Time — Mise à jour de vos heures",
        emailText: "Votre correction d'heure a été mise à jour.",
        emailHtml: "Votre correction d'heure a été mise à jour.",
        smsBody: "TAGORA Time : Votre correction d'heure a été mise à jour.",
      };
    case "adjusted":
      return {
        emailSubject: "TAGORA Time — Correction d'heure ajustée",
        emailText:
          "Votre correction d'heure a été ajustée. Vérifiez votre registre et parlez-en avec votre directeur au besoin.",
        emailHtml:
          "Votre correction d'heure a été ajustée. Vérifiez votre registre et parlez-en avec votre directeur au besoin.",
        smsBody:
          "TAGORA Time : Votre correction d'heure a été ajustée. Vérifiez votre registre et parlez-en avec votre directeur au besoin.",
      };
    case "rejected":
      return {
        emailSubject: "TAGORA Time — Vérification de vos heures",
        emailText:
          "Votre demande de correction n'a pas pu être appliquée automatiquement. Vérifiez vos heures et parlez-en avec votre directeur au besoin.",
        emailHtml:
          "Votre demande de correction n'a pas pu être appliquée automatiquement. Vérifiez vos heures et parlez-en avec votre directeur au besoin.",
        smsBody:
          "TAGORA Time : Votre demande de correction n'a pas pu être appliquée automatiquement. Vérifiez vos heures et parlez-en avec votre directeur au besoin.",
      };
  }
}
