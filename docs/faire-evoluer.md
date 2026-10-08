# Faire évoluer l'application après la mise en service

Qui peut changer quoi, et par où ça passe. À lire une fois, avant la première
mise à jour.

---

## 1. Trois endroits, trois rôles

| Où | Ce qui s'y trouve | Durée de vie |
|---|---|---|
| **La session Claude** | un espace de travail jetable : une copie du code, de quoi compiler et tester | éphémère — le conteneur est recyclé, et tout ce qui n'a pas été poussé est perdu |
| **GitHub** (`microbiologames/RI_proj`, branche `claude/ri-projects-visualization-tool-6bmt2i`) | le code, et l'historique de ses modifications | durable — c'est **la** référence |
| **Le serveur ADRIA** | la base PostgreSQL : les projets, les questions, les idées, les partenaires, le journal | durable — c'est **le seul endroit** où vivent les données |

Deux conséquences qui répondent à la plupart des questions :

**Le serveur n'est pas un miroir figé.** Son code est un clone git de la
branche. Une mise à jour est un `git pull` suivi d'une reconstruction : le même
geste qu'à l'installation. Rien n'est gravé.

**Claude ne voit jamais les données réelles.** La session travaille sur une
copie des fichiers de départ, jamais sur la base du serveur. C'est voulu — les
données ne sortent pas du réseau — mais ça a un prix, traité au §5 : un
diagnostic qui dépend du contenu réel se fait en aveugle, avec ce que vous
rapportez.

---

## 2. Le cycle d'une modification

```
    vous décrivez        Claude modifie,        vous ou l'IT           l'équipe
    le besoin      →     teste, et pousse  →    mettez à jour     →    en dispose
                         sur GitHub             le serveur
```

1. **Vous décrivez le besoin** dans la session, en français, sans forme
   particulière. « La colonne budget devrait pouvoir être vide », « il faudrait
   un champ lien vers le dossier du projet ».
2. **Claude modifie le code, le compile, le teste, et pousse sur GitHub.** Rien
   n'atteint le serveur à ce stade : la branche change, le serveur ne bouge pas.
   C'est ce découplage qui permet de travailler sans accès au réseau.
3. **Quelqu'un met le serveur à jour.** Une commande, au §3.
4. **L'équipe recharge la page.** Les données sont inchangées ; c'est
   l'application qui a changé.

L'étape 3 est la seule qui demande un accès au serveur, et c'est la seule que
Claude ne peut pas faire. **C'est le seul verrou.**

---

## 3. Mettre le serveur à jour

Un script est fourni à la racine du dépôt. Il fait les choses dans l'ordre qui
protège : sauvegarde, puis mise à jour, puis vérification.

```bash
cd /opt/pilotage-ri
./mettre-a-jour.sh
```

Il refuse de continuer si la sauvegarde a échoué, ou si des fichiers ont été
modifiés sur le serveur — typiquement un `docker-compose.yml` adapté au
déploiement local, que le `git pull` écraserait. Dans ce cas il dit quoi faire.
À la fin, il affiche le dénombrement de la base et, en cas de problème, les deux
commandes pour revenir à l'état d'avant.

**Pourquoi la sauvegarde n'est pas facultative :** les évolutions de schéma
s'appliquent au démarrage de l'application. Une mise à jour peut donc ajouter
une colonne, une table, une contrainte — sur la vraie base. C'est ce qui rend
les mises à jour simples, et c'est ce qui les rend à sauvegarder d'abord.

---

## 4. Qui doit pouvoir lancer ce script

C'est la vraie question, et elle se tranche sans Claude.

### Option A — l'IT lance la mise à jour (état actuel)

Vous demandez, l'IT exécute. Rien à installer, rien à ouvrir.

Le défaut est la latence : chaque correction d'une colonne mal placée demande un
ticket. Pour les premières semaines, où les retours de l'équipe seront
fréquents et les corrections minuscules, c'est le frottement principal.

### Option B — vous lancez la mise à jour vous-même ✅ recommandé

Ce qu'il faut demander à l'IT, et c'est tout :

> un compte sur la VM `192.168.11.172`, membre du groupe `docker`, avec accès en
> écriture à `/opt/pilotage-ri`

Pas de droits root, pas d'accès au reste du réseau, pas de logiciel
supplémentaire. Vous vous connectez en SSH, vous lancez `./mettre-a-jour.sh`,
vous lisez le compte rendu. Le script est écrit pour ça : il vérifie à votre
place et refuse plutôt que d'abîmer.

C'est **l'option à demander** : elle supprime le verrou de l'étape 3 sans rien
ouvrir de plus que ce qui existe déjà.

### Option C — installer Claude Code sur le réseau

Techniquement possible, et à ne pas demander maintenant. Ce que ça apporterait :
un agent capable de lire la vraie base et de lancer les commandes lui-même —
donc de diagnostiquer ce que le §5 traite aujourd'hui en aveugle.

Ce que ça coûte : un accès sortant vers l'API Anthropic depuis le réseau
interne, un abonnement, et surtout un arbitrage de gouvernance — un agent qui
peut lire la base et exécuter des commandes sur la VM est un privilège, à
instruire comme tel, pas un outil qu'on installe en passant.

**À reconsidérer** si, après quelques mois, les options A ou B se révèlent
insuffisantes : beaucoup de diagnostics qui dépendent du contenu réel, ou une
charge d'évolution qui justifie l'automatisation. Pas avant d'en avoir la
preuve à l'usage.

---

## 5. Signaler un problème qui dépend des données

Claude ne voit pas la base. Un « ce projet s'affiche mal » n'est pas
diagnosticable tel quel ; les mêmes informations rendues utilisables :

- ce que vous faisiez, et ce que vous attendiez ;
- la réponse de `<adresse>/api/sante` — un copier-coller suffit ;
- la ligne concernée, telle qu'elle sort du bouton **⬇ Excel** de la page ;
- si c'est une erreur affichée, son texte exact ;
- au besoin, `docker compose logs --tail=50 app`.

`docs/depannage-a-distance.md` détaille les commandes et **ce qu'il ne faut
jamais coller** : aucun mot de passe, aucune clé d'API, aucun jeton. Le dépôt
est public, et une conversation n'est pas un coffre.

---

## 6. Ce qui ne demande aucune mise à jour

Beaucoup de choses se règlent dans l'application, par n'importe qui, sans
toucher au code :

- les libellés et les couleurs des quatre axes — page **Réglages** ;
- les types de financement, les labellisations, les expertises, les catégories
  de partenaire, les transitions alimentaires : ils se créent à la volée en les
  saisissant dans un champ d'autocomplétion ;
- l'équipe et ses expertises — page **Équipe** ;
- les colonnes affichées dans chaque tableau, et les filtres.

Une mise à jour de code ne sert qu'à ce qui touche la structure : un nouveau
champ, une nouvelle page, une règle de calcul, un export de plus.
