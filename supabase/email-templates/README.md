# Templates courriels TAGORA Time

Ces fichiers sont la source de verite locale des courriels de securite relies au compte.

## Ou le template est defini

Le flux actif continue de passer par Supabase Auth :

- `src/app/reinitialiser-mot-de-passe/page.tsx`
- `src/app/api/employees/[id]/account-security/route.ts`
- `src/app/api/account-requests/[id]/route.ts`

Les courriels ne sont pas generes par l application Next.js. Ils sont envoyes par Supabase Auth, avec le lien securise natif (`{{ .ConfirmationURL }}`).

Les templates doivent donc etre personnalises dans la configuration Auth du projet Supabase :

- via le dashboard Supabase, section `Authentication > Email Templates`
- ou via la Management API `PATCH /v1/projects/{ref}/config/auth`

## Fichiers

- `manifest.json` : mapping entre les templates locaux et les champs Supabase a synchroniser
- `*.html` : version HTML finale a pousser dans Supabase
- `*.txt` : version texte editoriale de reference

## Important sur la version texte

La documentation officielle Supabase expose la personnalisation HTML des templates Auth via le dashboard et la Management API. Les fichiers texte sont donc conserves ici comme version editoriale propre et reutilisable, mais ils ne sont pas envoyes automatiquement par Supabase tant que cette capacite n est pas exposee par votre configuration cible.

## Synchroniser vers Supabase

1. Creer un token de management Supabase avec les permissions `auth_config_write` et `project_admin_write`.
2. Ajouter `SUPABASE_MANAGEMENT_ACCESS_TOKEN=...` dans `.env.local`.
3. Lancer :

```bash
npm run sync:auth-email-templates
```

Mode sans ecriture :

```bash
node scripts/sync-supabase-auth-email-templates.mjs --dry-run
```

## Tester le rendu final

1. Synchroniser les templates.
2. Dans Supabase, verifier `Authentication > Email Templates`.
3. Depuis l application, declencher :
   - une reinitialisation depuis `src/app/reinitialiser-mot-de-passe/page.tsx`
   - une invitation depuis `/direction/demandes-comptes`
4. Verifier :
   - affichage du logo
   - sujet du courriel
   - CTA principal
   - lien de secours
   - bonne redirection du lien securise
