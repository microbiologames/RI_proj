#!/usr/bin/env bash
# Lance l'outil de pilotage R&I sur ce poste : base de données, application,
# et premier import si la base est vide. À relancer autant de fois que voulu.
set -uo pipefail
cd "$(dirname "$0")"

BLEU='\033[1;34m'; VERT='\033[0;32m'; ROUGE='\033[0;31m'; GRIS='\033[0;90m'; FIN='\033[0m'
etape() { printf "${BLEU}%s${FIN}\n" "$1"; }
ok()    { printf "${VERT}  ✓ %s${FIN}\n" "$1"; }
souci() { printf "${ROUGE}  ✗ %s${FIN}\n" "$1"; }
note()  { printf "${GRIS}    %s${FIN}\n" "$1"; }

echo
echo "  Outil de pilotage des projets R&I"
echo "  ---------------------------------"
echo

# --- Docker ----------------------------------------------------------------
etape "1/4  Vérification de Docker"
if ! command -v docker >/dev/null 2>&1; then
  souci "Docker n'est pas installé sur ce poste."
  note "Installez Docker Desktop : https://www.docker.com/products/docker-desktop"
  note "Puis relancez ce script."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  souci "Docker est installé mais ne tourne pas."
  note "Ouvrez Docker Desktop, attendez qu'il affiche « Engine running », puis relancez."
  exit 1
fi
ok "Docker est prêt"

# Selon la version : « docker compose » ou « docker-compose ».
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi

# Mot de passe de la base, tiré au hasard au premier démarrage. Le dépôt étant
# public, la valeur par défaut l'est aussi : l'application refuse de démarrer
# avec elle.
if [ ! -f .env ]; then
  MDP=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
  cp .env.example .env
  if sed --version >/dev/null 2>&1; then
    sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$MDP/" .env
  else
    sed -i '' "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$MDP/" .env   # BSD sed (macOS)
  fi
  ok "Fichier .env créé, mot de passe de la base tiré au hasard"
fi

# --- Démarrage -------------------------------------------------------------
etape "2/4  Démarrage de l'application"
note "La toute première fois, la construction prend quelques minutes."
if ! $COMPOSE up -d --build; then
  souci "Le démarrage a échoué. Le détail est au-dessus."
  exit 1
fi
ok "Conteneurs démarrés"

# --- Attente ---------------------------------------------------------------
etape "3/4  Attente de l'application"
for i in $(seq 1 90); do
  if curl -sf http://localhost:8080/api/sante >/dev/null 2>&1; then break; fi
  sleep 1
  if [ "$i" -eq 90 ]; then
    souci "L'application n'a pas répondu après 90 secondes."
    note "Voir les journaux : $COMPOSE logs app"
    exit 1
  fi
done
ok "Application en ligne"

# --- Premier import --------------------------------------------------------
etape "4/4  Données"
NB=$(curl -sf http://localhost:8080/api/projets | tr ',' '\n' | grep -c '"acronyme"' || echo 0)

if [ "$NB" -gt 0 ]; then
  ok "$NB projets déjà en base"
else
  XLSX=$(find donnees-source -maxdepth 1 -iname '*.xlsx' ! -name '~$*' 2>/dev/null | head -1)
  CSV=$(find donnees-source -maxdepth 1 -iname '*.csv' 2>/dev/null | head -1)

  if [ -n "$XLSX" ] && [ -n "$CSV" ]; then
    note "Import de $(basename "$XLSX") et $(basename "$CSV")…"
    if $COMPOSE exec -T app node dist/import-adria.js \
         "/app/donnees-source/$(basename "$XLSX")" \
         "/app/donnees-source/$(basename "$CSV")" --appliquer; then
      ok "Données chargées"
    else
      souci "L'import a échoué — l'application reste utilisable, base vide."
    fi
  else
    note "Base vide, et aucun fichier trouvé dans donnees-source/."
    note "Déposez-y le classeur .xlsx et l'export .csv, puis relancez ce script."
  fi
fi

# --- Ouverture -------------------------------------------------------------
URL="http://localhost:8080"
echo
printf "  ${VERT}L'outil est accessible sur ${FIN}%s\n" "$URL"
echo
note "Pour l'arrêter    : $COMPOSE down"
note "Les données sont conservées entre deux démarrages."
echo

if   command -v open    >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
fi
