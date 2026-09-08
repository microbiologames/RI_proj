import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { valider } from '../http.js';

export function enregistrerJournal(app: FastifyInstance): void {
  app.get('/api/journal', async (req) => {
    const q = valider(
      z.object({
        entite: z.string().max(40).optional(),
        entite_id: z.coerce.number().int().positive().optional(),
        action: z.string().max(40).optional(),
        limite: z.coerce.number().int().min(1).max(2000).default(300),
      }),
      req.query,
    );

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (q.entite) { params.push(q.entite); conditions.push(`entite = $${params.length}`); }
    if (q.entite_id) { params.push(q.entite_id); conditions.push(`entite_id = $${params.length}`); }
    if (q.action) { params.push(q.action); conditions.push(`action = $${params.length}`); }
    params.push(q.limite);

    return query(
      `SELECT * FROM journal
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY horodatage DESC, id DESC
       LIMIT $${params.length}`,
      params,
    );
  });
}
