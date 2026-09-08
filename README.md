# Outil de pilotage des projets R&I

Application de visualisation et d'édition de la base de projets de recherche et
innovation : cinq bases séparées mais communicantes — **questions de recherche**,
**idées brutes**, **projets**, **partenaires**, **transferts** — avec filtres
dynamiques, visuels exportables et un module d'acquisition de données à partir
de notes brutes.

Elle remplace la liste Microsoft List actuelle. Le [script d'import](#import-depuis-microsoft-list)
reprend les données existantes.

## Démarrer en local

```bash
docker compose up --build        # base + application sur http://localhost:8080
```

Ou sans Docker, avec un PostgreSQL 16 accessible :

```bash
cp .env.example .env             # renseigner DATABASE_URL

cd server && npm install && npm run migrate && npm run seed   # seed = jeu de démonstration
npm run dev                      # API sur :8080

cd ../web && npm install && npm run dev                       # interface sur :5173
```

En développement le front tourne sur `:5173` et relaie `/api` vers `:8080`. En
production, une seule image sert les deux (`web/dist` est copié dans
`server/public`).

## Ce que fait l'application

| Page | Contenu |
|---|---|
| Questions de recherche | Tableau éditable ; transition alimentaire, problématique, axes, pilote et projets (une question peut être travaillée par plusieurs projets, ou aucun) |
| Idées brutes | Même structure que les projets, informations manquantes assumées. Trois stades : idée brute, attente validation CODIR, attente financement. Bascule en projet « en préparation » une fois validée |
| Projets | Tableau complet, plusieurs pilotes et financeurs, diagramme de Venn des 4 axes, histogramme paramétrable, cartouche pitch |
| Partenaires | Lieu, zone, catégorie, expertise, projets liés, cartographie |
| Transferts | Type, lieu, pilotes, projet lié, cartographie et répartition par type |
| Équipe | Expertises de chacun, charge portée, compétences à un seul porteur ; alimente la suggestion de pilote |
| Qualification | Rattachement des problématiques aux axes de la feuille de route, avec propagation aux questions, projets et idées |
| Journal | Historique horodaté de toutes les écritures |
| Réglages | Nom pour le journal, axes de recherche, géocodage, état du module d'acquisition |

Règles transverses appliquées partout :

- **Édition sur place** dans les tableaux, avec un **bouton verrou** par ligne qui
  bloque toute modification (contrôle côté serveur, pas seulement côté interface).
- **Filtres à chips dynamiques** : les options proposées et leurs effectifs sont
  recalculés d'après les autres filtres actifs, si bien qu'aucune combinaison ne
  mène à un tableau vide par surprise.
- **Autocomplétion** dès les premiers caractères ; une valeur absente d'un
  référentiel peut être créée depuis le champ lui-même.
- **Exports** : chaque visuel en PNG, chaque tableau filtré en Excel.
- **Thème clair, sombre ou système**, mémorisé par navigateur.
- **Interconnexion** : une question porte son projet, un projet porte ses
  questions et partenaires, un transfert hérite des axes de son projet.

### Grappage et bascule en projet

Sélectionner plusieurs entrées (cases à cocher ou glisser-déposer d'une ligne sur
une autre) permet de les **grapper**. Une grappe — ou une entrée seule — se
bascule ensuite dans la base projets au statut **« en préparation »**, avec
l'union des axes de ses membres.

### Acquisition de données multimodale (ADM)

Le bouton « Acquisition de données » ouvre une boîte de dialogue où coller des
notes brutes, non mises en forme, dans n'importe quelle langue. Le texte est
découpé en entrées, traduit en français, comparé aux entrées existantes
(propositions de fusion avec formulation élargie) et regroupé en grappes quand un
fil conducteur apparaît.

**Rien n'est écrit en base avant validation.** Chaque ligne proposée reste
modifiable et décochable ; les fusions et les grappes sont des cases à cocher.
Sans clé API configurée, le module est inactif et la saisie manuelle prend le
relais partout.

## Architecture

```
web/      React + TypeScript + Vite          interface
server/   Fastify + TypeScript + PostgreSQL  API REST, migrations, import
docs/     modèle de données, déploiement, décisions
```

- **PostgreSQL** porte le modèle : cinq entités, leurs tables de liaison, les
  référentiels et le journal. Les lectures passent par des vues qui agrègent déjà
  les relations en JSON — une page se charge en une requête.
- **L'API** est générique : un descripteur par ressource (`server/src/ressources.ts`)
  produit les routes CRUD, la validation et le journal. Les traitements propres au
  domaine — grappage, bascule, ADM, géocodage — ont leurs propres routes.
- **Aucune authentification**, conformément au cahier des charges. Un nom
  facultatif saisi dans les réglages signe les entrées du journal ; sans lui elles
  sont anonymes. **L'application doit donc être déployée derrière un accès
  restreint** (réseau interne, VPN, ou l'authentification intégrée d'Azure App
  Service) : sans cela, quiconque connaît l'URL peut tout modifier.

Détails : [`docs/modele-de-donnees.md`](docs/modele-de-donnees.md) ·
[`docs/deploiement.md`](docs/deploiement.md) · [`docs/decisions.md`](docs/decisions.md)

## Reprise des données ADRIA

Les données de départ (classeur de contexte + export CSV des questions) se
chargent en une commande :

```bash
cd server
npx tsx src/import-adria.ts contexte.xlsx questions.csv              # simulation
npx tsx src/import-adria.ts contexte.xlsx questions.csv --appliquer  # écrit en base
```

`--vider` remet les bases à zéro avant l'import. **Sans `--appliquer`, rien
n'est écrit** : le script affiche ce qu'il ferait et ce qu'il ne sait pas
rattacher.

Ce qu'il traite, et pourquoi :

| Donnée d'origine | Traitement |
|---|---|
| Séparateur `;#` de SharePoint | Découpé ; les identifiants numériques qui suivent chaque valeur sont retirés |
| `Yvan LE MARC - ADRIA;#19` | Ramené au collaborateur de l'onglet Équipe |
| Statuts « Attente financement » et « Attente validation CODIR » | Importés en **idées brutes** : une idée reste brute tant que le CODIR ne l'a pas validée |
| Colonne `UMT` à « oui » | Ajoutée comme labellisation, l'équipe la lit ainsi |
| `Auto-financement` | Converti en pourcentage de financement externe : `(1 − auto / budget ADRIA) × 100` |
| Partenaires cités par un projet mais absents du référentiel | Créés sans localisation plutôt qu'ignorés, pour ne pas perdre le partenariat |
| Villes des partenaires | Depuis `server/donnees/villes-partenaires.json`, où chaque entrée indique d'où vient l'information |
| Problématiques | Rattachées aux axes selon `server/donnees/problematiques-axes.json`, **marquées à valider** |

Le script signale, sans les corriger de lui-même, les acronymes qui ne
diffèrent que par la casse (`SPOREFISH` / `Sporefish`) et les projets restés
sans axe.

### Qualifier les axes après l'import

Les données de MS List ne portent aucun axe de recherche : elles portent une
**problématique**. La page **Qualification** rattache chaque problématique à un
ou plusieurs axes et propage aussitôt aux questions, puis aux projets et idées
qui s'y rattachent — 35 décisions suffisent à qualifier 66 questions.

Les rattachements proposés au départ sont **une suggestion**, affichée comme
telle jusqu'à relecture. Les projets sans aucune question rattachée ne peuvent
pas être déduits : ils portent un marqueur « à qualifier » et se renseignent
depuis la page Projets.

## Import d'autres listes Microsoft List

Pour reprendre une liste ultérieurement, `import-mslist.ts` importe un CSV
générique, **dans l'ordre** (les partenaires et projets doivent exister avant
ce qui les référence) :

```bash
cd server
npx tsx src/import-mslist.ts partenaires export-partenaires.csv     # simulation
npx tsx src/import-mslist.ts partenaires export-partenaires.csv --appliquer
npx tsx src/import-mslist.ts projets     export-projets.csv --appliquer
npx tsx src/import-mslist.ts questions   export-questions.csv --appliquer
npx tsx src/import-mslist.ts idees       export-idees.csv --appliquer
npx tsx src/import-mslist.ts transferts  export-transferts.csv --appliquer
```

**Sans `--appliquer`, rien n'est écrit** : le script affiche les colonnes
détectées, ce qu'il importerait et ce qu'il ne sait pas rattacher. Lancez-le
d'abord dans ce mode, autant de fois que nécessaire.

Les noms de colonnes attendus sont en clair en haut de
`server/src/import-mslist.ts` — adaptez-les à vos listes plutôt que de renommer
vos colonnes. Le script tolère les séparateurs `;` et `,`, les guillemets, le
BOM, les dates françaises et les montants formatés (`390 000 €`).

Les axes de recherche ne sont **jamais créés automatiquement** : corrigez-les
d'abord dans Réglages, puis relancez. C'est volontaire — un axe créé par erreur
se propagerait à toute la base.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL. `?sslmode=require` active TLS (obligatoire sur Azure). |
| `PORT` | Port d'écoute (8080 par défaut ; Azure l'injecte). |
| `ANTHROPIC_API_KEY` | Active le module ADM. Absente, le module est désactivé proprement. |
| `ADM_MODELE` | Modèle utilisé par l'ADM (`claude-opus-5` par défaut). |
| `GEOCODE_USER_AGENT` | Identifiant demandé par Nominatim ; y mettre un contact. |
| `MIGRER_AU_DEMARRAGE` | `false` pour ne pas appliquer les migrations au démarrage. |
| `LOG_LEVEL` | Niveau de journalisation Fastify. |

## Commandes utiles

```bash
cd server
npm run migrate     # applique les migrations en attente
npm run seed        # jeu de démonstration (sans effet si la base a des projets)
npm run typecheck

cd web
npm run build
npm run typecheck
```
