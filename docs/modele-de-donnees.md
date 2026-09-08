# Modèle de données

## Vue d'ensemble

Cinq entités principales, reliées par des tables de liaison. Le cahier des charges
demande des « bases séparées mais communicantes » : chaque entité a sa table et sa
page, les liens passent par des clés étrangères et des tables de jonction.

```
                    problematiques ──── problematique_axes ──┐
                          │                                  │
              (une question porte une problématique)         │
                          │                                  ▼
transitions ──── questions_recherche ──── question_axes ── axes_recherche
                     │        │                              ▲   │
        question_projets   question_idees                    │   └── scopes_feuille_de_route
                     │        │                              │
                     ▼        ▼                    projet_axes · idee_axes
                  projets   idees_brutes ──────────────┘
                     │  ▲       │
      projet_pilotes │  │       └── (bascule en projet « en préparation »)
                     ▼  │
                personnes ── personne_expertises ── expertises
                     ▲
        transfert_pilotes ── transferts ──── types_transfert
                                  │
partenaires ─── projet_partenaires┘      categories_partenaire
     └── partenaire_expertises ── expertises

types_financement ── projet_financements ── projets ── projet_labellisations ── labellisations
grappes : regroupe des questions OU des idées, convertible en projet
journal : trace horodatée de toute écriture, toutes entités confondues
```

## Le rattachement aux axes passe par la problématique

C'est le point le plus important du modèle, et il vient des données : l'export
MS List ne porte **aucun** axe de recherche. Les questions y sont classées par
**problématique** (une trentaine de valeurs) et par **transition alimentaire**
(une quinzaine).

La chaîne est donc :

```
problematique ──> problematique_axes ──> axes
      │
      └─> questions_recherche ──> question_axes   (recopié depuis la problématique)
                   │
                   ├─> question_projets ──> projet_axes   (union, additive)
                   └─> question_idees   ──> idee_axes     (union, additive)
```

Qualifier une problématique qualifie donc toutes les questions qui la portent,
puis les projets et idées qui s'y rattachent — 35 décisions au lieu de 135.
`problematiques.axes_valides` distingue une proposition d'un rattachement relu.

Deux nuances dans la propagation, appliquées par
`server/src/routes/qualification.ts` :

- les axes d'une **question** sont *redéfinis* par sa problématique : c'est elle
  qui fait autorité ;
- ceux d'un **projet** ou d'une **idée** sont *ajoutés* sans jamais rien retirer,
  car un axe a pu y être saisi à la main.

Un projet sans aucune question rattachée ne peut pas être déduit : il reste sans
axe, porte un marqueur « à qualifier » dans l'interface, et se renseigne à la
main. Il y en a 27 sur 59 à l'import initial.

## L'axe est signalé, pas imposé

Le cahier des charges demande un axe obligatoire partout. Appliquée à la lettre,
cette règle aurait rejeté 100 % des données existantes.

Le compromis retenu : l'axe reste **exigé à la création** depuis un formulaire —
les entrées nouvelles sont donc toujours qualifiées — mais une entrée importée
sans axe est acceptée, marquée « à qualifier », et filtrable comme telle. Ce qui
existe entre dans l'outil ; ce qui s'y ajoute reste propre.

## Choix structurants

**Les axes de recherche sont une table, pas une énumération.** Les quatre axes
sont ceux de la feuille de route R&I, modifiables depuis Réglages sans migration.
Ils portent deux couleurs, une par thème : une même teinte ne peut pas être
lisible à la fois sur fond clair et sur fond sombre. `scopes_feuille_de_route`
conserve leur périmètre — scope de questions et contribution possible de l'ADRIA
— consultable depuis la page Qualification.

**Les relations sont plusieurs-à-plusieurs partout où les données l'exigent.**
Un projet a plusieurs pilotes (jusqu'à trois dans l'export) et plusieurs
financeurs ; une question est travaillée par plusieurs projets, ou par aucun ;
un projet répond à plusieurs questions. Ce sont les données qui l'ont imposé,
pas une préférence de modélisation.

**Une idée brute porte un stade d'avancement.** `statut_idee` vaut `brute`,
`attente_codir` ou `attente_financement`. Le principe posé par l'équipe : une
idée reste brute tant que le CODIR ne l'a pas validée ; elle devient ensuite un
projet « en préparation ». Les statuts MS List « Attente validation CODIR » et
« Attente financement » sont donc importés comme idées, pas comme projets — ce
qui laisse quatre statuts de projet, et non six.

**L'auto-financement n'est pas stocké.** L'export MS List donne un montant
d'auto-financement ; la base garde le pourcentage de financement externe, plus
parlant et déjà prévu au cahier des charges. La conversion,
`(1 − auto / budget ADRIA) × 100`, a été vérifiée sur les données : elle produit
des valeurs rondes (20 %, 50 %, 100 %), ce que `auto / budget total` ne fait pas.

**Un partenaire n'a pas toujours de ville.** Un réseau comme le RMT QUALIMA ou
un consortium comme Sym'Previus n'a pas d'implantation propre. `ville` et `pays`
sont donc facultatifs, complétés par `zone` (FR/EU/ER) et `categorie_id`.
`localisation_source` dit d'où vient la localisation — saisie, trouvée en ligne,
déduite du nom, estimée, ou sans lieu — pour qu'une ville devinée ne passe jamais
pour une donnée vérifiée.

**La contrainte « au moins un axe » est appliquée par l'API, pas par le schéma.**
SQL ne sait pas exprimer « au moins une ligne dans une table de jonction » sans
déclencheur. Le contrôle est dans `server/src/ressources.ts` (`obligatoire: true`),
au seul endroit par lequel passent toutes les écritures.

**Le pourcentage de financement est stocké, pas calculé.** Le taux obtenu n'est pas
toujours `budget_adria / budget_total` : subventions partielles, cofinancements,
assiettes éligibles différentes. Le calculer aurait affiché une valeur fausse.

**Une grappe est une entité, pas un simple lien.** Elle porte un nom, une
description et son origine (manuelle ou ADM) ; c'est ce nom qui devient le titre du
projet à la bascule. `grappes.projet_id` conserve la trace de la bascule et
empêche de basculer deux fois.

**Les transferts héritent des axes de leur projet.** Un transfert n'a pas d'axes
propres : c'est une conséquence d'un projet. La vue `v_transferts` les expose pour
que les filtres par axe fonctionnent aussi sur cette page.

**Les vues portent les relations agrégées en JSON.** `v_projets`, `v_questions`,
etc. renvoient chaque ligne avec ses axes, partenaires et financements déjà
assemblés. Une page se charge en une requête et filtre ensuite côté navigateur, ce
qui rend les chips instantanées. `v_personnes` y ajoute les compteurs de charge
qui alimentent la page Équipe et la suggestion de pilote.

## Suppressions

- `ON DELETE CASCADE` sur les tables de liaison : supprimer un projet retire ses
  liens, pas les partenaires ni les axes.
- `ON DELETE SET NULL` sur les rattachements facultatifs : supprimer un projet
  laisse ses questions en base, simplement détachées.
- `ON DELETE RESTRICT` sur les référentiels : un axe ou un type de financement
  encore utilisé ne peut pas disparaître.

## Verrouillage

Chaque entité porte `verrouille`. Une ligne verrouillée refuse toute modification
et toute suppression **côté serveur** (HTTP 423), pas seulement dans l'interface —
sinon le verrou ne protégerait rien. Seule la levée du verrou reste possible.

## Journal

Toute écriture insère une ligne dans `journal` : horodatage, entité, action,
résumé lisible, et `details` en JSONB contenant le diff champ par champ
(`{ champ: { avant, apres } }`). La colonne `auteur` reçoit l'en-tête `X-Auteur`
envoyé par le front, alimenté par le nom facultatif des réglages ; elle vaut
`NULL` quand personne ne s'est nommé.

## Migrations

Fichiers SQL numérotés dans `server/migrations/`, appliqués dans l'ordre et une
seule fois (table `_migrations`), chacun dans sa transaction. Elles s'exécutent au
démarrage sauf si `MIGRER_AU_DEMARRAGE=false`.

Pour faire évoluer le schéma : ajouter un fichier `00N_description.sql`. Ne jamais
modifier un fichier déjà appliqué — il ne serait pas rejoué.
