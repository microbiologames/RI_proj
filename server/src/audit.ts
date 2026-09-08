import type { PoolClient } from 'pg';
import { query } from './db.js';

export type Action = 'creation' | 'modification' | 'suppression' | 'bascule' | 'grappage' | 'import';

export interface EntreeJournal {
  entite: string;
  entiteId: number | null;
  action: Action;
  resume: string;
  details?: Record<string, unknown>;
  auteur?: string | null;
}

/**
 * Écrit une entrée du journal. L'application ne demande pas
 * d'authentification : `auteur` provient d'un nom facultatif renseigné dans
 * les réglages du navigateur et vaut null s'il n'est pas fourni.
 */
export async function journaliser(e: EntreeJournal, client?: PoolClient): Promise<void> {
  const sql = `INSERT INTO journal (entite, entite_id, action, resume, details, auteur)
               VALUES ($1, $2, $3, $4, $5, $6)`;
  const params = [e.entite, e.entiteId, e.action, e.resume, JSON.stringify(e.details ?? {}), e.auteur ?? null];
  if (client) await client.query(sql, params);
  else await query(sql, params);
}

/** Compare deux états d'une ligne et renvoie { champ: { avant, apres } }. */
export function diff(
  avant: Record<string, unknown>,
  apres: Record<string, unknown>,
): Record<string, { avant: unknown; apres: unknown }> {
  const out: Record<string, { avant: unknown; apres: unknown }> = {};
  for (const champ of Object.keys(apres)) {
    const a = avant[champ];
    const b = apres[champ];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out[champ] = { avant: a ?? null, apres: b ?? null };
  }
  return out;
}
