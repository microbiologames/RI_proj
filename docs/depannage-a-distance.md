# Travailler avec Claude sans lui donner accès au serveur

Claude n'a **aucun accès** au réseau ADRIA, au serveur, ni à la base. Il ne peut
ni se connecter, ni exécuter une commande, ni voir un écran. Tout passe par
vous : il propose des commandes, vous ou l'IT les exécutez, vous rapportez ce
qui s'est affiché.

Ce n'est pas une limite gênante pour ce projet — l'installation tient en quatre
commandes — mais la boucle marche bien mieux si elle est respectée.

## La boucle

1. Vous décrivez le problème, avec ce que vous attendiez et ce qui s'est passé.
2. Claude propose **une** commande de diagnostic, en expliquant ce qu'elle
   cherche.
3. Vous l'exécutez et collez **la sortie complète**.
4. Claude interprète et propose la correction.

Une commande à la fois. Trois commandes envoyées ensemble donnent trois sorties
mélangées, et le diagnostic s'égare.

## Ce qui fait gagner du temps

**Coller du texte, pas des captures d'écran.** Un message d'erreur en texte est
lisible, cherchable et complet ; une capture coupe souvent la ligne utile.

**Coller la sortie entière**, y compris ce qui semble sans intérêt. La cause
d'une erreur Docker est souvent quinze lignes au-dessus du message final.

**Dire ce qui a changé.** « Ça marchait vendredi, l'IT a mis à jour le serveur
lundi » vaut mieux que dix commandes de diagnostic.

**Les trois commandes qui répondent à la plupart des questions :**

```bash
cd /opt/pilotage-ri
docker compose ps                     # les conteneurs tournent-ils ?
docker compose logs --tail=50 app     # que dit l'application ?
curl -s http://localhost:8080/api/sante   # répond-elle ?
```

## Ce qu'il ne faut jamais coller

**Aucun mot de passe, aucune clé d'API, aucun jeton.** Ni celui de la base, ni
une clé Anthropic, ni un identifiant de compte de service.

Si une commande de diagnostic risque d'en afficher un — `cat .env`,
`docker compose config`, `env` —, remplacez la valeur par `***` avant de coller.
Claude n'a jamais besoin de connaître un secret pour diagnostiquer : ce qui
compte est de savoir si la variable est **définie**, pas ce qu'elle contient.

```bash
# À la place de « cat .env » :
sed -E 's/=(.+)/=***/' .env
```

Même chose pour les adresses IP internes et les noms de serveurs si votre
politique les considère comme sensibles — remplacez-les, la logique du
diagnostic reste valable.

## Le dépôt est public

Le code est ouvert ; **les données ne le sont pas** et n'y transitent jamais.
Deux conséquences pratiques :

- Les valeurs par défaut du dépôt sont connues de tous. C'est pourquoi
  l'application refuse de démarrer tant que le mot de passe de la base est resté
  celui du modèle.
- Un secret commité par mégarde serait public à la seconde près. Le hook
  `.githooks/pre-commit` l'empêche en local (`git config core.hooksPath .githooks`
  une fois par clone) ; la push protection de GitHub prend le relais côté serveur.

Si malgré tout un secret part dans un commit : le révoquer **d'abord**, le
retirer de l'historique ensuite. Un secret publié puis supprimé reste un secret
publié.

## Qui fait quoi

| Tâche | Qui |
|---|---|
| Fournir la VM, Docker, le DNS, le pare-feu | IT |
| Installation et premier démarrage | IT, avec le dossier de déploiement |
| Sauvegardes et restauration testée | IT |
| Chargement des données, mises à jour applicatives | vous ou l'IT |
| Usage quotidien, validation des axes, saisie | vous et l'équipe |
| Diagnostic, corrections de code, évolutions | Claude, via vous |

L'IT n'a **pas** besoin de lire le code ni de dialoguer avec Claude. Le dossier
de déploiement est écrit pour être suivi tel quel.

## Faire évoluer l'application

Les corrections et évolutions sont poussées dans le dépôt GitHub. Pour les
appliquer sur le serveur :

```bash
cd /opt/pilotage-ri
docker compose exec -T db pg_dump -U ri ri_proj | gzip > /tmp/avant-maj.sql.gz
docker compose down
git pull
docker compose up -d --build
curl -s http://localhost:8080/api/sante
```

Le vidage préalable n'est pas une précaution de principe : les évolutions de
schéma s'appliquent automatiquement au démarrage et ne se défont pas.

## Si quelque chose tourne mal

L'application ne détient rien d'irremplaçable : tout est dans la base. Dans
l'ordre de gravité croissante —

```bash
docker compose restart app            # l'application ne répond plus
docker compose down && docker compose up -d --build   # après une mise à jour ratée
# et si la base elle-même est en cause : restaurer un vidage (dossier IT, §7)
```

Aucune de ces opérations ne perd de données, à l'exception de la dernière, qui
ramène à l'état du vidage choisi.
