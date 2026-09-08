import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';

export class ErreurHttp extends Error {
  constructor(readonly statut: number, message: string) {
    super(message);
  }
}

export function valider<T>(schema: ZodType<T>, donnees: unknown): T {
  const res = schema.safeParse(donnees);
  if (!res.success) {
    const detail = (res.error as ZodError).issues
      .map((i) => `${i.path.join('.') || 'corps'} : ${i.message}`)
      .join(' ; ');
    throw new ErreurHttp(400, detail);
  }
  return res.data;
}

/** Nom facultatif transmis par le front (en-tête X-Auteur), pour le journal. */
export function auteur(req: FastifyRequest): string | null {
  const v = req.headers['x-auteur'];
  const nom = Array.isArray(v) ? v[0] : v;
  return nom && nom.trim() ? nom.trim().slice(0, 120) : null;
}

export function gererErreur(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof ErreurHttp) return reply.status(err.statut).send({ erreur: err.message });
  const msg = (err as Error)?.message ?? 'Erreur inconnue';
  // Violations de contraintes Postgres : message lisible plutôt qu'une 500 opaque.
  const code = (err as { code?: string }).code;
  if (code === '23505') return reply.status(409).send({ erreur: `Doublon : cette valeur existe déjà (${msg})` });
  if (code === '23503') return reply.status(409).send({ erreur: 'Référence inexistante ou encore utilisée ailleurs.' });
  if (code === '23514') return reply.status(400).send({ erreur: `Valeur refusée par une contrainte : ${msg}` });
  reply.log.error({ err }, 'erreur non gérée');
  return reply.status(500).send({ erreur: msg });
}
