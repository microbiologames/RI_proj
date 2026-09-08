# Décisions techniques

Ce qui a été choisi, pourquoi, et ce que cela coûte. À relire avant de remettre
en cause l'un de ces points.

## PostgreSQL plutôt que Microsoft List

MS List atteint ses limites sur ce cas : pas de relations plusieurs-à-plusieurs
propres (un projet ↔ plusieurs partenaires ↔ plusieurs axes), pas d'agrégations
côté serveur pour alimenter Venn et histogrammes, et une API Graph lourde pour
lire quelques centaines de lignes.

PostgreSQL donne le modèle relationnel réel, les vues qui alimentent les visuels
en une requête, un historique complet, et se déplace d'un hébergeur à l'autre par
un simple `pg_dump`.

**Coût** : il faut un serveur, là où MS List ne demandait rien. Contrepartie : les
données ne dépendent plus du format d'export d'un éditeur.

## Aucune authentification

Demandé au cahier des charges, et retenu tel quel. L'édition se fait sans
connexion, ce qui supprime toute friction.

**Conséquence assumée** : les entrées du journal ne portent un auteur que si la
personne a saisi son nom dans Réglages. Une suppression accidentelle reste donc
possiblement anonyme.

**Ce qui l'équilibre** : le verrou par ligne protège ce qui est stabilisé
(contrôle serveur, pas seulement d'interface), le journal enregistre le contenu
supprimé dans `details` — une suppression est donc reconstituable — et
[`deploiement.md`](deploiement.md) décrit comment restreindre l'accès au niveau
de l'hébergement. **Ce dernier point n'est pas optionnel** : publiée sur Internet
sans protection, l'application est modifiable par n'importe qui.

## Les axes se déduisent de la problématique

Les données de départ ne portent aucun axe de recherche : les questions y sont
classées par **problématique** et par **transition alimentaire**. Trois options
se présentaient — rendre l'axe facultatif et le saisir 135 fois, l'imposer et
rejeter l'import, ou qualifier le niveau intermédiaire.

C'est la troisième qui a été retenue : rattacher les 35 problématiques aux axes
qualifie d'un coup les 66 questions, puis les projets et idées liés. Le
rattachement livré est **une proposition**, établie en lisant les scopes de la
feuille de route, et affichée comme telle jusqu'à relecture — un rattachement
deviné qui se ferait passer pour une donnée serait pire que pas de rattachement
du tout.

**Ce que cela coûte** : le cahier des charges demandait un axe obligatoire
partout. L'obligation est maintenue à la création depuis un formulaire, mais une
entrée importée sans axe est acceptée et marquée « à qualifier ». Sans cet
assouplissement, aucune des 135 entrées existantes n'aurait pu entrer.

**Ce qui reste hors de portée** : 27 projets n'ont aucune question rattachée.
Leur axe ne se déduit de rien et doit être saisi à la main.

## Les statuts « en attente » sont des idées, pas des projets

L'export MS List porte six statuts. Deux d'entre eux — « Attente validation
CODIR » et « Attente financement » — décrivent une idée qui n'a pas encore été
validée, non un projet. Ils sont donc importés dans la base des idées brutes,
où ils deviennent un stade d'avancement (`statut_idee`).

Les projets gardent ainsi les quatre statuts du cahier des charges, et le
principe posé par l'équipe est respecté : une idée reste brute tant que le CODIR
ne l'a pas validée ; elle devient ensuite un projet « en préparation ».

## Les villes des partenaires sont tracées, pas seulement devinées

Le référentiel des partenaires ne donne qu'une zone (FR/EU/ER), alors que la
cartographie demandée a besoin de coordonnées. Les 35 villes ont donc été
renseignées : une dizaine par recherche en ligne, six déduites du nom du
partenaire, les autres d'après la connaissance générale des organismes.

Plutôt que de présenter le tout comme des données saisies,
`localisation_source` conserve l'origine de chaque valeur et l'interface signale
les villes estimées. La convention retenue est le **siège social** — le seul
choix vérifiable et cohérent d'un partenaire à l'autre. Quatre réseaux et
consortiums restent sans lieu : ils n'ont pas d'implantation propre, et leur en
inventer une aurait faussé la carte.

## Les partenaires cités par un projet sont créés, pas ignorés

L'onglet Partenaires ne liste que les partenaires stratégiques ; les projets en
citent 69 autres. Les ignorer aurait perdu autant de partenariats réels. Ils
sont donc créés sans localisation, avec une note disant d'où ils viennent.

## Diagramme de Venn : quatre ellipses, en contour

**Quatre cercles ne peuvent pas produire un Venn à 4 ensembles** — ils ne
génèrent que 14 des 15 régions. La construction de Venn (1880) utilise quatre
ellipses identiques inclinées à ±35°, c'est celle implémentée.

Les centres des 15 régions ne sont pas codés en dur : ils sont calculés au
chargement en échantillonnant le plan et en retenant, pour chaque région, le point
le plus proche de son barycentre — un barycentre pouvant tomber hors d'une région
en croissant. Modifier la géométrie des ellipses ne casse donc pas le placement
des chiffres.

Les ensembles sont dessinés **en contour**, pas en aplat. Quatre aplats superposés
rendraient les intersections illisibles et feraient reposer la lecture sur des
couleurs indiscernables. Ici la lecture se fait sur les chiffres, chaque ellipse
porte son étiquette, et la couleur n'est qu'un repère.

## Palette des axes

Les quatre couleurs par défaut viennent d'une palette catégorielle vérifiée :
séparation suffisante pour les daltonismes protan, deutan et tritan, et contraste
suffisant sur chacun des deux fonds. Chaque axe a **deux** valeurs, une par thème —
une teinte lisible sur fond clair ne l'est pas sur fond sombre.

Elles restent modifiables depuis Réglages ; en les changeant, on sort de la
palette vérifiée. La couleur n'est jamais le seul porteur d'information : code de
l'axe affiché partout, légende complète sous chaque visuel.

## Filtres à chips recalculés

Les effectifs d'une facette sont calculés sur les lignes qui passent **les autres**
facettes. Une chip affichant « 3 » donne donc bien 3 lignes, et une combinaison ne
mène jamais à un tableau vide par surprise. Une valeur sélectionnée reste visible
même tombée à zéro, sinon on ne pourrait plus la désélectionner.

Au-delà de huit valeurs, une facette est repliée derrière un « +N » : les listes de
partenaires ou de pilotes prendraient sinon plusieurs lignes à l'écran.

## Module ADM en deux temps

Le modèle **propose**, l'utilisateur **dispose**. `POST /api/adm/analyser` ne fait
aucune écriture ; `POST /api/adm/appliquer` reçoit la proposition telle que
l'utilisateur l'a corrigée.

C'est ce qui rend le module acceptable : une fusion automatique d'entrées
écraserait un énoncé rédigé par un collègue. Le serveur revalide de toute façon
tout ce qu'il reçoit — la sortie du modèle n'est jamais écrite telle quelle, et
un axe inexistant est filtré avant même d'atteindre l'écran de validation.

Le module est optionnel : sans `ANTHROPIC_API_KEY` il se désactive proprement et
la saisie manuelle reste disponible partout.

## La suggestion de pilote propose, elle ne décide pas

La matrice d'expertises croise 18 compétences et 11 collaborateurs : de quoi
proposer un pilote à la création d'un projet. Le score combine la couverture des
expertises demandées, l'expérience sur les axes visés et la charge en cours.

Chaque proposition affiche **les raisons de son classement**, et rien n'est
appliqué sans clic. Un score qui déciderait seul du pilote d'un projet serait à
la fois faux et mal accepté ; ordonner une liste de candidats est utile et
vérifiable.

Le même croisement fait apparaître les expertises portées par une seule
personne — une information de pilotage que la matrice brute ne montrait pas.

## API générique par descripteurs

Un descripteur par ressource (`server/src/ressources.ts`) déclare table, vue,
champs validés et tables de liaison ; `routes/crud.ts` en déduit les cinq routes,
la validation, le verrou et le journal.

Les cinq bases se ressemblent trop pour cinq fichiers presque identiques, où une
correction ne serait appliquée qu'à quatre. Ce qui est réellement propre au
domaine — grappage, bascule, ADM, géocodage — a ses propres fichiers.

**Limite** : le générique n'accepte que le CRUD ordinaire. Une ressource aux
règles particulières mérite ses routes plutôt qu'un descripteur tordu.

## Filtrage côté navigateur

Les vues renvoyant chaque page en une requête, filtres et tris s'appliquent en
mémoire : les chips réagissent sans aller-retour réseau.

**Limite connue** : au-delà de quelques milliers de lignes par base, il faudra
paginer et filtrer côté serveur. Pour l'ordre de grandeur visé — quelques
centaines d'entrées — c'est le bon compromis.

## Une seule image pour l'API et le front

Le front compilé est copié dans `server/public` et servi par Fastify. Un seul
service à déployer, pas de CORS, pas de second nom de domaine, et aucun risque de
désynchronisation entre les deux moitiés.

## Une bibliothèque de graphiques n'a pas été utilisée

Venn, histogramme et cartes sont écrits directement (SVG et Leaflet). Une
bibliothèque généraliste n'aurait de toute façon pas fourni le Venn à 4 ellipses,
et aurait imposé ses propres couleurs et son propre comportement en thème sombre.

`xlsx` et `html-to-image` sont chargés à la demande, au moment d'un export : ils
pèsent l'essentiel du poids et ne servent qu'à ce moment-là.
