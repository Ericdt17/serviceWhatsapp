# Uptime Kuma — monitoring du bot WhatsApp

Le bot expose un endpoint HTTP local pour **Uptime Kuma** (ou tout autre sonde HTTP).

---

## Endpoint

| | |
|---|---|
| **URL** | `http://127.0.0.1:3099/health` |
| **Méthode** | `GET` |
| **OK** | HTTP **200** + `"ok": true` — WhatsApp connecté (`CONNECTED` ou `ready`) |
| **KO** | HTTP **503** — démarrage, QR en attente, ou déconnecté |

Exemple réponse (OK) :

```json
{
  "service": "whatsapp-bot-core",
  "ok": true,
  "ready": true,
  "whatsappState": "CONNECTED",
  "clientReady": true,
  "uptimeSeconds": 3600,
  "timestamp": "2026-06-09T12:00:00.000Z"
}
```

Test depuis le VPS :

```bash
curl -s http://127.0.0.1:3099/health | jq
```

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
4. **URL** : `http://127.0.0.1:3099/health`
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
| Connecté, messages OK | **200** |
| Déconnexion WhatsApp (reconnexion en cours) | **503** temporaire |
| PM2 redémarre le process | **503** puis **200** |

Un court **503** pendant un `pm2 restart` ou une reconnexion WhatsApp est normal. Ajuster **Retries** et **Heartbeat** dans Kuma pour éviter les fausses alertes (ex. interval 60s, retries 3).

---

## Dépannage

| Problème | Action |
|----------|--------|
| `Connection refused` | Bot pas lancé ou `BOT_HEALTH_PORT=0` |
| Toujours 503 | Session WhatsApp bloquée — voir logs `pm2 logs whatsapp-bot-core` |
| Kuma ne peut pas joindre l’URL | Vérifier `BOT_HEALTH_BIND` et firewall |

---

*Voir aussi [DEPLOY_STAGING.md](./DEPLOY_STAGING.md) et [HOW_THE_BOT_WORKS.md](./HOW_THE_BOT_WORKS.md).*
