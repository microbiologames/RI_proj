import { z } from 'zod';

/** Table de jonction pilotée depuis le formulaire d'édition (tableau d'ids). */
export interface Liaison {
  table: string;
  cleLocale: string;
  cleEtrangere: string;
  /** Au moins un élément requis (ex. axes de recherche). */
  obligatoire?: boolean;
}

export interface Ressource {
  /** Segment d'URL : /api/<nom> */
  nom: string;
  table: string;
  vue: string;
  /** Étiquette utilisée dans le journal. */
  entite: string;
  /** Colonne servant de libellé court dans le journal et l'autocomplétion. */
  champLibelle: string;
  /** Colonnes scalaires modifiables, avec leur validation. */
  champs: z.ZodRawShape;
  liaisons: Record<string, Liaison>;
  /** Ordre par défaut de la liste. */
  ordre: string;
}

const texteCourt = z.string().trim().min(1).max(500);
const texteLong = z.string().trim().max(20000).nullish();
const idRef = z.number().int().positive().nullish();
const listeIds = z.array(z.number().int().positive());
const dateIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ')
  .nullish();
const montant = z.number().nonnegative().max(1e11).nullish();

export const AXES: Liaison = { table: '', cleLocale: '', cleEtrangere: 'axe_id', obligatoire: true };

export const RESSOURCES: Record<string, Ressource> = {
  questions: {
    nom: 'questions',
    table: 'questions_recherche',
    vue: 'v_questions',
    entite: 'question',
    champLibelle: 'libelle',
    ordre: 'maj_le DESC',
    champs: {
      libelle: texteCourt,
      pilote_id: idRef,
      projet_id: idRef,
      grappe_id: idRef,
      notes: texteLong,
    },
    liaisons: {
      axes: { table: 'question_axes', cleLocale: 'question_id', cleEtrangere: 'axe_id', obligatoire: true },
    },
  },

  idees: {
    nom: 'idees',
    table: 'idees_brutes',
    vue: 'v_idees',
    entite: 'idee',
    champLibelle: 'libelle',
    ordre: 'maj_le DESC',
    champs: {
      libelle: texteCourt,
      pilote_id: idRef,
      partenaire_id: idRef,
      grappe_id: idRef,
      projet_id: idRef,
      notes: texteLong,
    },
    liaisons: {
      axes: { table: 'idee_axes', cleLocale: 'idee_id', cleEtrangere: 'axe_id', obligatoire: true },
    },
  },

  projets: {
    nom: 'projets',
    table: 'projets',
    vue: 'v_projets',
    entite: 'projet',
    champLibelle: 'acronyme',
    ordre: 'maj_le DESC',
    champs: {
      acronyme: z.string().trim().min(1).max(60),
      titre: texteCourt,
      statut: z.enum(['en_preparation', 'en_cours', 'termine', 'abandonne']),
      pilote_id: idRef,
      date_debut: dateIso,
      date_fin: dateIso,
      budget_total: montant,
      budget_adria: montant,
      pct_financement: z.number().min(0).max(100).nullish(),
      contributions_adria: texteLong,
      notes: texteLong,
    },
    liaisons: {
      axes: { table: 'projet_axes', cleLocale: 'projet_id', cleEtrangere: 'axe_id', obligatoire: true },
      partenaires: { table: 'projet_partenaires', cleLocale: 'projet_id', cleEtrangere: 'partenaire_id' },
      financements: { table: 'projet_financements', cleLocale: 'projet_id', cleEtrangere: 'financement_id' },
      labellisations: { table: 'projet_labellisations', cleLocale: 'projet_id', cleEtrangere: 'labellisation_id' },
    },
  },

  partenaires: {
    nom: 'partenaires',
    table: 'partenaires',
    vue: 'v_partenaires',
    entite: 'partenaire',
    champLibelle: 'nom',
    ordre: 'nom ASC',
    champs: {
      nom: texteCourt,
      ville: z.string().trim().min(1).max(160),
      pays: z.string().trim().min(1).max(120),
      latitude: z.number().min(-90).max(90).nullish(),
      longitude: z.number().min(-180).max(180).nullish(),
      notes: texteLong,
    },
    liaisons: {
      expertises: { table: 'partenaire_expertises', cleLocale: 'partenaire_id', cleEtrangere: 'expertise_id', obligatoire: true },
      projets: { table: 'projet_partenaires', cleLocale: 'partenaire_id', cleEtrangere: 'projet_id' },
    },
  },

  transferts: {
    nom: 'transferts',
    table: 'transferts',
    vue: 'v_transferts',
    entite: 'transfert',
    champLibelle: 'libelle',
    ordre: 'COALESCE(date_transfert, maj_le::date) DESC',
    champs: {
      libelle: texteCourt,
      type_id: z.number().int().positive(),
      ville: z.string().trim().max(160).nullish(),
      pays: z.string().trim().max(120).nullish(),
      latitude: z.number().min(-90).max(90).nullish(),
      longitude: z.number().min(-180).max(180).nullish(),
      projet_id: idRef,
      date_transfert: dateIso,
      reference: z.string().trim().max(500).nullish(),
      notes: texteLong,
    },
    liaisons: {
      pilotes: { table: 'transfert_pilotes', cleLocale: 'transfert_id', cleEtrangere: 'personne_id', obligatoire: true },
    },
  },
};

/** Schéma de création : tous les champs + les liaisons en tableaux d'ids. */
export function schemaCreation(r: Ressource) {
  const liaisons: Record<string, z.ZodType> = {};
  for (const [cle, l] of Object.entries(r.liaisons)) {
    liaisons[cle] = l.obligatoire ? listeIds.min(1, `au moins un élément requis pour « ${cle} »`) : listeIds.optional();
  }
  return z.object({ ...r.champs, ...liaisons }).strict();
}

/** Schéma de modification partielle : mêmes règles, tout devient optionnel. */
export function schemaModification(r: Ressource) {
  return schemaCreation(r).partial().extend({ verrouille: z.boolean().optional() }).strict();
}
