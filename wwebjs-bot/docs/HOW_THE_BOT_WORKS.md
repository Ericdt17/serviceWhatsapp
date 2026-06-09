# Bot WhatsApp LivSight — Guide équipe

Guide pour le **staff opérationnel**, le support et l’onboarding client : ce que fait le bot, comment l’utiliser, et comment lire les commandes sur LivSight.  
*(Pas un guide technique / développeur.)*

---

## Sommaire

1. [En résumé](#1-en-résumé)
2. [Un seul bot, une seule plateforme](#2-un-seul-bot-une-seule-plateforme)
3. [Qui fait quoi](#3-qui-fait-quoi)
4. [Lier un nouveau client (`#link`)](#4-lier-un-nouveau-client-link)
5. [Formats de commande WhatsApp](#5-formats-de-commande-whatsapp)
6. [Champs lus dans chaque commande](#6-champs-lus-dans-chaque-commande)
7. [Stock vs pickup — comment le bot choisit](#7-stock-vs-pickup--comment-le-bot-choisit)
8. [Catalogue produits du client](#8-catalogue-produits-du-client)
9. [Quantités dans le message](#9-quantités-dans-le-message)
10. [Après l’envoi — que voit le staff](#10-après-lenvoi--que-voit-le-staff)
11. [Messages ignorés ou refusés](#11-messages-ignorés-ou-refusés)
12. [Messages difficiles (assistance IA)](#12-messages-difficiles-assistance-ia)
13. [Rappel de format automatique](#13-rappel-de-format-automatique)
14. [Ce que le bot fait et ne fait pas](#14-ce-que-le-bot-fait-et-ne-fait-pas)
15. [Problèmes fréquents](#15-problèmes-fréquents)
16. [Checklist onboarding client](#16-checklist-onboarding-client)

---

## 1. En résumé

Le bot WhatsApp LivSight est connecté à **un numéro téléphone dédié** LivSight. Il est ajouté aux **groupes WhatsApp** des clients (boutiques).

Quand un vendeur envoie un **message de commande** au bon format dans un groupe **déjà lié** au client sur LivSight :

1. Le bot lit le message (téléphone, produits, montant, quartier de livraison).
2. Il identifie **quel client LivSight** possède ce groupe.
3. Il compare les produits au **catalogue stock** du client (si configuré).
4. Il **crée la commande** dans LivSight — visible sur le dashboard.

Le staff n’a pas à ressaisir la commande à la main dans WhatsApp : le groupe déclenche tout.

---

## 2. Un seul bot, une seule plateforme

| Élément | Détail |
|---------|--------|
| **Bot WhatsApp** | **Un seul** numéro / une seule instance — tous les clients passent par ce bot |
| **Groupes** | Chaque client a son propre groupe WhatsApp, lié à son profil LivSight |
| **Dashboard & commandes** | `https://staging-gateway.livsight.com` (plateforme LivSight utilisée par l’équipe) |
| **Pas de « deux bots »** | Il n’y a pas un bot test et un bot prod séparés côté WhatsApp — un numéro, une session, tous les groupes liés |

**Conséquence pour le staff :**

- Lier un client = `#link` dans **le vrai groupe du client** + coller l’ID sur **le profil client** sur le dashboard.
- Toute commande créée par le bot apparaît sur **cette** plateforme LivSight.
- Le numéro du bot doit rester dans le groupe ; si on le retire, les commandes ne partent plus.

---

## 3. Qui fait quoi

| Rôle | Responsabilité |
|------|----------------|
| **Admin / staff LivSight** | Créer le client sur le dashboard, lier le groupe (`#link`), gérer le **catalogue stock**, vérifier les commandes |
| **Vendeur (client)** | Envoyer les commandes dans le groupe au format attendu |
| **Bot** | Recevoir, lire, créer la commande automatiquement |
| **Équipe livraison** | Traiter les commandes sur le dashboard (stock déjà chez le client vs course pickup) |

---

## 4. Lier un nouveau client (`#link`)

**Sans cette étape, aucune commande n’est acceptée** — le bot répondra que le groupe n’est pas lié.

### Étape A — Préparer le groupe

1. Créer ou utiliser un **groupe WhatsApp** avec le vendeur.
2. Ajouter le **numéro du bot LivSight** au groupe (comme un membre).
3. S’assurer que le client est **déjà créé** sur le dashboard LivSight.

### Étape B — Obtenir l’ID du groupe

Dans le groupe, envoyer :

```
#link
```

*(ou le mot `link` seul)*

Le bot répond avec :

- L’**ID du groupe** (ex. `120363423271761784@g.us`) — à copier en entier
- Le **nom du groupe** (pour vérification)

### Étape C — Lier sur le dashboard

1. Ouvrir le **profil du client** sur LivSight.
2. Coller l’ID dans le champ **groupe WhatsApp** / identifiant WhatsApp.
3. Enregistrer.

### Étape D — Tester

Envoyer une commande test (voir formats ci-dessous) et vérifier qu’elle apparaît sur le dashboard.

---

## 5. Formats de commande WhatsApp

Le vendeur doit envoyer un message **structuré** (plusieurs lignes). Le bot accepte **deux formats principaux**.

### Format standard — 4 lignes

Ordre fixe :

```
Téléphone client
Produit(s)
Montant (FCFA)
Quartier de livraison
```

**Exemple :**

```
694397546
Pack homme
6000
Messassi
```

---

### Format alternatif — plusieurs articles

Utile quand le **quartier est en premier** ou qu’il y a **plusieurs lignes produits** :

```
Quartier
Article 1
Article 2
…
Montant
Téléphone
```

**Exemple :**

```
Logbaba
Crème solaire
Un masque
14000
651074089
```

Les lignes du milieu sont regroupées comme **description des produits** (un seul bloc texte dans la commande).

---

### Téléphone — formats acceptés

| Format | Exemple |
|--------|---------|
| 9 chiffres commençant par 6, 7 ou 2 | `694397546` |
| Avec espaces | `651 07 40 89` |
| Avec +237 | `+237 6 51 07 40 89` |
| Après un mot-clé | `Numéro : 694397546` |

---

### Montant

- En **FCFA**, sans devise obligatoire : `6000`, `14000`
- Formats avec **k** possibles : `14k` → 14 000 FCFA
- Le montant indique en général un **encaissement à la livraison** (cash collect) sur la commande

---

### Règles pour les vendeurs

| Règle | Pourquoi |
|-------|----------|
| **Groupe seulement** | Le bot ignore les messages privés (DM) |
| **Un message = une commande** | Ne pas coller deux commandes dans le même message |
| **Pas de statut dans le message** | « Livré », « collecté », etc. ne créent pas de commande (voir §11) |
| **Message du bot ignoré** | Le bot ne traite pas ses propres messages |

---

## 6. Champs lus dans chaque commande

Pour chaque message valide, le bot remplit une **commande / transaction** LivSight avec :

| Champ | Source | Exemple |
|-------|--------|---------|
| **Téléphone du destinataire** | Ligne téléphone du message | `694397546` |
| **Produits / description** | Ligne(s) produit du message | `Crème solaire`, `Un masque` |
| **Montant** | Ligne montant | `14000` FCFA |
| **Quartier / adresse de livraison** | Ligne quartier | `Logbaba` |
| **Ville / région de livraison** | Config LivSight (défaut Douala) | Douala, Littoral |
| **Point de départ** | Config LivSight (boutique / entrepôt) | Ex. Bonapriso Shop, Douala |
| **Type** | Toujours une **livraison** | delivery |
| **Origine WhatsApp** | Automatique | Marqué comme créé via WhatsApp |
| **Message original** | Texte brut du message | Conservé pour audit / litige |

Le **nom du client final** (destinataire) n’est pas toujours dans le message : par défaut « Client » si non précisé.

---

## 7. Stock vs pickup — comment le bot choisit

Chaque commande est enregistrée avec un **mode** :

| Mode | Signification pour l’équipe | Quand le bot l’utilise |
|------|----------------------------|------------------------|
| **Stock** | Le produit correspond à un article du **catalogue stock** du client — la marchandise est censée être **déjà chez le vendeur / en stock** | Voir règles ci-dessous |
| **Pickup** | **Course** — le livreur doit **aller chercher / acheter** le produit ; le texte libre du message est utilisé comme nom d’article | Catalogue vide, ou aucun produit reconnu |

### Règles de décision (dans l’ordre)

1. **Aucun produit dans le catalogue client** sur le dashboard  
   → Toujours **pickup** (le texte du message devient le nom de l’article).

2. **Un seul produit dans le catalogue**  
   → Toujours **stock** sur ce produit (même si le vendeur écrit un nom légèrement différent dans WhatsApp).

3. **Plusieurs produits dans le catalogue**  
   - Nom **identique** (après normalisation) à une ligne du catalogue → **stock** sur ce produit.  
   - Nom proche mais pas exact → le bot peut utiliser l’**IA** pour proposer le bon article du catalogue (si activée).  
   - Aucune correspondance → **pickup** avec le texte libre du message.

4. **Erreur ou indisponibilité du catalogue** au moment de la commande  
   → Le bot crée quand même la commande en **pickup** (la commande n’est pas bloquée).

### Ce que le staff doit retenir

| Situation | Action recommandée |
|-----------|-------------------|
| Client vend surtout depuis son stock | Maintenir le **catalogue à jour** sur le dashboard (noms clairs, identiques à ce que le vendeur tape) |
| Produit hors catalogue | Normal en **pickup** — le livreur fait la course |
| Mauvais mode stock/pickup | Vérifier le catalogue ; demander au vendeur d’utiliser le **nom exact** du produit catalogue |
| Stock à zéro sur le dashboard | Le bot peut quand même créer une commande **stock** si le nom matche — la gestion du stock réel se fait côté dashboard / ops |

---

## 8. Catalogue produits du client

Le catalogue est la liste des **articles stock** du client sur LivSight (ex. « Sac de riz », « Pack homme »).

| Question | Réponse |
|----------|---------|
| **Où le gérer ?** | Profil client / section packages / stock sur le dashboard |
| **Impact sur le bot ?** | Direct — le bot charge ce catalogue à chaque commande |
| **Nom du produit** | Plus le nom dans WhatsApp est **proche du nom catalogue**, plus le bot classe en **stock** |
| **Un seul article au catalogue** | Toutes les commandes de ce client partent en **stock** sur cet article |
| **Catalogue vide** | Toutes les commandes partent en **pickup** |

**Bonnes pratiques :**

- Utiliser des noms **courts et stables** (ce que le vendeur tape tous les jours).
- Éviter les doublons du même produit sous des noms différents.
- Former le vendeur : « Si tu vends depuis le stock, écris le produit comme sur LivSight. »

---

## 9. Quantités dans le message

Si le vendeur indique une **quantité**, le bot essaie de la lire (pour les commandes **stock**) :

| Écriture dans WhatsApp | Quantité comprise |
|----------------------|-------------------|
| `2x Pack homme` | 2 |
| `2 x Pack homme` | 2 |
| `3 Pack homme` | 3 |
| `Pack homme x2` | 2 |
| `qty 2 Pack homme` | 2 |
| `Pack homme (2)` | 2 |
| Pas de quantité | **1** par défaut |

- Quantité **maximum** prise en compte : **99**.
- Si la quantité est **ambiguë**, le bot peut utiliser l’**IA** pour l’interpréter (si activée).
- En **pickup**, la quantité est lue quand c’est clair, sinon défaut **1**.

---

## 10. Après l’envoi — que voit le staff

### Sur le dashboard LivSight

Une nouvelle **transaction / commande** avec notamment :

- Client LivSight (lié au groupe)
- Téléphone, montant, quartier
- Produits (nom catalogue ou texte libre)
- Mode **stock** ou **pickup**
- Quantité
- Trace **WhatsApp** (message d’origine)

### Côté vendeur dans le groupe

- **Pas de confirmation automatique** dans le groupe par défaut — la preuve est sur le dashboard.
- Si une confirmation est activée côté LivSight, le bot peut envoyer un court message « commande enregistrée » (selon configuration).

### Doublons

- Le bot **ne recrée pas** la même commande si le **même message WhatsApp** est retraité.
- Si le vendeur **renvoie** volontairement le même message, une nouvelle commande peut être créée — à gérer côté ops.

---

## 11. Messages ignorés ou refusés

Le bot **ne crée pas de commande** dans ces cas :

| Cas | Comportement |
|-----|--------------|
| Message **privé** au bot (hors groupe) | Ignoré |
| Message envoyé par le **bot lui-même** | Ignoré |
| Message qui ressemble à un **statut** : « livré », « livrée », « échec », « collecté », « pickup », « ramassage », « modifier… », « change… », « vient chercher » | Ignoré (pas une nouvelle commande) |
| Message qui commence par **@** (mention) | Ignoré |
| Groupe **non lié** au client | Message d’erreur : groupe non lié — faire `#link` + dashboard |
| Message sans **téléphone** ou sans **montant** (parse strict) | Pas de commande ; IA ou rappel de format si applicable |
| Commande `#link` / `link` | Réponse avec l’ID du groupe uniquement — pas de commande |

> **Note :** Mettre à jour le statut d’une livraison via WhatsApp (« c’est livré ») **n’est pas encore géré** par le bot sur la plateforme actuelle.

---

## 12. Messages difficiles (assistance IA)

Si le message **ressemble** à une commande (téléphone + montant présents) mais **n’est pas** au format strict :

1. Le bot peut appeler une **assistance IA** pour extraire téléphone, produits, montant et quartier.
2. Si l’extraction est **valide**, la commande est créée comme une commande normale (stock / pickup inclus).
3. Si l’extraction **échoue**, pas de commande.

L’IA sert aussi à :

- **Matcher** un nom de produit flou avec le catalogue (**stock**).
- **Deviner** une quantité ambiguë.

Si l’IA n’est pas disponible, le bot peut envoyer un **rappel de format** (voir §13).

---

## 13. Rappel de format automatique

Quand un message semble être une commande ratée et que l’IA n’a pas pu enregistrer :

- Le bot peut **répondre dans le fil** du message (réponse WhatsApp) avec les formats acceptés et des exemples.
- Un **délai** entre deux rappels pour le même vendeur évite le spam (environ 1–2 minutes).

Le vendeur voit notamment :

- Le format **4 lignes** (téléphone, produit, montant, quartier)
- Le format **multi-articles** (quartier, articles…, montant, téléphone)

---

## 14. Ce que le bot fait et ne fait pas

### ✅ Fonctionnalités actives

| Fonctionnalité | Détail |
|----------------|--------|
| Réception de commandes en **groupe** | Oui |
| Commande **`#link`** | Retourne l’ID du groupe pour liaison dashboard |
| Formats **standard** et **multi-articles** | Oui |
| Détection **stock / pickup** via catalogue | Oui |
| Lecture des **quantités** | Oui (formats courants + IA si besoin) |
| **Assistance IA** sur messages mal formatés | Oui (si activée sur le bot) |
| **Rappel de format** | Oui (si activé) |
| Conservation du **texte original** | Oui |
| **Encaissement** (montant) sur la commande | Oui si montant présent |
| Plusieurs **groupes clients** sur le même bot | Oui — un groupe = un client lié |

### ❌ Pas disponible aujourd’hui

| Fonctionnalité | Détail |
|----------------|--------|
| Commandes en **message privé** | Non |
| **Changement de statut** livraison par WhatsApp | Non |
| Réponse à un ancien message pour dire « livré » | Non |
| **Deux numéros bots** différents | Non — un seul bot pour tous |
| Saisie manuelle par le staff **dans** WhatsApp | Non — tout passe par le message vendeur |

---

## 15. Problèmes fréquents

| Problème | Cause probable | Action staff |
|----------|----------------|--------------|
| « Groupe non lié » | ID pas collé sur le profil client | `#link` + liaison dashboard |
| Aucune commande au dashboard | Groupe non lié, format invalide, ou message exclu (statut) | Vérifier liaison + format §5 |
| Toujours en **pickup** alors que stock attendu | Catalogue vide ou nom produit ≠ catalogue | Compléter / corriger le catalogue ; aligner les noms |
| Toujours en **stock** sur le mauvais article | Un seul produit au catalogue | Ajouter les vrais articles ou former le vendeur |
| Montant ou téléphone faux | Message libre, lignes dans le désordre | Demander format 4 lignes ; vérifier après IA |
| Deux commandes identiques | Vendeur a renvoyé deux fois | Annuler / fusionner côté dashboard |
| Bot ne répond plus | Problème technique (session WhatsApp) | Contacter l’équipe technique LivSight |
| `#link` sans réponse | Bot déconnecté ou pas dans le groupe | Vérifier que le numéro bot est membre du groupe |

---

## 16. Checklist onboarding client

- [ ] Client créé sur le dashboard LivSight  
- [ ] Catalogue stock rempli (si le client vend depuis son stock)  
- [ ] Groupe WhatsApp créé avec le vendeur  
- [ ] **Numéro du bot** ajouté au groupe  
- [ ] `#link` envoyé → ID copié  
- [ ] ID collé sur le profil client → enregistré  
- [ ] Commande test envoyée (format standard)  
- [ ] Commande visible sur le dashboard (bon client, bon mode stock/pickup)  
- [ ] Vendeur formé aux **deux formats** et aux noms catalogue  

---

## En une phrase

**Un seul bot WhatsApp LivSight écoute tous les groupes clients liés : chaque message de commande structuré devient une transaction sur le dashboard, en stock si le produit est reconnu dans le catalogue, sinon en pickup.**

---

*Guide équipe — LivSight WhatsApp Bot · Juin 2026*
