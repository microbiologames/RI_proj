# Intégration avec un outil de gestion (Furious)

## Le principe : deux outils, une donnée, un contrat

Un ERP et cet outil ne font pas le même métier. L'ERP tient la gestion —
budgets consommés, temps passé, facturation. Cet outil tient le pilotage
scientifique — axes de recherche, questions, problématiques, idées, grappes,
transferts, expertises de l'équipe. Aucun des deux ne remplacera l'autre.

Le schéma retenu : **une base de données, deux consommateurs, et une surface
de lecture stable entre les deux.**

```
   outil R&I  ──écrit──>  PostgreSQL  ──lit──>  schéma « integration »  ──>  ERP
  (pilotage                (la donnée)          (vues figées = contrat)   (gestion)
  scientifique)
```

## Ce qu'il ne faut pas faire

**Laisser l'ERP lire les tables directement.** Ce serait le rendre dépendant du
schéma interne : plus aucune évolution du modèle ne serait possible sans casser
son paramétrage. C'est la raison d'être du schéma `integration`.

**Laisser l'ERP écrire dans les tables.** Les règles du domaine — au moins un
axe, propagation depuis les problématiques, verrou de ligne, journal — vivent
dans l'API, pas dans les contraintes SQL. Une écriture directe les contourne
toutes, silencieusement. Si l'ERP doit un jour écrire, ce sera par l'API HTTP.

## Le contrat

Le schéma `integration` expose des vues plates, en lecture seule :

| Vue | Contenu |
|---|---|
| `integration.projets` | Un projet par ligne, avec pilotes, axes, financements, labellisations et partenaires agrégés en texte |
| `integration.personnes` | Collaborateurs, fonction, expertises |
| `integration.partenaires` | Partenaires, localisation, catégorie, expertises |
| `integration.questions_recherche` | Questions, problématique, transition, axes, projets rattachés |
| `integration.transferts` | Publications, communications, prestations, outils |
| `integration.projet_pilotes` · `projet_partenaires` · `projet_axes` | Les mêmes liaisons, normalisées |

**Engagement :** les colonnes de ces vues ne sont ni renommées ni supprimées
sans préavis ; des colonnes peuvent être ajoutées. Les tables derrière restent
libres d'évoluer.

Les valeurs multiples sont agrégées avec ` ; ` comme séparateur — un ERP
consomme mal du JSON. Qui préfère des données normalisées prend les vues de
liaison.

## L'identifiant qui compte : `id`

Chaque vue expose un `id` de type UUID. **C'est lui qui sert de clé de
rapprochement, jamais l'acronyme ni l'identifiant numérique interne.**

Pour les projets, partenaires et personnes, cet UUID est *dérivé de la clé
naturelle* : le même acronyme redonne toujours le même identifiant, y compris
sur une base reconstruite depuis les fichiers sources. Une correspondance
établie côté ERP survit donc à un réimport complet.

Deux détails qui ont leur importance :

- La casse est conservée dans le calcul. L'export MS List contient des
  acronymes qui ne diffèrent que par elle — `SPOREFISH` et `Sporefish` sont
  deux projets distincts — et les replier produirait un identifiant en double.
- L'identifiant est posé à la création et n'est plus recalculé : corriger un
  acronyme ensuite ne le change pas.

Le champ `code_externe`, présent sur les mêmes entités, est là pour stocker
**la référence de l'ERP**. Il permet un rapprochement dans les deux sens et
n'est pas utilisé par l'application.

## Qui est maître de quoi

C'est la seule décision de fond, et elle doit être prise **avec l'éditeur**,
avant tout paramétrage. Trois données se recouvrent : le budget, les dates et
le statut d'un projet.

| Donnée | Proposition |
|---|---|
| Questions, problématiques, axes, idées, grappes, transferts, expertises | **Outil R&I**, sans discussion — l'ERP ne modélise pas cela |
| Budget consommé, temps passé, facturation | **ERP**, sans discussion |
| Acronyme, titre, dates, statut, budget prévisionnel, pilotes | **À trancher** |

Recommandation : une fois l'ERP en service, **lui laisser la main sur le budget
et les dates**, et garder dans l'outil R&I ce qu'il est seul à porter. La double
saisie budgétaire est la première chose qui tue l'adoption d'un outil.

Concrètement, cela veut dire qu'à terme les champs budgétaires deviendront
lisibles mais non modifiables dans l'outil R&I, alimentés depuis l'ERP. C'est
une évolution simple — un indicateur de provenance par champ — mais elle
suppose que la question ait été tranchée.

## Ouvrir l'accès, le moment venu

Rien n'est ouvert par défaut : le port de la base n'est pas publié.

1. Créer un utilisateur de lecture, avec un mot de passe qui n'est écrit nulle
   part dans le dépôt :

   ```sql
   CREATE ROLE furious LOGIN PASSWORD '<mot de passe fort>';
   GRANT lecture_integration TO furious;
   ```

   Le rôle `lecture_integration` existe déjà : il donne accès aux vues
   d'intégration et à rien d'autre. Vérification faite, un compte qui en hérite
   lit `integration.projets` mais se voit refuser la lecture des tables et
   toute écriture.

2. Publier le port de la base sur la seule adresse utile :

   ```bash
   ADRESSE_BASE=10.0.0.12 docker compose \
     -f docker-compose.yml -f docker-compose.integration.yml up -d
   ```

3. Restreindre au pare-feu à l'adresse du serveur ERP.

## Ce qu'il faut demander à l'éditeur, dès maintenant

La réponse à ces questions détermine le travail d'intégration. Autant l'avoir
avant que le paramétrage ne commence :

1. **Comment Furious consomme-t-il des données externes ?** Connexion SQL
   directe, appel d'API REST, import de fichiers déposés, ou connecteur
   spécifique ? Cela change tout le reste.
2. **Dans quel sens la synchronisation va-t-elle ?** Lecture seule depuis
   Furious, ou écriture en retour ?
3. **À quelle fréquence ?** Temps réel, quotidienne, à la demande ?
4. **Peut-il stocker une référence externe** (notre UUID) sur ses projets ?
   Sans cela, le rapprochement se fera sur l'acronyme — et les doublons de
   casse déjà repérés le rendront fragile.
5. **Modélise-t-il plusieurs pilotes et plusieurs financeurs par projet ?**
   Vos données en contiennent ; un modèle qui n'accepte qu'une valeur imposerait
   un choix arbitraire.

## Avant la bascule

- Rapprocher les 59 projets : renseigner `code_externe` depuis l'ERP, ou
  transmettre les UUID à l'éditeur.
- Trancher les deux paires d'acronymes en double (`SPOREFISH`/`Sporefish`,
  `AQE-Bc`/`AQE-BC`) : deux projets distincts ou un seul mal saisi.
- Vérifier que les statuts se correspondent. L'outil R&I en a quatre pour les
  projets ; l'ERP aura les siens.
