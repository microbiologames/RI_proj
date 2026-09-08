# Déploiement

L'application est une image Docker unique qui sert l'API et l'interface. Elle a
besoin d'un PostgreSQL 16 accessible. Rien dans le code n'est propre à Azure :
les mêmes commandes fonctionnent sur un serveur interne ou un VPS.

## Azure (choix retenu)

### 1. Base de données

**Azure Database for PostgreSQL — Flexible Server**, région **France Central**
(la plus proche pour la localisation des données). Créer la base `ri_proj`.

TLS est obligatoire : la chaîne de connexion doit se terminer par `?sslmode=require`,
ce que le serveur détecte pour activer le chiffrement.

Autoriser l'App Service à joindre le serveur : soit l'intégration au réseau
virtuel (recommandé), soit la règle de pare-feu « Autoriser les services Azure ».

### 2. Application

**Azure App Service for Containers** (Linux, plan B1 suffisant pour une équipe).

Variables d'application à définir :

```
DATABASE_URL = postgres://UTILISATEUR:MOTDEPASSE@SERVEUR.postgres.database.azure.com:5432/ri_proj?sslmode=require
ANTHROPIC_API_KEY = …          # facultatif : active le module ADM
GEOCODE_USER_AGENT = outil-pilotage-RI (contact: prenom.nom@adria.tm.fr)
WEBSITES_PORT = 8080
```

Mettre `ANTHROPIC_API_KEY` et le mot de passe de la base dans **Azure Key Vault**
et les référencer, plutôt qu'en clair dans la configuration.

App Service injecte `PORT` ; le serveur écoute dessus et applique les migrations
au démarrage.

### 3. Restreindre l'accès — à ne pas omettre

**L'application ne demande aucune authentification.** Publiée telle quelle sur
Internet, elle est modifiable par quiconque en connaît l'URL. Il faut donc une
protection au niveau de l'hébergement. Par ordre de simplicité :

1. **App Service Authentication (Easy Auth)** avec Microsoft Entra ID : à activer
   dans le portail, sans une ligne de code. Seuls les comptes du locataire entrent ;
   l'application, elle, ne demande toujours rien.
2. **Restrictions d'accès par IP** : limiter aux plages du réseau de
   l'établissement et au VPN.
3. **Point de terminaison privé** : l'application n'est joignable que depuis le
   réseau virtuel.

Ces trois options sont indépendantes du code et réversibles.

### 4. Publication de l'image

```bash
az acr build --registry MONREGISTRE --image pilotage-ri:latest .
az webapp config container set \
  --name MON-APP --resource-group MON-GROUPE \
  --docker-custom-image-name MONREGISTRE.azurecr.io/pilotage-ri:latest
```

## Serveur interne ou VPS

```bash
git clone <dépôt> && cd RI_proj
cp .env.example .env        # renseigner DATABASE_URL et, si besoin, ANTHROPIC_API_KEY
docker compose up -d --build
```

L'application écoute sur `:8080`. Placer un reverse proxy (Caddy, nginx) devant
pour le TLS. Sauvegarder le volume `donnees` — c'est là que vit la base.

## Sauvegarde

Sur Azure, activer les sauvegardes automatiques du Flexible Server (7 à 35 jours
de rétention). Ailleurs :

```bash
docker compose exec db pg_dump -U ri ri_proj | gzip > sauvegarde-$(date +%F).sql.gz
```

Toutes les données de l'application sont dans PostgreSQL : aucun état sur le
disque du conteneur applicatif, qui peut être détruit et recréé sans perte.

## Ce qui sort du serveur

Deux appels réseau sortants, tous deux facultatifs :

| Destination | Quand | Contenu |
|---|---|---|
| API Anthropic | Clic sur « Acquisition de données » | Le texte brut collé + les libellés des entrées existantes similaires, pour la détection de doublons |
| Nominatim (OpenStreetMap) | Création d'un partenaire ou d'un transfert, ou rattrapage depuis Réglages | Une ville et un pays |

Sans `ANTHROPIC_API_KEY`, le premier n'a jamais lieu. Si le second est bloqué, les
coordonnées restent vides : tout le reste fonctionne, seules les cartes sont vides.

Les tuiles de carte sont chargées par le navigateur depuis
`tile.openstreetmap.org`. Pour un réseau fermé, remplacer l'URL dans
`web/src/components/Carte.tsx` par un serveur de tuiles interne.

## Migrer vers un autre hébergeur

Rien à réécrire : l'image est standard et la base est un PostgreSQL sans
extension propriétaire (`pg_trgm` et `unaccent` sont livrées avec PostgreSQL).
Un `pg_dump` / `pg_restore` et un redéploiement de la même image suffisent.
