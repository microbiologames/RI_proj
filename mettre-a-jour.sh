#!/bin/bash
# Applique une mise à jour du code sur une installation serveur.
#
#   ./mettre-a-jour.sh
#
# Trois choses dans cet ordre, parce qu'il n'y en a pas de bon autre : une
# sauvegarde, puis la mise à jour, puis la vérification que la base a survécu.
# Les évolutions de schéma s'appliquent au démarrage de l'application : une
# mise à jour touche donc la vraie base, et c'est pour ça qu'on la sauvegarde
# avant et qu'on affiche de quoi revenir en arrière après.
#
# Ne touche jamais aux données : il ne fait que du git et du docker compose.
set -euo pipefail
cd "$(dirname "$0")"

bleu()  { printf '\n\033[1;34m%s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

if [ ! -f docker-compose.yml ]; then
  rouge "À lancer depuis le répertoire d'installation (celui qui contient docker-compose.yml)."
  exit 1
fi

# Un fichier modifié sur place serait écrasé par le git pull sans prévenir.
# C'est le cas quand l'IT a adapté docker-compose.yml : on s'arrête et on le dit.
if ! git diff --quiet || ! git diff --cached --quiet; then
  rouge "Des fichiers ont été modifiés sur ce serveur :"
  git --no-pager diff --name-only HEAD >&2
  rouge ""
  rouge "Le git pull les écraserait. Deux issues :"
  rouge "  · les mettre de côté :  git stash   (puis « git stash pop » après)"
  rouge "  · ou les garder :       git commit -am 'adaptations locales'"
  exit 1
fi

# POSTGRES_USER / POSTGRES_DB viennent du .env, comme pour le compose. On les
# lit sans exécuter le fichier : il contient le mot de passe de la base, et ce
# script n'en a pas besoin — pg_dump tourne dans le conteneur, en local.
lire_env() {
  [ -f .env ] || return 0
  sed -n "s/^[[:space:]]*$1=//p" .env | tail -n 1 | tr -d '\r\"'
}
UTILISATEUR="$(lire_env POSTGRES_USER)"; UTILISATEUR="${UTILISATEUR:-ri}"
BASE="$(lire_env POSTGRES_DB)";          BASE="${BASE:-ri_proj}"

AVANT="$(git rev-parse --short HEAD)"
DEST="${REPERTOIRE_SAUVEGARDES:-./sauvegardes}"

bleu "1/4 · Sauvegarde de la base avant toute chose"
mkdir -p "$DEST"
VIDAGE="$DEST/avant-maj-$(date +%F-%H%M).sql.gz"
docker compose exec -T db pg_dump -U "$UTILISATEUR" "$BASE" | gzip > "$VIDAGE"
# Un pg_dump qui échoue en milieu de course laisse un fichier court mais non
# vide : on vérifie la taille plutôt que le seul code de retour.
if [ "$(stat -c %s "$VIDAGE")" -lt 10000 ]; then
  rouge "La sauvegarde ne fait que $(stat -c %s "$VIDAGE") octets — c'est trop peu."
  rouge "La base est-elle démarrée ? « docker compose ps ». Mise à jour interrompue."
  exit 1
fi
echo "   $VIDAGE  ($(du -h "$VIDAGE" | cut -f1))"

bleu "2/4 · Récupération du code"
git pull --ff-only
APRES="$(git rev-parse --short HEAD)"
if [ "$AVANT" = "$APRES" ]; then
  echo "   Déjà à jour ($APRES). Rien à reconstruire."
  exit 0
fi
git --no-pager log --oneline "$AVANT..$APRES"

bleu "3/4 · Reconstruction et redémarrage"
docker compose up -d --build

bleu "4/4 · Vérification"
PORT_PUBLIE="$(docker compose port app 8080 2>/dev/null | sed 's/.*://')"
URL="http://localhost:${PORT_PUBLIE:-8080}/api/sante"
for _ in $(seq 1 30); do
  REPONSE="$(curl -sf --max-time 3 "$URL" || true)"
  [ -n "$REPONSE" ] && break
  sleep 2
done

if [ -z "${REPONSE:-}" ]; then
  rouge "L'application ne répond pas sur $URL après 60 s."
  rouge "  Journaux :   docker compose logs --tail=50 app"
  rouge "  Revenir en arrière :"
  rouge "    git checkout $AVANT && docker compose up -d --build"
  rouge "    gunzip -c $VIDAGE | docker compose exec -T db psql -U $UTILISATEUR -d $BASE"
  exit 1
fi

echo "   $REPONSE"
case "$REPONSE" in
  *'"donnees":"importees"'*)
    bleu "Mise à jour appliquée : $AVANT → $APRES. La base a ses données."
    echo "La sauvegarde reste dans $DEST, à garder le temps de vérifier l'application."
    ;;
  *)
    rouge "L'application répond mais la base est vide."
    rouge "  Si c'est une première installation : voir docs/mise-en-service.md"
    rouge "  Sinon, restaurer :"
    rouge "    gunzip -c $VIDAGE | docker compose exec -T db psql -U $UTILISATEUR -d $BASE"
    exit 1
    ;;
esac
