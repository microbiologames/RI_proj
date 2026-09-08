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
