# TAGORA Time — SaaS 1B.1B H4-B2 — Organization identities execution (2026-07-16)

**Agent exécutant :** Martin
**Agent donneur :** Martin
**Projet :** TAGORA Time (`C:\dev\tagora-time`)
**Poste :** Maison
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`
**HEAD avant :** `f7d166dbe0f8f9d3771c11b67fb6fb112f2a87c0`
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`
**Staging :** `qokyobcvplzufshydhih`
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **57 % → 59 %** (H4-B2 GO = +2 pts)

**Décision méthode :** Option C — lot 2/3
**H4-B1 :** préservé (GO antérieur)

---

## 1. Migration forward-only

| Item | Valeur |
|------|--------|
| Fichier | `supabase/migrations/20260716221000_h4b2_organization_identities.sql` |
| Version | `20260716221000` |
| SHA-256 (LF) | `EFD8EC331BEBF8716CB3CB7D41E3BB4A48D4F470AE074E0AFAC0AC17817E881B` |
| Transaction | `BEGIN` … `COMMIT` |
| Originaux H4 / H4-B1 modifiés | **non** |
| Seed / backfill / memberships / invitations réels | **aucun** |

---

## 2. Objets créés (staging)

**Tables (vides) :** `organization_memberships`, `organization_invitations` — **0 ligne**.

**Fonction :** `public.enforce_organization_has_owner()`
- SECURITY INVOKER (`prosecdef=false`)
- `search_path=pg_catalog`
- `organization_id` **immuable** (`IS DISTINCT FROM` → `check_violation`)
- protection dernier owner actif (DELETE / demote / suspend / invited)
- verrou `public.organizations … FOR UPDATE`
- validation source via **`old.organization_id`**
- EXECUTE : service_role (+ owner postgres) ; pas PUBLIC / anon / authenticated

**Triggers (3) :**
`trg_organization_memberships_enforce_owner`,
`trg_organization_memberships_updated_at`,
`trg_organization_invitations_updated_at`

**Index :** 9 explicites + 2 PK

**FK (4) :** org memberships RESTRICT ; user memberships RESTRICT ; org invitations RESTRICT ; invited_by SET NULL

**RLS :** ENABLE + FORCE ; **policies = 0**

**Invitations :** `token_hash` only (≥32) ; aucun token brut

---

## 3. Validations

| Contrôle | Résultat |
|----------|----------|
| Prérequis H4-B1 | PASS |
| Reset local `127.0.0.1` | PASS — **94** migrations |
| Tests TX locaux (ROLLBACK) | PASS — auth local persistant = 0 |
| Tests ciblés + `test:ci` | PASS |
| Lint / build | PASS (0 erreur lint) |
| Application staging | `db query --linked -f` scoped |
| SQL staging | **COMMIT** |
| Preuve physique | **complète** |
| `migration repair 20260716221000 --status applied --linked` | **oui** |
| Autre version réparée | **non** |
| Six migrations originales H4 (`20260712220x00`) | **pending** |
| H5-F5 `20260425133500` | **pending** |

---

## 4. Protections

- H4-B1 inchangé (tables vides, RLS/FORCE)
- H4-B3 / platform_access* : **absents**
- Auth staging count inchangé (4)
- Tables métier / policies / grants : hash rows avant = après
- Feature non intégrée ; production intacte

| Objet | SHA-256 rows (avant=après) |
|-------|----------------------------|
| Protected objects | `EA23E784313B3FE311CEA391D0C055627D30D8DD889B59CCD309F190AEBBEF26` |
| Policies métier | `2F3D41A480FFDF5B8247FC06124B5C1FF70DC7BABD9FF37C06C40D5B35799E40` |
| Grants métier | `A55B442AA3BC7BAC69F7FD3F02518D14270B9D223D3BC143C8F078A2ABEC709C` |
| Auth count | `EE3626E5FF419C0FB85FEE549D6B1A2089370FDE4A1AAEFA773BD3C245F22E05` |

---

## 5. Rollback documentaire (ne pas exécuter)

Sous mandat Martin distinct, si memberships/invitations = 0 et H4-B3 absent :

1. DROP invitations → memberships
2. DROP FUNCTION `enforce_organization_has_owner`
3. Conserver H4-B1 intact
4. `migration repair 20260716221000 --status reverted --linked`

---

## 6. Verdict

**GO H4-B2 — IDENTITÉS ORGANISATIONNELLES APPLIQUÉES, IMMUTABLES ET VALIDÉES SUR STAGING**

Prochaine étape unique : **H4-B3** (platform_access + audit append-only) — mandat distinct.
