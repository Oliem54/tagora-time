# MFA par texto (Supabase Auth) — prérequis TAGORA Time

Ce document décrit la configuration attendue côté **Supabase** pour que la vérification en deux étapes par **SMS** fonctionne dans TAGORA Time.

## À activer dans Supabase

1. **MFA téléphone**  
   Dans le tableau de bord Supabase : Authentication → Settings → Multi-factor authentication.  
   Activer l’enrôlement et la vérification pour le facteur **Phone** (SMS).

2. **Fournisseur SMS**  
   Configurer un fournisseur SMS compatible GoTrue (Twilio, MessageBird, etc.) dans les paramètres Auth / SMS du projet.

3. **Numéros au format E.164**  
   L’application envoie des numéros normalisés (ex. `+15819912047`). Les numéros invalides sont refusés côté UI.

4. **Réception des SMS**  
   Vérifier que les texto ne sont pas bloqués par l’opérateur ou les filtres anti-spam sur les lignes de test.

## Comportement dans l’app si la config manque

Si l’API Supabase renvoie une erreur du type `mfa_phone_enroll_not_enabled`, `mfa_phone_verify_not_enabled` ou `phone_provider_disabled`, TAGORA Time affiche un message invitant à **contacter l’administrateur** plutôt qu’un message technique brut.

## Ce que le MFA SMS ne remplace pas

- Les **QR codes** affichés dans le module horodateur servent au **pointage sur place** (zone / emplacement), pas à l’authentification MFA direction.

## Courriel

Le courriel **n’est pas** utilisé comme canal principal de MFA pour direction/admin dans cette stratégie (risque si la boîte est compromise). Les notifications par courriel peuvent compléter le centre d’alertes selon la configuration métier.
