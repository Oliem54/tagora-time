# TAGORA Time — SaaS 1B.1B H5-E2A — Durcissement helpers d’autorisation (2026-07-15)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time uniquement (`C:\dev\tagora-time`)  
**Poste :** Maison  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `babc2beb565af89a969cb670a6bad062fc4b5fe9`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih`  
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`  
**Avancement V1 :** **51 %** (inchangé)

---

## 1. Objectif

Forward-only : durcir uniquement les cinq helpers actifs :

| Fonction | Signatures |
|----------|------------|
| `public.current_app_role()` | `() → text` |
| `public.current_app_permissions()` | `() → text[]` |
| `public.is_direction_or_admin()` | `() → boolean` |
| `public.is_direction_user()` | `() → boolean` |
| `public.has_app_permission(text)` | `(p_permission text) → boolean` |

Contrats imposés :

- rôle = `auth.jwt() -> 'app_metadata' ->> 'role'` uniquement ;
- permissions = `auth.jwt() -> 'app_metadata' -> 'permissions'` uniquement ;
- **aucun** fallback `user_metadata` ;
- `SECURITY INVOKER` ; `SET search_path = pg_catalog` ;
- `REVOKE EXECUTE` à `PUBLIC` et `anon` ;
- `GRANT EXECUTE` à `authenticated` et `service_role` ;
- aucune policy, vue, table, donnée.

---

## 2. Migration

| Champ | Valeur |
|-------|--------|
| Fichier | `supabase/migrations/20260715130000_h5e2a_harden_authorization_helpers.sql` |
| Version | `20260715130000` |
| SHA-256 | `9816DAEE4FC0EB3610EFD9ADB1C293EA623AC6FF3F0443BF12A7EF60CB6F42DB` |

Migration historique modifiée : **aucune**.  
Policy / vue / H5-D2 : **inchangés**.

---

## 3. Baseline staging (avant)

Porte anon : **aucune** policy `anon`/`public` ne dépend des cinq helpers.  
`account_requests_insert_pending_public` n’utilise pas les helpers → révocation EXECUTE anon **autorisée**.

| Helper | SECURITY | search_path | Source claim | ACL EXECUTE |
|--------|----------|-------------|--------------|-------------|
| `current_app_role` | INVOKER | *(vide)* | `app_metadata.role` | PUBLIC, anon, authenticated, service_role |
| `current_app_permissions` | INVOKER | *(vide)* | **coalesce(app_metadata, user_metadata, [])** | PUBLIC, anon, authenticated, service_role |
| `has_app_permission` | INVOKER | *(vide)* | direction\|employe + permissions | idem |
| `is_direction_user` | INVOKER | *(vide)* | role = direction | idem |
| `is_direction_or_admin` | INVOKER | *(vide)* | coalesce(role in (direction,admin), false) | idem |

Snapshots hors Git :

| Fichier | SHA-256 |
|---------|---------|
| `%TEMP%\tagora-time-h5e2a-functions-before-2026-07-15.sql` | `6E9FB8B386E5182D5DDC754E7151F66375300520F0F2029B844C9F450D6F566E` |
| `%TEMP%\tagora-time-h5e2a-acl-before-2026-07-15.txt` | `A707A504AA2D8914D5EF9187DFCD472805E104B2FEAFE10AA1552C62D138DE41` |
| `%TEMP%\tagora-time-h5e2a-policy-hashes-before-2026-07-15.txt` | `063018C98960CB58AD0BA7893AACBFC670D60B0100E5FABBEE30B246F5A6066C` (contenu policies sha = `b1d6ba25…7979a`) |
| `%TEMP%\tagora-time-h5e2a-view-hash-before-2026-07-15.txt` | `E169517F38FE3C44BB9FBEB1FEB28DF7646C1D73B82FBA310872BDDD5EB79900` (contenu view sha = `9aff5841…4b30b7`) |

---

## 4. Après (contrat)

| Helper | Après |
|--------|-------|
| `current_app_role` | app_metadata only ; INVOKER ; `search_path=pg_catalog` |
| `current_app_permissions` | app_metadata only ; absent → `text[]` vide ; **user_metadata retiré** |
| `has_app_permission` | vérité métier préservée (direction \| employe) ; pas d’auto-admin |
| `is_direction_user` | inchangé sémantiquement |
| `is_direction_or_admin` | coalesce(in direction/admin, false) préservé |

ACL après :

| Rôle | EXECUTE |
|------|---------|
| PUBLIC | **révoqué** |
| anon | **révoqué** |
| authenticated | accordé |
| service_role | accordé |

---

## 5. Tests JWT synthétiques (jamais de JWT réel affiché)

Claims synthétiques :

- `app_metadata.role = employe`
- `app_metadata.permissions = ["terrain"]`
- `user_metadata.role = admin` *(doit être ignoré)*
- `user_metadata.permissions = ["commissions"]` *(doit être ignoré)*

Résultats attendus / validés :

| Contrôle | Attendu |
|----------|---------|
| Rôle effectif | `employe` (pas admin) |
| Permission `terrain` | présente |
| Permission `commissions` | **absente** (aucune élévation user_metadata) |
| Permissions absentes | `text[]` vide |
| `is_direction_or_admin` / `is_direction_user` | logique préservée |
| SECURITY DEFINER | aucun |
| anon EXECUTE direct | refusé |
| authenticated / service_role | EXECUTE OK |

---

## 6. Reset local

- Cible prouvée : `127.0.0.1` (API/DB Studio) ; aucun `--linked` durant reset ; aucune URL distante.
- Commande : `npx supabase db reset --local` — **PASS**.
- Migrations locales SQL : **89** (dont H5-E2A `20260715130000`).
- Helpers locaux : INVOKER ; `search_path=pg_catalog` ; ACL sans PUBLIC/anon ; `user_metadata` absent des defs.
- Validation JWT synthétique (ROLLBACK) : rôle `employe` ; `terrain` oui ; `commissions` non ; permissions absentes `{}` ; anon EXECUTE refusé ; authenticated / service_role OK.
- Seed : `supabase/seed.sql` (infra seed locale existante — aucun seed métier H5-E2A ajouté).

---

## 7. Staging

**Project ref confirmé :** `qokyobcvplzufshydhih` (● linked). Production `qcgvzdlfsxybrmloijpt` absente.

Méthode exécutée :

1. SQL isolé (corps migration + gates) dans `BEGIN` ;
2. validations helpers / ACL / hash policies / hash vue / anti-élévation user_metadata ;
3. **COMMIT** (portes vertes) ;
4. `npx supabase migration repair 20260715130000 --status applied --linked` **uniquement**.

Transaction staging : **COMMIT** (pas de ROLLBACK).  
SQL staging exécuté : oui.

Snapshots après :

| Fichier | SHA-256 fichier |
|---------|-----------------|
| `%TEMP%\tagora-time-h5e2a-functions-after-2026-07-15.sql` | `7C2CD2E270B46D6AC16814E04E89966BC81901CF91DC9F16BBB473EDBE840B61` |
| `%TEMP%\tagora-time-h5e2a-acl-after-2026-07-15.txt` | `D33590B15012376FA5511FC6BC21C108B75B1B42234BAFFA416E5F846B07908C` |
| `%TEMP%\tagora-time-h5e2a-policy-hashes-after-2026-07-15.txt` | `15FEA515A633F5BD92C445D840A56F5253228392CCEF7FD6C06F512FDE6B6550` |
| `%TEMP%\tagora-time-h5e2a-view-hash-after-2026-07-15.txt` | `116953C1A6312B7E2C5CCD85A1D12D2CDDDDDA9154CFE7EA8C2745C8D96047F7` |

Policies hash avant = après : `b1d6ba25c644b344e1816dc607f6ff999f23fb612062680f89fea74e6077979a`  
Vue hash avant = après : `9aff5841040669bf4acb3528ad997751064915b849f6358e7e6c6c24a64b30b7`

---

## 8. Historique après succès

| Classe | Statut |
|--------|--------|
| H5-A/B/C/D2 | inchangées (déjà applied) |
| H5-E2A `20260715130000` | **applied** (local + remote) |
| `20260429120000` / `20260429130000` | **demeurent pending** |
| H4 (`20260712220x00`) | pending = 6 |
| H1/H2/H3 | inchangées |

---

## 9. Limites / suite

- Policies fail-open Horodateur / chauffeurs / sorties **fermées en H5-E2C** — voir handoff E2C.
- H5-E2B (AR/TT), H5-E2D (vue/grants), H5-F, H4 : **protégés**.
- Aucune intégration `feature/sales-book-grants`.
- Production non touchée.
- Données métier : **aucune** modification.
- Prochaine étape : **H5-E2B** (mandat distinct).

---

## 10. Rollback

1. Restaurer définitions + ACL depuis snapshots TEMP avant (mandat séparé).
2. Ne **jamais** réintroduire `user_metadata` pour l’autorisation sans décision sécurité explicite.
3. `migration repair 20260715130000 --status reverted --linked` = history-only ; **ne restaure pas** les fonctions automatiquement.

---

## 11. Verdict

**GO H5-E2A — HELPERS D’AUTORISATION DURCIS ET VALIDÉS**

H5-E2C exécuté ensuite (lot suivant) — ne pas confondre avec un rejeu E2A.
