import { useMemo, useState } from 'react';

export interface BarreDonnee {
  cle: string;
  libelle: string;
  valeur: number;
  couleur?: string;
}

/**
 * Histogramme horizontal : y = catégorie, x = nombre. L'orientation horizontale
 * évite de faire pivoter des libellés longs (« En préparation », noms de
 * partenaires…), qui deviennent illisibles en vertical.
 *
 * Un seul jeu de valeurs, donc pas de légende : le titre du panneau nomme la
 * série. Chaque barre porte sa valeur en clair.
 */
export function Histogramme({
  donnees,
  couleurParDefaut = 'var(--accent)',
  unite = 'entrée',
  onCliquer,
  cleActive,
}: {
  donnees: BarreDonnee[];
  couleurParDefaut?: string;
  unite?: string;
  onCliquer?: (cle: string) => void;
  cleActive?: string[];
}) {
  const [survol, setSurvol] = useState<{ x: number; y: number; d: BarreDonnee } | null>(null);
  const max = useMemo(() => Math.max(1, ...donnees.map((d) => d.valeur)), [donnees]);

  if (donnees.length === 0) return <p className="attenue petit">Aucune donnée à représenter.</p>;

  return (
    <div style={{ position: 'relative' }}>
      <div className="pile" style={{ gap: 6 }}>
        {donnees.map((d) => {
          const actif = !cleActive || cleActive.length === 0 || cleActive.includes(d.cle);
          return (
            <div
              key={d.cle}
              onMouseMove={(e) => setSurvol({ x: e.clientX, y: e.clientY, d })}
              onMouseLeave={() => setSurvol(null)}
              onClick={() => onCliquer?.(d.cle)}
              style={{ cursor: onCliquer ? 'pointer' : 'default', opacity: actif ? 1 : 0.4 }}
            >
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 8,
                  fontSize: 12, color: 'var(--texte-2)', marginBottom: 2,
                }}
              >
                <span className="tronque" title={d.libelle}>{d.libelle}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--texte)' }}>
                  {d.valeur}
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(d.valeur / max) * 100}%`,
                    height: '100%',
                    minWidth: d.valeur > 0 ? 3 : 0,
                    background: d.couleur ?? couleurParDefaut,
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {survol && (
        <div className="infobulle" style={{ left: survol.x + 12, top: survol.y + 12 }}>
          <strong>{survol.d.libelle}</strong>
          {survol.d.valeur} {unite}
          {survol.d.valeur > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
