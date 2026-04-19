# Tagora Time

Application [Next.js](https://nextjs.org) (App Router) pour la gestion du temps, des livraisons, du terrain et de l’horodateur, avec backend [Supabase](https://supabase.com) (Auth, Postgres, RLS).

## Prérequis

- Node.js 20+ (recommandé)
- Compte Supabase et projet configuré
- Variables d’environnement (voir [`.env.example`](.env.example))

## Installation locale

```bash
npm install
cp .env.example .env.local
# Renseigner .env.local puis :
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build production |
| `npm run start` | Serveur après build |
| `npm run lint` | ESLint |
| `npm test` | Tests Vitest |
| `npm run sync:auth-email-templates` | Synchronise les templates email Supabase (voir `scripts/`) |

## Déploiement

1. **Build** : `npm run build` doit réussir (également vérifié en CI sur les PR).
2. **Variables** : reporter toutes les clés nécessaires depuis [`.env.example`](.env.example) vers la configuration de l’hébergeur (staging puis production).
3. **Supabase** : appliquer les migrations dans l’ordre sous [`supabase/migrations/`](supabase/migrations/) sur le projet cible (`supabase db push` ou pipeline SQL).
4. **URL canonique** : définir `NEXT_PUBLIC_APP_URL` sur l’URL publique (sans slash final) pour les liens dans les emails et les redirections.

### Vercel

- Le fichier [`vercel.json`](vercel.json) définit des tâches planifiées (crons) vers les routes internes horodateur.
- Définir `CRON_SECRET` dans le projet Vercel ; la même valeur peut être utilisée comme `HORODATEUR_REMINDER_SECRET` pour que les appels cron soient autorisés (voir routes sous `src/app/api/internal/horodateur/`).

### Autres hébergeurs

Planifier des requêtes **GET** (ou **POST** avec en-tête d’autorisation) vers :

- `/api/internal/horodateur/reminders`
- `/api/internal/horodateur/lateness-check`

avec `Authorization: Bearer <HORODATEUR_REMINDER_SECRET>` ou l’en-tête `x-horodateur-reminder-secret`.

## Base de données et sauvegardes

- Les schémas et politiques RLS sont versionnés dans [`supabase/migrations/`](supabase/migrations/).
- **Sauvegardes / PRA** : à traiter au niveau du projet Supabase (plans Pro, exports, réplication) et de votre politique interne — ce dépôt ne remplace pas une stratégie de backup documentée côté organisation.

## Observabilité

- **Sentry** (optionnel) : si `NEXT_PUBLIC_SENTRY_DSN` ou `SENTRY_DSN` est défini, l’SDK charge les erreurs côté client et serveur (voir `sentry.*.config.ts`).
- En production, évitez les journaux verbeux contenant des données personnelles dans la console navigateur.

## Conformité

- Des pages [Mentions légales](/mentions-legales) et [Confidentialité](/confidentialite) sont fournies comme base ; le contenu juridique doit être validé et adapté à votre structure avant mise en ligne.

## Dépannage (runbook rapide)

| Symptôme | Pistes |
|----------|--------|
| Auth / session | Vérifier `NEXT_PUBLIC_SUPABASE_*`, URL du site, cookies (HTTPS en prod). |
| Emails / SMS | `RESEND_*`, `TWILIO_*`, listes `DIRECTION_ALERT_*`. |
| Webhook SMS refusé | `SMS_WEBHOOK_TOKEN` requis en production ; en-tête `x-tagora-webhook-token`. |
| Rappels horodateur absents | Secret `HORODATEUR_REMINDER_SECRET`, cron actif, logs hébergeur. |
| Erreurs 5xx | Logs Vercel / hébergeur, Sentry si configuré. |

## Licence

Projet privé (`private: true`).
