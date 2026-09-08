# Modèle de données

## Vue d'ensemble

Cinq entités principales, reliées par des tables de liaison. Le cahier des charges
demande des « bases séparées mais communicantes » : chaque entité a sa table et sa
page, les liens passent par des clés étrangères et des tables de jonction.

```
axes_recherche ──┬── question_axes ──── questions_recherche ──┐
                 ├── idee_axes ──────── idees_brutes ─────────┤
                 └── projet_axes ────── projets ◄─────────────┤
                                          ▲  ▲                │
personnes ────────── pilote_id ───────────┘  │                │
                                             │           grappes
partenaires ─── projet_partenaires ──────────┤                │
     │                                       │                │
     └── partenaire_expertises ── expertises │      (question | idée)
                                             │
types_financement ── projet_financements ────┤
labellisations ───── projet_labellisations ──┤
                                             │
types_transfert ──── transferts ─────────────┘
                          └── transfert_pilotes ── personnes

journal : trace horodatée de toute écriture, toutes entités confondues
```

## Choix structurants

**Les axes de recherche sont une table, pas une énumération.** Les quatre axes
livrés sont modifiables depuis Réglages sans migration. Ils portent deux couleurs,
une par thème : une même teinte ne peut pas être lisible à la fois sur fond clair
et sur fond sombre.

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
qui rend les chips instantanées.

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
