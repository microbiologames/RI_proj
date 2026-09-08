import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { diff, journaliser } from '../audit.js';
import { ErreurHttp, auteur, valider } from '../http.js';
import { RESSOURCES, schemaCreation, schemaModification, type Ressource } from '../ressources.js';

/** Remplace le contenu d'une table de jonction par la liste d'ids fournie. */
async function remplacerLiaison(
  client: { query: (t: string, p?: unknown[]) => Promise<unknown> },
  liaison: { table: string; cleLocale: string; cleEtrangere: string },
  id: number,
  ids: number[],
): Promise<void> {
  await client.query(`DELETE FROM ${liaison.table} WHERE ${liaison.cleLocale} = $1`, [id]);
  if (ids.length === 0) return;
  const uniques = [...new Set(ids)];
  await client.query(
    `INSERT INTO ${liaison.table} (${liaison.cleLocale}, ${liaison.cleEtrangere})
     SELECT $1, x FROM unnest($2::int[]) AS x`,
    [id, uniques],
  );
}

async function lire(r: Ressource, id: number) {
  const ligne = await one(`SELECT * FROM ${r.vue} WHERE id = $1`, [id]);
  if (!ligne) throw new ErreurHttp(404, `${r.entite} ${id} introuvable`);
  return ligne;
}

export function enregistrerCrud(app: FastifyInstance): void {
  for (const r of Object.values(RESSOURCES)) {
    const base = `/api/${r.nom}`;
    const creation = schemaCreation(r);
    const modification = schemaModification(r);
    const colonnes = Object.keys(r.champs);

    // ---- Liste complète (le filtrage par chips se fait côté client) --------
    app.get(base, async () => query(`SELECT * FROM ${r.vue} ORDER BY ${r.ordre}`));

    app.get(`${base}/:id`, async (req) => {
      const { id } = valider(z.object({ id: z.coerce.number().int().positive() }), req.params);
      return lire(r, id);
    });

    // ---- Création ---------------------------------------------------------
    app.post(base, async (req, reply) => {
      const corps = valider(creation, req.body);
      const valeurs = colonnes.filter((c) => corps[c as keyof typeof corps] !== undefined);

      const id = await tx(async (client) => {
        const placeholders = valeurs.map((_, i) => `$${i + 1}`).join(', ');
        const { rows } = await client.query<{ id: number }>(
          valeurs.length
            ? `INSERT INTO ${r.table} (${valeurs.join(', ')}) VALUES (${placeholders}) RETURNING id`
            : `INSERT INTO ${r.table} DEFAULT VALUES RETURNING id`,
          valeurs.map((c) => corps[c as keyof typeof corps]),
        );
        const nouvelId = rows[0].id;
        for (const [cle, liaison] of Object.entries(r.liaisons)) {
          const ids = corps[cle as keyof typeof corps] as number[] | undefined;
          if (ids) await remplacerLiaison(client, liaison, nouvelId, ids);
        }
        await journaliser(
          {
            entite: r.entite,
            entiteId: nouvelId,
            action: 'creation',
            resume: `Création de ${r.entite} « ${String(corps[r.champLibelle as keyof typeof corps] ?? nouvelId)} »`,
            details: corps as Record<string, unknown>,
            auteur: auteur(req),
          },
          client,
        );
        return nouvelId;
      });

      reply.status(201);
      return lire(r, id);
    });

    // ---- Modification partielle ------------------------------------------
    app.patch(`${base}/:id`, async (req) => {
      const { id } = valider(z.object({ id: z.coerce.number().int().positive() }), req.params);
      const corps = valider(modification, req.body);
      const avant = await lire(r, id);

      // Le verrou bloque toute modification, sauf sa propre levée.
      const seuleLeveeDuVerrou = Object.keys(corps).length === 1 && 'verrouille' in corps;
      if ((avant as { verrouille: boolean }).verrouille && !seuleLeveeDuVerrou) {
        throw new ErreurHttp(423, `Ce ${r.entite} est verrouillé : déverrouillez-le avant de le modifier.`);
      }

      const majColonnes = [...colonnes, 'verrouille'].filter((c) => corps[c as keyof typeof corps] !== undefined);
      if (majColonnes.length === 0 && !Object.keys(r.liaisons).some((k) => corps[k as keyof typeof corps])) {
        return avant;
      }

      await tx(async (client) => {
        if (majColonnes.length) {
          const set = majColonnes.map((c, i) => `${c} = $${i + 2}`).join(', ');
          await client.query(
            `UPDATE ${r.table} SET ${set} WHERE id = $1`,
            [id, ...majColonnes.map((c) => corps[c as keyof typeof corps])],
          );
        }
        for (const [cle, liaison] of Object.entries(r.liaisons)) {
          const ids = corps[cle as keyof typeof corps] as number[] | undefined;
          if (ids === undefined) continue;
          if (liaison.obligatoire && ids.length === 0) {
            throw new ErreurHttp(400, `« ${cle} » ne peut pas être vidé pour un ${r.entite}.`);
          }
          await remplacerLiaison(client, liaison, id, ids);
        }
      });

      const apres = await lire(r, id);
      const changements = diff(avant as Record<string, unknown>, apres as Record<string, unknown>);
      delete changements.maj_le;
      if (Object.keys(changements).length) {
        await journaliser({
          entite: r.entite,
          entiteId: id,
          action: 'modification',
          resume: `Modification de ${r.entite} « ${String((apres as Record<string, unknown>)[r.champLibelle] ?? id)} » (${Object.keys(changements).join(', ')})`,
          details: changements,
          auteur: auteur(req),
        });
      }
      return apres;
    });

    // ---- Suppression ------------------------------------------------------
    app.delete(`${base}/:id`, async (req, reply) => {
      const { id } = valider(z.object({ id: z.coerce.number().int().positive() }), req.params);
      const avant = await lire(r, id);
      if ((avant as { verrouille: boolean }).verrouille) {
        throw new ErreurHttp(423, `Ce ${r.entite} est verrouillé : déverrouillez-le avant de le supprimer.`);
      }
      await query(`DELETE FROM ${r.table} WHERE id = $1`, [id]);
      await journaliser({
        entite: r.entite,
        entiteId: id,
        action: 'suppression',
        resume: `Suppression de ${r.entite} « ${String((avant as Record<string, unknown>)[r.champLibelle] ?? id)} »`,
        details: avant as Record<string, unknown>,
        auteur: auteur(req),
      });
      reply.status(204);
      return null;
    });
  }
}
