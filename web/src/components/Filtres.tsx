import { useMemo, useState } from 'react';
import { normaliser } from '../lib/utils';

/** Au-delà de ce nombre, les valeurs d'une facette sont repliées. */
const SEUIL_CHIPS = 8;

export interface Facette<T> {
  cle: string;
  etiquette: string;
  /** Valeurs portées par une ligne (une entité peut relever de plusieurs axes). */
  valeurs: (ligne: T) => Array<{ id: string; libelle: string; couleur?: string }>;
}

export type EtatFiltres = Record<string, string[]>;

/**
 * Filtres « chips dynamiques » : les options proposées et leurs effectifs sont
 * recalculés à partir des lignes qui passent les AUTRES facettes, de sorte
 * qu'aucune combinaison ne mène à un tableau vide par surprise. Une chip à 0
 * reste affichée si elle est sélectionnée, pour pouvoir la désélectionner.
 */
export function BarreFiltres<T>({
  lignes,
  facettes,
  etat,
  onChanger,
  recherche,
  onRecherche,
  placeholderRecherche = 'Rechercher…',
  extras,
}: {
  lignes: T[];
  facettes: Facette<T>[];
  etat: EtatFiltres;
  onChanger: (e: EtatFiltres) => void;
  recherche: string;
  onRecherche: (v: string) => void;
  placeholderRecherche?: string;
  extras?: React.ReactNode;
}) {
  const [deplies, setDeplies] = useState<string[]>([]);

  const options = useMemo(() => {
    const parFacette: Record<string, Array<{ id: string; libelle: string; couleur?: string; n: number }>> = {};
    for (const f of facettes) {
      // Lignes retenues par toutes les facettes SAUF celle-ci.
      const autres = lignes.filter((l) =>
        facettes.every((g) => {
          if (g.cle === f.cle) return true;
          const choisis = etat[g.cle] ?? [];
          if (choisis.length === 0) return true;
          return g.valeurs(l).some((v) => choisis.includes(v.id));
        }),
      );
      const compte = new Map<string, { id: string; libelle: string; couleur?: string; n: number }>();
      for (const l of autres) {
        for (const v of f.valeurs(l)) {
          const e = compte.get(v.id);
          if (e) e.n += 1;
          else compte.set(v.id, { ...v, n: 1 });
        }
      }
      // Les valeurs sélectionnées mais devenues vides restent visibles (sinon on ne peut plus les retirer).
      for (const id of etat[f.cle] ?? []) {
        if (!compte.has(id)) {
          const trouvee = lignes.flatMap((l) => f.valeurs(l)).find((v) => v.id === id);
          compte.set(id, { id, libelle: trouvee?.libelle ?? id, couleur: trouvee?.couleur, n: 0 });
        }
      }
      parFacette[f.cle] = [...compte.values()].sort(
        (a, b) => b.n - a.n || a.libelle.localeCompare(b.libelle, 'fr'),
      );
    }
    return parFacette;
  }, [lignes, facettes, etat]);

  const nbActifs = Object.values(etat).reduce((n, v) => n + v.length, 0);

  return (
    <div className="barre-filtres">
      <input
        className="recherche"
        type="search"
        value={recherche}
        placeholder={placeholderRecherche}
        aria-label={placeholderRecherche}
        onChange={(e) => onRecherche(e.target.value)}
      />
      {facettes.map((f) => {
        const choisis = etat[f.cle] ?? [];
        const toutes = options[f.cle] ?? [];
        // Une facette sans aucune valeur n'a rien à filtrer : on masque le groupe.
        if (toutes.length === 0) return null;
        // Les facettes à longue traîne (partenaires, pilotes) sont repliées :
        // au-delà du seuil, les valeurs les moins fréquentes sont masquées
        // derrière un « +N », mais une valeur sélectionnée reste toujours visible.
        const deplie = deplies.includes(f.cle);
        const visibles = deplie ? toutes : toutes.filter((o, i) => i < SEUIL_CHIPS || choisis.includes(o.id));
        const masquees = toutes.length - visibles.length;
        return (
          <div className="groupe-filtre" key={f.cle}>
            <span className="etiquette-groupe">{f.etiquette}</span>
            {visibles.map((o) => {
              const actif = choisis.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  className="chip"
                  aria-pressed={actif}
                  onClick={() =>
                    onChanger({
                      ...etat,
                      [f.cle]: actif ? choisis.filter((c) => c !== o.id) : [...choisis, o.id],
                    })
                  }
                >
                  {o.couleur && <span className="pastille" style={{ background: o.couleur }} />}
                  {o.libelle}
                  <span className="n">{o.n}</span>
                </button>
              );
            })}
            {masquees > 0 && (
              <button
                type="button"
                className="chip"
                onClick={() => setDeplies([...deplies, f.cle])}
                title={`Afficher les ${masquees} valeurs restantes`}
              >
                +{masquees}
              </button>
            )}
            {deplie && toutes.length > SEUIL_CHIPS && (
              <button type="button" className="chip" onClick={() => setDeplies(deplies.filter((c) => c !== f.cle))}>
                −
              </button>
            )}
          </div>
        );
      })}
      {extras}
      {(nbActifs > 0 || recherche) && (
        <button
          type="button"
          className="btn btn-fantome btn-s pousse-droite"
          onClick={() => {
            onChanger({});
            onRecherche('');
          }}
        >
          Réinitialiser ({nbActifs + (recherche ? 1 : 0)})
        </button>
      )}
    </div>
  );
}

/** Applique les filtres et la recherche plein texte à une liste. */
export function appliquerFiltres<T>(
  lignes: T[],
  facettes: Facette<T>[],
  etat: EtatFiltres,
  recherche: string,
  champsRecherche: (l: T) => Array<string | null | undefined>,
): T[] {
  const q = normaliser(recherche);
  return lignes.filter((l) => {
    for (const f of facettes) {
      const choisis = etat[f.cle] ?? [];
      if (choisis.length === 0) continue;
      if (!f.valeurs(l).some((v) => choisis.includes(v.id))) return false;
    }
    if (!q) return true;
    return champsRecherche(l).some((c) => c && normaliser(c).includes(q));
  });
}
