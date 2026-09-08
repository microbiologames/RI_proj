# Démonstration autonome

Page unique qui embarque l'application et un instantané de la base : elle
s'ouvre sans serveur ni installation, ce qui permet de faire circuler l'outil
avant qu'il ne soit déployé.

L'application est celle de `web/src`, sans modification. Seuls trois éléments
sont propres à la démonstration :

| Fichier | Rôle |
|---|---|
| `serveur-memoire.ts` | Intercepte `fetch` : les lectures viennent de l'instantané, les écritures s'y appliquent en mémoire. Reproduit la propagation des axes et la suggestion de pilote. |
| `main-demo.tsx` | Bannière d'avertissement, routage en mémoire, et message explicatif quand un export est bloqué par le bac à sable. |
| `donnees.json` | Instantané des réponses de l'API. |

Passer par `fetch` plutôt que par un jeu de données figé garantit que ce qui est
montré — filtres, recalculs, propagation — est le comportement réel.

## Régénérer

Base et API démarrées, puis :

```bash
# 1. instantané des données
python3 - <<'PY'
import json, urllib.request
def get(c):
    with urllib.request.urlopen(f'http://localhost:8080/api{c}') as r: return json.load(r)
chemins = ['/referentiels', '/questions', '/idees', '/projets', '/partenaires',
           '/transferts', '/grappes', '/problematiques', '/feuille-de-route',
           '/qualification/etat', '/equipe', '/equipe/expertises', '/journal?limite=300']
donnees = {c: get(c) for c in chemins}
donnees['/adm/etat'] = {'disponible': False, 'modele': 'claude-opus-5'}
json.dump(donnees, open('web/demo/donnees.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
PY

# 2. construction en fichier unique
cd web && npx vite build --config vite.demo.config.ts

# 3. assemblage : CSS et JS inline dans un seul .html
```

L'étape 3 concatène `dist-demo/assets/*.css` et `*.js` dans un fichier sans
`<html>` ni `<body>` (l'hébergeur les ajoute), en échappant `</script` dans le
JS.

## Limites, à annoncer avec le lien

- Les modifications ne sont pas enregistrées : rechargement = état initial.
- Les exports Excel et PNG sont bloqués par le bac à sable de la page publiée ;
  un message le dit au clic. Ils fonctionnent dans l'outil installé.
- Le fond des cartes ne se charge pas (domaine externe bloqué) ; les points
  restent positionnés.
- Le module d'acquisition par IA est inactif : il demande une clé côté serveur.
- **L'instantané contient les budgets et les partenariats réels.** La page est
  privée par défaut ; c'est le partage explicite qui la rend accessible.
