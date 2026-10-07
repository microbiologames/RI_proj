# Charger les données dans une installation neuve

À lire quand l'application s'affiche mais qu'elle est vide.

C'est le comportement attendu, pas une panne. Le démarrage crée les tables et
sème les référentiels — les 4 axes, les statuts, les types de financement. Il
**ne charge pas les données** : l'import est une étape explicite, à lancer une
fois, parce qu'il écrase un état et qu'on ne veut pas qu'un simple redémarrage
puisse le déclencher.

---

## 1. Confirmer le diagnostic depuis un navigateur

Ouvrir `<adresse de l'application>/api/sante` — par exemple
`http://192.168.11.172:8082/api/sante`. La réponse dit tout :

```json
{"statut":"ok","donnees":"absentes",
 "contenu":{"projets":0,"idees":0,"questions":0,"partenaires":0,"personnes":0,"axes":4}}
```

- `axes: 4` et le reste à zéro → l'application et la base fonctionnent, il
  manque l'import. C'est le cas traité ici.
- `axes: 0` également → les migrations ne sont pas passées. Voir les journaux :
  `docker compose logs app`.
- Pas de réponse du tout → ce n'est pas un problème de données.

---

## 2. Les deux fichiers source

L'import en demande deux, et deux seulement :

| Fichier | Contenu |
|---|---|
| `Données de contexte feuille de route RI.xlsx` | 5 onglets : `Equipe R&I`, `Expertises`, `Partenaires`, `Projets`, `Feuille de route Master` |
| `Questions de recherche.csv` | l'export des questions de recherche |

**Aucun nouvel export de Microsoft List n'est nécessaire.** L'onglet `Projets`
du classeur *est* un export brut de la liste — ses colonnes `Title`,
`Type d'élément` et `Chemin d'accès` le signent. Les deux fichiers déjà
constitués suffisent.

La seule raison de refaire un export : **la liste a bougé depuis**. Dans ce
cas, exporter la liste en CSV, ouvrir le classeur, et remplacer le contenu de
l'onglet `Projets` par le nouvel export — en gardant le nom de l'onglet et la
ligne d'en-têtes. Ne pas créer un onglet supplémentaire : l'import cherche les
5 noms ci-dessus, exactement.

Ces fichiers ne sont pas dans le dépôt de code, et ne doivent pas y entrer :
ils contiennent des budgets et des partenariats. Ils se transmettent
directement (clé USB, partage interne).

---

## 3. Déposer les fichiers sur le serveur

Le `docker-compose.yml` du dépôt monte un répertoire prévu pour ça :

```bash
cd /opt/pilotage-ri        # ou le répertoire qui contient votre compose
mkdir -p donnees-source
# y copier les deux fichiers, sans les renommer
ls -l donnees-source/
```

Vérifier que le montage est bien actif — il a pu disparaître si le
`docker-compose.yml` a été adapté au déploiement local :

```bash
docker compose exec app ls /app/donnees-source
```

Si la commande liste les deux fichiers, passer au §4.

**Si elle répond que le répertoire n'existe pas**, le montage n'est pas là.
Deux solutions, l'une ou l'autre :

```bash
# a) rétablir le montage dans docker-compose.yml, service « app » :
#      volumes:
#        - ./donnees-source:/app/donnees-source:ro
#    puis
docker compose up -d

# b) ou copier les fichiers directement dans le conteneur, sans le recréer :
docker compose cp "donnees-source/Données de contexte feuille de route RI.xlsx" \
  app:/app/donnees-source/contexte.xlsx
docker compose cp "donnees-source/Questions de recherche.csv" \
  app:/app/donnees-source/questions.csv
```

La solution (b) est plus rapide mais les fichiers disparaissent au prochain
`docker compose up --build`. Ce n'est pas grave : ils ne servent qu'une fois.

> **Nom du service.** Les commandes ci-dessous disent `app`, le nom du service
> dans le dépôt. Si le compose a été renommé, `docker compose ps` donne le bon
> nom, et un `docker exec -it <conteneur> …` fonctionne aussi bien.

---

## 4. Lancer l'import — simulation d'abord

La simulation **n'écrit rien**. Elle lit les fichiers et imprime ce qu'elle
ferait. C'est le moment de vérifier les chemins et les comptes.

```bash
cd /opt/pilotage-ri
docker compose exec app node dist/import-adria.js \
  "/app/donnees-source/Données de contexte feuille de route RI.xlsx" \
  "/app/donnees-source/Questions de recherche.csv"
```

Compte rendu attendu :

```
Lu :
  11 collaborateurs · 18 expertises · 35 partenaires
  69 lignes projets · 11 lignes de feuille de route · 66 questions

Ce que ferait l'import :
  · 11 collaborateurs, 18 expertises
  · 35 partenaires
  · 59 projets
  · 10 idées brutes (statuts non validés) : MEDAL, Allergènes, OTOP, …
  · 66 questions de recherche
  · 35 problématiques distinctes, 35 avec un axe proposé
  · localisations : 10 recherche_web, 6 deduite_du_nom, 15 estimee, 4 sans_lieu
```

69 lignes projets donnent 59 projets et 10 idées brutes : les idées sont les
lignes dont le statut n'est pas validé — en attente de CODIR ou de financement.
C'est la règle décidée au cahier des charges, pas une perte.

## 5. Puis écrire

```bash
docker compose exec app node dist/import-adria.js \
  "/app/donnees-source/Données de contexte feuille de route RI.xlsx" \
  "/app/donnees-source/Questions de recherche.csv" --appliquer
```

Le script se termine sur 6 points d'attention. **Ils sont normaux et attendus**,
ce ne sont pas des erreurs :

| Point | Ce qu'il faut en faire |
|---|---|
| 3 pilotes absents de l'onglet Équipe (Huchet Veronique, Guillaume GILLOT, Jonathan THEVENOT) | Créés hors équipe R&I. Rien à faire si c'est juste. |
| `AQE-Bc` / `AQE-BC` | Deux projets créés. Nicolas tranche : même projet → fusionner dans l'application. |
| `SPOREFISH` / `Sporefish` | Idem. |
| 27 projets sans axe | Attendu : l'axe vient des questions de recherche, et ces projets n'en ont aucune. À qualifier depuis la page **Qualification**. |

## 6. Vérifier

Recharger `<adresse>/api/sante` :

```json
{"statut":"ok","donnees":"importees",
 "contenu":{"projets":59,"idees":10,"questions":66,
            "partenaires":104,"personnes":15,"axes":4}}
```

Ces six nombres sont les bons. `partenaires: 104` = 35 du référentiel + 69
cités par les projets et créés sans localisation. `personnes: 15` = 11 de
l'équipe R&I + 4 pilotes hors équipe.

Puis ouvrir l'application : les tableaux sont remplis.

---

## 7. Si l'import a été lancé deux fois

Les référentiels se dédoublonnent sur leur clé naturelle, mais les questions de
recherche et les idées brutes n'en ont pas : un second `--appliquer` les
ajouterait une deuxième fois. **Le script le refuse** et le dit :

```
La base contient déjà des données : 59 projets, 132 questions, 20 idées brutes.
```

Pour repartir propre — en acceptant de **perdre toutes les saisies faites
depuis l'application** :

```bash
docker compose exec app node dist/import-adria.js \
  "/app/donnees-source/Données de contexte feuille de route RI.xlsx" \
  "/app/donnees-source/Questions de recherche.csv" --appliquer --vider
```

À ce stade de la mise en service, il n'y a rien à perdre. Plus tard, faire un
vidage de sauvegarde d'abord (`docs/deploiement-serveur-interne.md` §7).

---

## 8. Ensuite

Le répertoire `donnees-source/` ne sert plus. Les données vivent dans la base,
et c'est l'application qui les modifie — plus Microsoft List, plus Excel. Les
fichiers peuvent rester sur le serveur comme trace de l'état de départ, ou être
retirés.

Le travail qui reste est de la saisie métier, pas de l'installation :

1. valider les 35 propositions d'axe par problématique (page **Qualification**) ;
2. qualifier les 27 projets restés sans axe ;
3. vérifier les 15 villes de partenaires marquées `estimee` (page **Partenaires**,
   colonne *source de localisation*) ;
4. trancher les deux doublons de casse.
