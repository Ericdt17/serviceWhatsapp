# Uptime Kuma — monitoring du bot WhatsApp

Le bot expose un endpoint HTTP pour **Uptime Kuma** (ou tout autre sonde HTTP).

**Domaine public (recommandé)** : `https://bot-health.livsight.com/health`  
**Local VPS** : `http://127.0.0.1:3099/health`

---

## Curl — liens à utiliser

### Sur le VPS (SSH, bot déjà déployé)

```bash
curl -s http://127.0.0.1:3099/health | jq
```

Code HTTP seul :

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3099/health
```

→ `200` = WhatsApp **et** Core API OK · `503` = démarrage, déconnecté, ou auth API cassée

### Depuis Internet (après DNS + Nginx + SSL)

```bash
curl -s https://bot-health.livsight.com/health | jq
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://bot-health.livsight.com/health
```

---

## Endpoint

| | |
|---|---|
| **URL publique** | `https://bot-health.livsight.com/health` |
| **URL locale VPS** | `http://127.0.0.1:3099/health` |
| **Méthode** | `GET` |
| **OK** | HTTP **200** + `"ok": true` — WhatsApp connecté **et** Core API auth OK (mode core) |
| **KO** | HTTP **503** — démarrage, QR, WhatsApp déconnecté, **ou JWT Core API expiré / invalide** |

Exemple réponse (OK) :

```json
{
  "service": "whatsapp-bot-core",
  "ok": true,
  "ready": true,
  "whatsappState": "CONNECTED",
  "clientReady": true,
  "coreApiOk": true,
  "coreApiError": null,
  "uptimeSeconds": 3600,
  "timestamp": "2026-06-09T12:00:00.000Z"
}
```

Exemple réponse (WhatsApp OK mais API cassée — Uptime Kuma doit alerter) :

```json
{
  "service": "whatsapp-bot-core",
  "ok": false,
  "ready": false,
  "whatsappState": "CONNECTED",
  "clientReady": true,
  "coreApiOk": false,
  "coreApiError": "Core API auth failed (401): ...",
  "uptimeSeconds": 3600,
  "timestamp": "2026-06-09T12:00:00.000Z"
}
```

---

## Domaine `bot-health.livsight.com`

Le bot écoute en local (`127.0.0.1:3099`). Nginx fait le proxy HTTPS vers ce port.

### 1. DNS

| Type | Nom | Valeur |
|------|-----|--------|
| **A** | `bot-health` | **IP du bot VPS** (même machine que PM2 `whatsapp-bot-core`) |

### 2. Nginx sur le bot VPS

Exemple : [deploy/nginx-bot-health.conf.example](../deploy/nginx-bot-health.conf.example)

```bash
sudo cp /opt/livsight-whatsapp-core/wwebjs-bot/deploy/nginx-bot-health.conf.example \
  /etc/nginx/sites-available/bot-health.livsight.com
sudo ln -sf /etc/nginx/sites-available/bot-health.livsight.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bot-health.livsight.com
```

### 3. Vérifier

```bash
curl -s https://bot-health.livsight.com/health | jq
```

Garder dans `.env` du bot :

```env
BOT_HEALTH_PORT=3099
BOT_HEALTH_BIND=127.0.0.1
```

Ne pas exposer le port `3099` directement sur Internet — passer par Nginx.

---

## Variables `.env` (bot VPS)

```env
# Port du health check (défaut 3099). Mettre 0 pour désactiver.
BOT_HEALTH_PORT=3099

# Interface d'écoute (défaut 127.0.0.1 — local uniquement)
BOT_HEALTH_BIND=127.0.0.1
```

- **`127.0.0.1`** : recommandé si Uptime Kuma tourne sur le **même VPS** que le bot.
- **`0.0.0.0`** : seulement si Uptime Kuma est sur une autre machine **et** que le port est protégé (firewall / VPN).

---

## Configuration Uptime Kuma

### Cas 1 — Uptime Kuma sur le même VPS que le bot (recommandé)

1. Ouvrir Uptime Kuma → **Add New Monitor**
2. **Monitor Type** : `HTTP(s)`
3. **Friendly Name** : `LivSight WhatsApp Bot`
4. **URL** : `http://127.0.0.1:3099/health` (même VPS) ou `https://bot-health.livsight.com/health` (public)
5. **Heartbeat Interval** : `60` secondes (ou 120)
6. **Retries** : `2`
7. **Accepted Status Codes** : `200` (ou plage `200-299`)
8. Sauvegarder

### Cas 2 — Uptime Kuma sur un autre serveur

1. Dans `.env` du bot : `BOT_HEALTH_BIND=0.0.0.0`
2. Ouvrir le port `3099` **uniquement** vers l’IP d’Uptime Kuma (firewall)
3. URL : `http://IP_DU_BOT_VPS:3099/health`

> Ne pas exposer ce port publiquement sans restriction.

### Notifications

Dans Uptime Kuma, configurer les alertes (Telegram, Discord, email, etc.) sur **Down** / **Up**.

---

## Comportement attendu

| Situation bot | `/health` |
|---------------|-----------|
| Démarrage / scan QR | **503** |
| Connecté + Core API OK, commandes possibles | **200** |
| WhatsApp connecté mais JWT Core API expiré | **503** (`coreApiOk: false`) |
| Déconnexion WhatsApp (reconnexion en cours) | **503** temporaire |
| PM2 redémarre le process | **503** puis **200** |

Un court **503** pendant un `pm2 restart` ou une reconnexion WhatsApp est normal. Ajuster **Retries** et **Heartbeat** dans Kuma pour éviter les fausses alertes (ex. interval 60s, retries 3).

### Alertes Discord (optionnel)

Si `BOT_ALERT_WEBHOOK_URL` est configuré, le bot envoie des **messages courts en français** (préfixe `[LivSight Bot]`) :

| Événement | Message Discord |
|-----------|-----------------|
| Démarrage / premier ready | `Bot en ligne — WhatsApp prêt.` |
| WhatsApp déconnecté | `WhatsApp déconnecté. Reconnexion en cours...` (immédiat) |
| WhatsApp reconnecté | `Bot reconnecté — WhatsApp OK.` |
| JWT Core API expiré (401) | `Session API LivSight expirée. Commandes bloquées.` |
| Reconnexion API en cours | `Reconnexion à l'API LivSight...` |
| API reconnectée | `Bot reconnecté à l'API LivSight. Commandes OK.` |
| Échec login API | `Échec connexion API LivSight. Vérifier identifiants bot.` |
| Commande non enregistrée | `Commande non enregistrée — Tel …, … FCFA, …. ` |
| Groupe non lié (404) | `Groupe non lié — envoyer #link et lier sur le dashboard.` |
| Heartbeat quotidien | `Bot OK — WhatsApp et API connectés.` |

Variables utiles (voir `.envexample`) :

**Runbook détaillé :** [OPS_RUNBOOK.md](./OPS_RUNBOOK.md) — que faire pour chaque alerte Discord.

```env
BOT_ALERT_HEARTBEAT_ENABLED=true
BOT_ALERT_HEARTBEAT_HOURS=24
BOT_ALERT_DISCONNECT_IMMEDIATE=true
BOT_ALERT_DISCONNECT_REMINDER_MS=300000
```

Les logs PM2 restent **détaillés** (HTTP, contexte commande, corps API) — Discord = résumé ops uniquement.

Uptime Kuma et Discord se complètent : Kuma sonde `/health` toutes les ~60 s ; Discord alerte sur événements précis (coupure WA, token API, commande ratée).

### Renouvellement JWT automatique

Le bot **reconnecte automatiquement** à l’API Core quand une requête reçoit **401** (plus besoin de `pm2 restart` manuel pour un token expiré). Le cache JWT utilise la date `exp` du token quand disponible.

---

## Dépannage

| Problème | Action |
|----------|--------|
| `Connection refused` | Bot pas lancé ou `BOT_HEALTH_PORT=0` |
| Toujours 503 | Session WhatsApp bloquée **ou** auth Core API (`coreApiError` dans le JSON) — voir `pm2 logs whatsapp-bot-core` |
| Kuma ne peut pas joindre l’URL | Vérifier `BOT_HEALTH_BIND` et firewall |

---

*Voir aussi [DEPLOY_STAGING.md](./DEPLOY_STAGING.md) et [HOW_THE_BOT_WORKS.md](./HOW_THE_BOT_WORKS.md).*
