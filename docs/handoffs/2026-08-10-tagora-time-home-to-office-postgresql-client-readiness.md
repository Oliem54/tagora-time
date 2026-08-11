# TAGORA Time — Handoff maison vers bureau — readiness client PostgreSQL

Date : 2026-08-10

## 1. Projet

TAGORA Time uniquement.

## 2. Worktree maison

`C:\Dev\tagora-time-v1-tenant-company-scoping`

## 3. Branche source

`main`

## 4. Checkpoint source

`815ac4d49302ae597bbdcd4a15b76163063d4b56`

## 5. Installation locale maison réussie

- PostgreSQL 17.10
- Source officielle EDB
- Installation par `winget` (`PostgreSQL.PostgreSQL.17`)
- Composants clients seulement (`server`, `pgAdmin`, `stackbuilder` exclus)
- `psql` 17.10 disponible
- `pg_dump` 17.10 disponible
- Chemin : `C:\Program Files\PostgreSQL\17\bin\`
- Outils pas encore ajoutés au PATH permanent (validation effectuée via le chemin d’installation)

## 6. Sécurité

- Aucun serveur PostgreSQL 17 installé
- Aucun service PostgreSQL 17 créé ou démarré
- Aucun dossier de données PostgreSQL 17
- Aucune connexion PostgreSQL ou Supabase
- Aucune configuration de connexion
- Aucun secret exposé
- Aucune DB, migration, Staging ou Production touchée

## 7. Observation hors périmètre

- Un service PostgreSQL 18 préexistant a été détecté (`postgresql-x64-18`)
- Il n’a pas été créé, démarré, arrêté ou modifié
- Ne pas y toucher

## 8. Confirmations Martin

- Référence Production officielle : `qcgvzdlfsxybrmloijpt`
- Domaine Production : `PAS ENCORE ÉTABLI`
- Retour arrière obligatoire en cas d’anomalie critique : `OUI`

## 9. État des preuves Production

- Preuves fermées : `0/6`
- Aucune collecte Production commencée
- Aucune connexion Production encore autorisée

## 10. Information essentielle pour le bureau

- L’installation PostgreSQL 17 est locale à l’ordinateur de la maison
- Elle ne sera pas transférée par Git
- Le bureau doit d’abord synchroniser le dépôt
- Il devra ensuite vérifier localement `psql` et `pg_dump`
- Si les clients sont absents au bureau, une installation séparée avec un nouveau GO Martin sera nécessaire

## 11. Prochaine étape recommandée

`TAGORA_TIME_V1_OFFICE_SYNC_AFTER_POSTGRESQL_CLIENT_HANDOFF_GO_NOGO`

## 12. Après la synchronisation bureau

- Vérifier les outils PostgreSQL
- Ne pas connecter Production sans nouveau GO
- Ne pas commencer R2
- Poursuivre le chemin critique vers les six preuves Production
