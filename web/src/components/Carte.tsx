import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PointCarte {
  id: number;
  libelle: string;
  sousTitre?: string;
  latitude: number;
  longitude: number;
  couleur?: string;
}

/**
 * Cartographie sur fond OpenStreetMap. Leaflet est piloté à la main plutôt
 * qu'à travers react-leaflet : les marqueurs changent à chaque coup de filtre,
 * et une mise à jour impérative évite de reconstruire la carte entière.
 */
export function Carte({
  points,
  hauteur = 300,
  onCliquerPoint,
}: {
  points: PointCarte[];
  hauteur?: number;
  onCliquerPoint?: (id: number) => void;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const couche = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!conteneur.current || carte.current) return;
    const m = L.map(conteneur.current, { scrollWheelZoom: false, attributionControl: true }).setView([46.6, 2.4], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(m);
    couche.current = L.layerGroup().addTo(m);
    carte.current = m;
    return () => {
      m.remove();
      carte.current = null;
      couche.current = null;
    };
  }, []);

  const cle = useMemo(
    () => points.map((p) => `${p.id}:${p.latitude}:${p.longitude}:${p.couleur ?? ''}`).join('|'),
    [points],
  );

  useEffect(() => {
    const g = couche.current;
    const m = carte.current;
    if (!g || !m) return;
    g.clearLayers();

    for (const p of points) {
      const marqueur = L.circleMarker([p.latitude, p.longitude], {
        radius: 6,
        weight: 2,
        color: 'var(--surface)',
        fillColor: p.couleur ?? '#2a78d6',
        fillOpacity: 0.9,
      });
      marqueur.bindTooltip(
        `<strong>${echapper(p.libelle)}</strong>${p.sousTitre ? `<br>${echapper(p.sousTitre)}` : ''}`,
        { direction: 'top' },
      );
      if (onCliquerPoint) marqueur.on('click', () => onCliquerPoint(p.id));
      marqueur.addTo(g);
    }

    if (points.length > 0) {
      m.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])), {
        padding: [28, 28],
        maxZoom: 9,
      });
    }
    // `cle` résume la géométrie : on ne recalcule que quand elle change.
  }, [cle, points, onCliquerPoint]);

  return (
    <>
      <div ref={conteneur} style={{ height: hauteur, width: '100%' }} />
      {points.length === 0 && (
        <p className="attenue petit" style={{ marginTop: 6 }}>
          Aucun point géolocalisé. Renseignez ville et pays, puis lancez le géocodage depuis les réglages.
        </p>
      )}
    </>
  );
}

function echapper(v: string): string {
  return v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
