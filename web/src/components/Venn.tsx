import { useMemo, useRef, useState } from 'react';
import type { Axe } from '../lib/types';
import { couleurAxe, useThemeSombre } from '../lib/utils';

/**
 * Diagramme de Venn à 4 ensembles.
 *
 * Quatre cercles ne peuvent pas produire les 15 régions d'un Venn à 4 : la
 * figure canonique utilise quatre ellipses inclinées, c'est celle dessinée ici.
 * Les ensembles sont tracés en CONTOUR (pas en aplat) : superposer quatre
 * aplats colorés rendrait les intersections illisibles et ferait reposer la
 * lecture sur des couleurs indistinguables. Ici l'effectif de chaque région est
 * écrit en chiffres et chaque ellipse porte son étiquette — la couleur n'est
 * qu'un repère secondaire.
 */

interface Element {
  id: number;
  axes: Array<Pick<Axe, 'id' | 'code' | 'libelle' | 'couleur' | 'couleur_sombre'>>;
}

/**
 * Les 4 ellipses du Venn canonique (construction de Venn, 1880) : quatre
 * ellipses identiques inclinées à ±35°, la seule disposition qui produise
 * réellement les 15 régions. Emprise x 4→96, y 17→79 dans ce repère.
 */
const ELLIPSES = [
  { cx: 35, cy: 53, rx: 35, ry: 20, rot: 35 },
  { cx: 45, cy: 43, rx: 35, ry: 20, rot: 35 },
  { cx: 55, cy: 43, rx: 35, ry: 20, rot: -35 },
  { cx: 65, cy: 53, rx: 35, ry: 20, rot: -35 },
];

/**
 * Étiquettes posées aux quatre coins, hors de l'emprise de la figure : chaque
 * coin est du côté de la région exclusive de son ensemble (ensemble 1 à
 * gauche-bas, 2 en haut-gauche, 3 en haut-droite, 4 à droite-bas).
 */
const ETIQUETTES = [
  { x: 2, y: 93, ancre: 'start' as const },
  { x: 2, y: 14, ancre: 'start' as const },
  { x: 98, y: 14, ancre: 'end' as const },
  { x: 98, y: 93, ancre: 'end' as const },
];

function dansEllipse(x: number, y: number, e: (typeof ELLIPSES)[number]): boolean {
  const a = (-e.rot * Math.PI) / 180;
  const dx = x - e.cx;
  const dy = y - e.cy;
  const u = dx * Math.cos(a) - dy * Math.sin(a);
  const v = dx * Math.sin(a) + dy * Math.cos(a);
  return (u * u) / (e.rx * e.rx) + (v * v) / (e.ry * e.ry) <= 1;
}

/**
 * Centre de chaque région, calculé plutôt que codé en dur : on échantillonne
 * le plan, on classe chaque point par le masque des ellipses qui le
 * contiennent, puis on retient le point de la région le plus proche de son
 * barycentre — un barycentre peut tomber hors d'une région en croissant.
 * La géométrie étant constante, ce calcul n'a lieu qu'une fois.
 */
const REGIONS: Record<number, { x: number; y: number }> = (() => {
  const points = new Map<number, Array<[number, number]>>();
  for (let x = 0; x <= 100; x += 0.5) {
    for (let y = 0; y <= 100; y += 0.5) {
      let masque = 0;
      for (let i = 0; i < ELLIPSES.length; i += 1) if (dansEllipse(x, y, ELLIPSES[i]!)) masque |= 1 << i;
      if (masque === 0) continue;
      const liste = points.get(masque);
      if (liste) liste.push([x, y]);
      else points.set(masque, [[x, y]]);
    }
  }

  const centres: Record<number, { x: number; y: number }> = {};
  for (const [masque, liste] of points) {
    const bx = liste.reduce((s, p) => s + p[0], 0) / liste.length;
    const by = liste.reduce((s, p) => s + p[1], 0) / liste.length;
    let meilleur = liste[0]!;
    let distance = Infinity;
    for (const p of liste) {
      const d = (p[0] - bx) ** 2 + (p[1] - by) ** 2;
      if (d < distance) {
        distance = d;
        meilleur = p;
      }
    }
    centres[masque] = { x: meilleur[0], y: meilleur[1] };
  }
  return centres;
})();

export function DiagrammeVenn({
  elements,
  axes,
  titreZeroAxe = 'sans axe',
  onCliquerRegion,
}: {
  elements: Element[];
  axes: Axe[];
  titreZeroAxe?: string;
  onCliquerRegion?: (idsAxes: number[]) => void;
}) {
  const sombre = useThemeSombre();
  const svg = useRef<SVGSVGElement>(null);
  const [bulle, setBulle] = useState<{ x: number; y: number; titre: string; texte: string } | null>(null);

  // Le Venn n'est dessinable que pour 4 ensembles au plus.
  const retenus = axes.slice(0, 4);

  const { comptes, orphelins } = useMemo(() => {
    const c = new Map<number, number>();
    let sansAxe = 0;
    for (const e of elements) {
      let masque = 0;
      for (const a of e.axes) {
        const i = retenus.findIndex((r) => r.id === a.id);
        if (i >= 0) masque |= 1 << i;
      }
      if (masque === 0) sansAxe += 1;
      else c.set(masque, (c.get(masque) ?? 0) + 1);
    }
    return { comptes: c, orphelins: sansAxe };
  }, [elements, retenus]);

  function survol(evt: React.MouseEvent, masque: number, n: number) {
    const noms = retenus.filter((_, i) => masque & (1 << i)).map((a) => a.libelle);
    setBulle({
      x: evt.clientX,
      y: evt.clientY,
      titre: `${n} ${n > 1 ? 'entrées' : 'entrée'}`,
      texte: noms.length > 1 ? `À l'intersection de : ${noms.join(' · ')}` : (noms[0] ?? ''),
    });
  }

  if (retenus.length === 0) return <p className="attenue petit">Aucun axe de recherche défini.</p>;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svg}
        viewBox="0 8 100 88"
        role="img"
        aria-label={`Répartition par axe de recherche : ${retenus
          .map((a) => `${a.libelle} ${effectifTotal(comptes, retenus.indexOf(a))}`)
          .join(', ')}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        onMouseLeave={() => setBulle(null)}
      >
        {retenus.map((axe, i) => {
          const e = ELLIPSES[i]!;
          return (
            <ellipse
              key={axe.id}
              cx={e.cx}
              cy={e.cy}
              rx={e.rx}
              ry={e.ry}
              transform={`rotate(${e.rot} ${e.cx} ${e.cy})`}
              fill={couleurAxe(axe, sombre)}
              fillOpacity={0.07}
              stroke={couleurAxe(axe, sombre)}
              strokeWidth={1.1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {[...comptes.entries()].map(([masque, n]) => {
          const pos = REGIONS[masque];
          if (!pos || n === 0) return null;
          return (
            <text
              key={masque}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={masque === (masque & -masque) ? 5 : 4}
              fontWeight={650}
              fill="var(--texte)"
              style={{ cursor: onCliquerRegion ? 'pointer' : 'default' }}
              onMouseMove={(evt) => survol(evt, masque, n)}
              onClick={() =>
                onCliquerRegion?.(retenus.filter((_, i) => masque & (1 << i)).map((a) => a.id))
              }
            >
              {n}
            </text>
          );
        })}

        {retenus.map((axe, i) => {
          const e = ETIQUETTES[i]!;
          const total = effectifTotal(comptes, i);
          return (
            <text
              key={axe.id}
              x={e.x}
              y={e.y}
              textAnchor={e.ancre}
              fontSize={3.6}
              fontWeight={600}
              fill={couleurAxe(axe, sombre)}
            >
              {axe.code} · {total}
            </text>
          );
        })}
      </svg>

      <div className="legende">
        {retenus.map((a, i) => (
          <span key={a.id}>
            <i style={{ background: couleurAxe(a, sombre) }} />
            {a.code} — {a.libelle} ({effectifTotal(comptes, i)})
          </span>
        ))}
        {orphelins > 0 && (
          <span className="attenue">
            {orphelins} {titreZeroAxe}
          </span>
        )}
      </div>

      {bulle && (
        <div className="infobulle" style={{ left: bulle.x + 12, top: bulle.y + 12 }}>
          <strong>{bulle.titre}</strong>
          {bulle.texte}
        </div>
      )}
    </div>
  );
}

function effectifTotal(comptes: Map<number, number>, index: number): number {
  let n = 0;
  for (const [masque, v] of comptes) if (masque & (1 << index)) n += v;
  return n;
}
