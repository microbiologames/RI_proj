# Déploiement sur un serveur ADRIA — dossier pour l'IT

Application web interne de pilotage des projets de recherche et innovation.
Remplace une liste Microsoft List. Une dizaine d'utilisateurs, quelques
centaines d'enregistrements.

Deux conteneurs Docker : une base PostgreSQL et une application web. Aucune
dépendance à un service externe pour fonctionner.

---

## 1. Ce qui est demandé

### Machine

| | |
|---|---|
| Système | Linux — Debian 12 ou Ubuntu 22.04/24.04 LTS |
| Processeur | 2 vCPU |
| Mémoire | 4 Go |
| Disque | 20 Go |
| Logiciels | Docker Engine et le plugin Compose (paquets `docker-ce`, `docker-compose-plugin`) |

Ce dimensionnement est large : la base pèse quelques mégaoctets et l'usage est
celui d'une dizaine de personnes en journée. Une VM sur un hyperviseur existant
convient.

### Réseau

| Besoin | Détail |
|---|---|
| Nom DNS interne | par exemple `pilotage-ri.adria.local`, pointant vers la VM |
| Port entrant | **8080/tcp** depuis le réseau interne (ou 443 derrière un reverse proxy, voir §5) |
| Accès sortant HTTPS | **à l'installation et aux mises à jour uniquement** : `registry.npmjs.org`, `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com`, `github.com` |
| Accès sortant en fonctionnement | **aucun n'est nécessaire.** Deux services externes sont utilisés s'ils sont joignables, et l'application fonctionne sans : voir §6 |

Le port **5432** (PostgreSQL) **n'est pas publié** : l'application joint la base
par le réseau interne de Docker. Il ne sera ouvert que le jour où l'ERP devra
lire les données, et sur sa seule adresse.

### Sauvegardes

Le volume Docker `pilotage-ri_donnees` contient **toute** la donnée. Le reste est
reconstructible depuis le dépôt de code.

Demande : inclure ce volume, ou le répertoire de vidages décrit en §7, dans le
plan de sauvegarde existant. Une rétention de 30 jours est suffisante.

---

## 2. Point de sécurité à examiner

**L'application ne demande pas d'authentification.** C'est un choix assumé du
cahier des charges : l'équipe édite les tableaux sans friction, et l'application
n'a ni comptes ni mots de passe.

**La conséquence est directe : toute personne qui atteint l'URL peut lire et
modifier les données.** La protection repose donc entièrement sur le réseau.

Ce qui est demandé à l'IT :

- Publier l'application **sur le réseau interne uniquement**. Pas de NAT, pas de
  publication sur Internet.
- Si un accès depuis l'extérieur est souhaité (télétravail), le faire passer par
  le VPN de l'établissement.
- Si une publication sur Internet devenait nécessaire, elle devra être précédée
  d'une authentification (reverse proxy avec authentification, ou SSO). À
  arbitrer à ce moment-là, pas avant.

Les données concernées sont des projets de recherche, des partenariats et des
budgets prévisionnels — sensibles au sens commercial, non réglementé. Aucune
donnée personnelle au-delà des noms et fonctions des collaborateurs de l'équipe.

**Le code source est public** (dépôt GitHub ouvert) ; **les données ne le sont
pas** et ne transitent jamais par lui. Conséquence pratique : les valeurs par
défaut du dépôt — à commencer par le mot de passe de la base — sont connues de
tous, d'où le refus de démarrage évoqué au §3.

---

## 3. Installation

À exécuter sur la VM, en tant qu'utilisateur membre du groupe `docker`.

```bash
# 1. Récupérer le code
sudo mkdir -p /opt/pilotage-ri && sudo chown "$USER" /opt/pilotage-ri
cd /opt/pilotage-ri
git clone -b claude/ri-projects-visualization-tool-6bmt2i \
  https://github.com/microbiologames/RI_proj.git .

# 2. Configurer
cp .env.example .env
```

Éditer `.env` et **remplacer le mot de passe de la base**. C'est le seul
changement obligatoire, et il n'est pas facultatif : **le dépôt de code est
public, la valeur par défaut l'est donc aussi, et l'application refuse de
démarrer tant qu'elle n'a pas été changée.**

```ini
POSTGRES_USER=ri
POSTGRES_PASSWORD=UN_MOT_DE_PASSE_SOLIDE
POSTGRES_DB=ri_proj
PORT=8080
```

Un seul endroit à modifier : l'application et la base lisent tous deux ces
valeurs. Pour en produire un :

```bash
tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32; echo
```

```bash
# 3. Construire et démarrer (5 à 10 minutes la première fois)
docker compose up -d --build

# 4. Vérifier
curl -s http://localhost:8080/api/sante
# attendu : {"statut":"ok", ..., "donnees":"absentes", "contenu":{...,"axes":4}}
```

Les tables sont créées automatiquement au premier démarrage, et les
référentiels avec elles — d'où `axes: 4`. Les données métier, elles, sont
chargées par l'étape suivante : `donnees: "absentes"` est l'état normal à ce
point.

### Chargement des données de départ

**Procédure détaillée, avec les vérifications et les cas d'erreur :
[`mise-en-service.md`](mise-en-service.md).** En résumé :

Nicolas fournit deux fichiers : un classeur Excel et un export CSV. Les déposer
dans `/opt/pilotage-ri/donnees-source/`, puis :

```bash
cd /opt/pilotage-ri
# D'abord une simulation : rien n'est écrit, on lit ce que ça ferait
docker compose exec app node dist/import-adria.js \
  /app/donnees-source/<classeur>.xlsx /app/donnees-source/<export>.csv

# Puis, si le compte-rendu est conforme
docker compose exec app node dist/import-adria.js \
  /app/donnees-source/<classeur>.xlsx /app/donnees-source/<export>.csv --appliquer
```

Attendu : 59 projets, 66 questions, 10 idées, 104 partenaires, 15 personnes
(11 de l'équipe R&I, 4 pilotes hors équipe). `/api/sante` les redonne à tout
moment, ce qui permet de vérifier l'import depuis un navigateur.

Le script refuse de s'appliquer sur une base déjà peuplée : relancer un import
complet demande `--vider`, qui efface aussi les saisies faites entre-temps.

---

## 4. Exploitation courante

```bash
cd /opt/pilotage-ri

docker compose ps                  # état des conteneurs
docker compose logs -f app         # journaux de l'application
docker compose logs -f db          # journaux de la base
docker compose restart app         # redémarrer l'application
docker compose down                # arrêter (les données sont conservées)
docker compose up -d               # redémarrer
```

**Démarrage automatique au boot** — les conteneurs redémarrent d'eux-mêmes si
la politique de redémarrage est posée :

```bash
docker compose up -d
docker update --restart unless-stopped $(docker compose ps -q)
```

**Mise à jour de l'application :**

```bash
cd /opt/pilotage-ri
docker compose down
git pull
docker compose up -d --build
```

Les évolutions de schéma s'appliquent seules au démarrage. **Faire un vidage
avant** (§7).

---

## 5. Accès en HTTPS (facultatif)

L'application écoute en HTTP sur 8080. Si la politique interne impose HTTPS,
placer un reverse proxy devant. Exemple avec nginx et un certificat interne :

```nginx
server {
    listen 443 ssl;
    server_name pilotage-ri.adria.local;

    ssl_certificate     /etc/ssl/certs/pilotage-ri.crt;
    ssl_certificate_key /etc/ssl/private/pilotage-ri.key;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Restreindre alors 8080 à `127.0.0.1` en remplaçant `ports: ['8080:8080']` par
`ports: ['127.0.0.1:8080:8080']` dans `docker-compose.yml`.

---

## 6. Ce qui sort du serveur

Deux appels sortants, tous deux facultatifs. **Si le pare-feu les bloque,
l'application fonctionne** — seules les fonctions concernées sont indisponibles.

| Destination | Quand | Contenu | Si bloqué |
|---|---|---|---|
| `nominatim.openstreetmap.org` | Création d'un partenaire ou d'un transfert | Une ville et un pays | Les coordonnées restent vides, à saisir à la main |
| `api.anthropic.com` | Clic sur « Acquisition de données » | Le texte collé par l'utilisateur | La fonction se désactive, la saisie manuelle prend le relais |

Le second n'a lieu **que** si une clé API est renseignée dans `.env`. Sans
clé — configuration par défaut — aucun appel n'est émis.

Le navigateur des utilisateurs charge par ailleurs les fonds de carte depuis
`tile.openstreetmap.org`. S'il est bloqué, les cartes s'affichent sans fond, les
points restent positionnés.

---

## 7. Sauvegarde et restauration

**Vidage quotidien**, à placer dans une tâche planifiée :

```bash
#!/bin/bash
# /opt/pilotage-ri/sauvegarde.sh
set -euo pipefail
DEST=/var/sauvegardes/pilotage-ri
mkdir -p "$DEST"
cd /opt/pilotage-ri
docker compose exec -T db pg_dump -U ri ri_proj | gzip \
  > "$DEST/ri_proj-$(date +%F).sql.gz"
find "$DEST" -name 'ri_proj-*.sql.gz' -mtime +30 -delete
```

```
0 2 * * * /opt/pilotage-ri/sauvegarde.sh
```

**Restauration :**

```bash
cd /opt/pilotage-ri
gunzip -c /var/sauvegardes/pilotage-ri/ri_proj-2026-09-09.sql.gz \
  | docker compose exec -T db psql -U ri -d ri_proj
```

**À faire une fois avant la mise en service :** restaurer un vidage sur une base
de test et vérifier que les données sont là. Une sauvegarde qui n'a jamais été
restaurée n'est pas une sauvegarde.

---

## 8. Intégration future avec l'ERP

Le port de la base reste fermé. Le moment venu, un compte de lecture dédié
donnera accès à un schéma d'intégration figé — et à rien d'autre : la lecture
des tables et toute écriture sont refusées. Procédure dans
[`integration-erp.md`](integration-erp.md).

---

## 9. Ce dont l'IT n'a pas besoin

Pour éviter les demandes inutiles :

- **Aucun accès administrateur n'est à donner à un prestataire.** L'application
  est déployée par les commandes ci-dessus.
- **Aucun logiciel hors Docker** : ni Node, ni PostgreSQL, ni serveur web à
  installer sur l'hôte.
- **Aucun compte utilisateur à créer** : l'application n'en gère pas.
- **Aucune ouverture entrante depuis Internet.**

---

## 10. Contacts et récapitulatif

| Élément | Valeur |
|---|---|
| Demandeur | Nicolas Nguyen Van Long, responsable R&I |
| Code source | `github.com/microbiologames/RI_proj`, branche `claude/ri-projects-visualization-tool-6bmt2i` (dépôt privé) |
| Répertoire d'installation | `/opt/pilotage-ri` |
| Port applicatif | 8080/tcp, réseau interne |
| Volume à sauvegarder | `pilotage-ri_donnees`, ou les vidages de `/var/sauvegardes/pilotage-ri` |
| Documentation complète | `README.md` et `docs/` du dépôt |
