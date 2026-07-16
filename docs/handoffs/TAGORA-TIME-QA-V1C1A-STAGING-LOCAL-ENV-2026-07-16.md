# TAGORA Time — QA V1-C1A — Local staging environment switch (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Bureau  
**Branche :** `feature/sales-book-grants`  
**HEAD avant :** `31c3e43e0b50c1b81783f9596ab0811cd268afd3`  
**Staging :** `qokyobcvplzufshydhih`  
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **77 % → 77 %** (configuration locale uniquement — pas une preuve fonctionnelle)

---

## 1. Contexte

QA V1-C1 a été STOP sur :

**NO-GO QA V1-C1 — APPLICATION STAGING NON DISPONIBLE**

Cause : `.env.local` du bureau pointait vers la production (`qcgvzdlfsxybrmloijpt`), sans anon staging utilisable pour démarrer l’app sans risque.

Cette passe corrige **uniquement** l’environnement local.

---

## 2. Protection production

| Contrôle | Résultat |
|----------|----------|
| `git check-ignore -v .env.local` | ignoré (`.gitignore:34:.env*`) |
| Sauvegarde hors Git | `%TEMP%\tagora-time-env-production-backup-2026-07-16.txt` |
| SHA-256 sauvegarde | `E87736B79E56919BC4946826AA45959BA064DEC5A9BBCDD2EF0028BC73DF8E60` |
| Contenu affiché | **non** |
| Commit de `.env.local` | **non** |

---

## 3. Variables requises (noms uniquement)

Inspectées dans le runtime :

| Variable | Usage |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server + admin |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client / server (ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en secours) |
| `SUPABASE_SERVICE_ROLE_KEY` | **requise** — `createAdminSupabaseClient()` serveur |

---

## 4. Source staging autorisée

| Ordre | Source | Résultat |
|-------|--------|----------|
| 1 | Fichiers locaux `.env.staging.local` / preview | absents |
| 2 | Vercel local (`.vercel`) | absent |
| 3 | **API keys projet Supabase staging** (`npx supabase projects api-keys --project-ref qokyobcvplzufshydhih`) | **utilisée** |
| 4 | Coffre Martin | non requis |

Aucune clé lue depuis Git, logs, docs, captures ou un autre projet TAGORA.

---

## 5. `.env.local` staging

| Contrôle | Résultat |
|----------|----------|
| Project ref | `qokyobcvplzufshydhih` |
| Production présente | **non** |
| Anon présente | oui |
| Service role présente | oui (runtime serveur l’exige) |
| Clés ≠ sauvegarde production | oui |
| Mélange staging/production | **non** |
| Visible dans `git status` | **non** |

---

## 6. Smoke test technique

| Contrôle | Résultat |
|----------|----------|
| `npm run dev` | Ready (Next.js 16, Environments: `.env.local`) |
| `/connexion` | HTTP 200 |
| `/employe/login` | HTTP 200 |
| `/direction/login` | HTTP 200 |
| Erreur schéma | non |
| Erreur variable manquante | non |
| Ref production dans pages | non |
| Connexion QA-USER-2 | **non effectuée** |
| Membership Employé | **non créé** |

Serveur arrêté après smoke.

---

## 7. Baseline tenant QA (lecture seule, inchangée)

| Agrégat | Valeur |
|---------|--------|
| organizations | 1 |
| memberships | 3 |
| invitations | 0 |
| platform_access | 0 |
| Auth users | 4 |
| Storage photos-dossiers | 0 |
| QA-USER-2 memberships | 0 |

Aucune donnée métier. Aucun objet Storage. Aucune modification Auth.

---

## 8. Preuve hors Git

`%TEMP%\tagora-time-qa-v1c1a-staging-env-proof-2026-07-16.txt`  
SHA-256 : `8DB28C991EA04B2FA06325488CFD1A340D76D1BC1AE13E10F201C00BFE318A9B`

---

## 9. Verdict

**GO QA V1-C1A — ENVIRONNEMENT LOCAL STAGING VALIDÉ, QA V1-C1 REPRENABLE**

**Avancement V1 : 77 % → 77 %**

Prochaine étape unique : **reprendre QA V1-C1** — **ne pas démarrer automatiquement**.

Conserver la sauvegarde production hors Git.  
Ne pas committer `.env.local`.  
Ne pas toucher la production.
