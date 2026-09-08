import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../db.js';
import { valider } from '../http.js';

/**
 * Géocodage des villes pour les deux cartographies (partenaires, transferts).
 * Nominatim (OpenStreetMap) : gratuit, sans clé, mais limité à 1 requête/s et
 * conditionné à un User-Agent identifiant. On met donc les résultats en cache
 * et on sérialise les appels.
 */
const CACHE = new Map<string, { lat: number; lon: number } | null>();
let dernierAppel = 0;

const UA = process.env.GEOCODE_USER_AGENT ?? 'outil-pilotage-RI (contact: à renseigner)';

async function geocoder(ville: string, pays: string): Promise<{ lat: number; lon: number } | null> {
  const cle = `${ville.toLowerCase()}|${pays.toLowerCase()}`;
  if (CACHE.has(cle)) return CACHE.get(cle)!;

  const attente = Math.max(0, 1100 - (Date.now() - dernierAppel));
  if (attente) await new Promise((r) => setTimeout(r, attente));
  dernierAppel = Date.now();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('city', ville);
  url.searchParams.set('country', pays);

  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    const point = data[0] ? { lat: Number(data[0].lat), lon: Number(data[0].lon) } : null;
    CACHE.set(cle, point);
    return point;
  } catch {
    return null;   // hors ligne ou Nominatim indisponible : la saisie manuelle reste possible
  }
}

export function enregistrerGeocodage(app: FastifyInstance): void {
  app.post('/api/geocodage', async (req) => {
    const { ville, pays } = valider(
      z.object({ ville: z.string().trim().min(1), pays: z.string().trim().min(1) }),
      req.body,
    );
    return (await geocoder(ville, pays)) ?? { lat: null, lon: null };
  });

  /** Complète les coordonnées manquantes des partenaires et transferts. */
  app.post('/api/geocodage/rattrapage', async () => {
    const cibles = [
      { table: 'partenaires', libelle: 'nom' },
      { table: 'transferts', libelle: 'libelle' },
    ];
    const resultats: Array<{ table: string; id: number; libelle: string; trouve: boolean }> = [];

    for (const c of cibles) {
      const lignes = await query<{ id: number; libelle: string; ville: string; pays: string }>(
        `SELECT id, ${c.libelle} AS libelle, ville, pays FROM ${c.table}
         WHERE latitude IS NULL AND ville IS NOT NULL AND pays IS NOT NULL
         LIMIT 100`,
      );
      for (const l of lignes) {
        const point = await geocoder(l.ville, l.pays);
        if (point) {
          await one(`UPDATE ${c.table} SET latitude = $2, longitude = $3 WHERE id = $1 RETURNING id`,
            [l.id, point.lat, point.lon]);
        }
        resultats.push({ table: c.table, id: l.id, libelle: l.libelle, trouve: Boolean(point) });
      }
    }
    return { traites: resultats.length, resultats };
  });
}
