import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { query } from '../db.js';
import { ErreurHttp } from '../http.js';

/**
 * Acquisition de Données Multimodale (ADM).
 *
 * L'utilisateur colle du texte brut non mis en forme ; le modèle produit une
 * PROPOSITION structurée que l'utilisateur valide, corrige ou rejette avant
 * toute écriture en base. Rien n'est enregistré par ce module : il ne fait que
 * lire les entrées existantes et rendre une proposition.
 *
 * Les trois traitements demandés par le cahier des charges :
 *   1. traduction en français des entrées rédigées dans une autre langue ;
 *   2. fusion avec les entrées existantes similaires + formulation élargie ;
 *   3. agrégation en grappes des entrées liées entre elles.
 */

const MODELE = process.env.ADM_MODELE ?? 'claude-opus-5';

export type CibleAdm = 'question' | 'idee' | 'partenaire' | 'transfert';

const CIBLES: Record<CibleAdm, { table: string; libelle: string; intitule: string }> = {
  question: { table: 'questions_recherche', libelle: 'libelle', intitule: 'question de recherche' },
  idee: { table: 'idees_brutes', libelle: 'libelle', intitule: 'idée brute' },
  partenaire: { table: 'partenaires', libelle: 'nom', intitule: 'partenaire' },
  transfert: { table: 'transferts', libelle: 'libelle', intitule: 'action de transfert' },
};

const Proposition = z.object({
  langue_source: z
    .string()
    .describe("Langue détectée du texte fourni, en clair (ex. « français », « anglais »)."),
  entrees: z
    .array(
      z.object({
        libelle: z.string().describe('Énoncé reformulé en français, une seule phrase claire.'),
        axes: z
          .array(z.number().int())
          .describe("Identifiants des axes de recherche pertinents (au moins un). Utilise les ids fournis."),
        pilote: z.string().nullable().describe('Nom du pilote si le texte le mentionne, sinon null.'),
        partenaire: z.string().nullable().describe('Nom du partenaire si le texte le mentionne, sinon null.'),
        justification: z.string().describe("En une phrase, ce qui, dans le texte, justifie cette entrée."),
      }),
    )
    .describe('Une entrée par idée distincte identifiée dans le texte.'),
  fusions: z
    .array(
      z.object({
        entree_existante_id: z.number().int().describe('Id de l\'entrée existante à enrichir.'),
        index_entree_nouvelle: z
          .number()
          .int()
          .describe('Position (à partir de 0) dans « entrees » de la nouvelle entrée qui fait doublon.'),
        libelle_fusionne: z
          .string()
          .describe("Formulation élargie couvrant les deux énoncés, sans perdre d'information."),
        justification: z.string().describe('Pourquoi ces deux énoncés portent sur le même sujet.'),
      }),
    )
    .describe('Doublons détectés avec les entrées déjà en base. Vide si aucun.'),
  grappes: z
    .array(
      z.object({
        nom: z.string().describe('Titre court de la grappe, utilisable comme titre de projet.'),
        index_entrees_nouvelles: z.array(z.number().int()).describe('Positions dans « entrees ».'),
        ids_entrees_existantes: z.array(z.number().int()).describe('Ids d\'entrées déjà en base à rattacher.'),
        justification: z.string().describe('Le fil conducteur qui relie ces éléments.'),
      }),
    )
    .describe('Regroupements proposés. Ne propose une grappe que si le lien est réel ; sinon renvoie une liste vide.'),
});

export type PropositionAdm = z.infer<typeof Proposition>;

/** Entrées existantes les plus proches du texte, pour permettre la détection de doublons. */
async function contexteExistant(cible: CibleAdm, texte: string, limite = 60) {
  const c = CIBLES[cible];
  return query<{ id: number; libelle: string }>(
    `SELECT id, ${c.libelle} AS libelle
     FROM ${c.table}
     ORDER BY similarity(unaccent(lower(${c.libelle})), unaccent(lower($1))) DESC, maj_le DESC
     LIMIT $2`,
    [texte.slice(0, 2000), limite],
  );
}

export function admDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function analyser(cible: CibleAdm, texte: string): Promise<PropositionAdm> {
  if (!admDisponible()) {
    throw new ErreurHttp(
      503,
      "Le module ADM n'est pas configuré (variable ANTHROPIC_API_KEY absente). La saisie manuelle reste disponible.",
    );
  }

  const [axes, personnes, partenaires, existantes] = await Promise.all([
    query<{ id: number; libelle: string }>('SELECT id, libelle FROM axes_recherche WHERE actif ORDER BY ordre'),
    query<{ nom: string }>('SELECT nom FROM personnes WHERE actif ORDER BY nom'),
    query<{ nom: string }>('SELECT nom FROM partenaires ORDER BY nom LIMIT 300'),
    contexteExistant(cible, texte),
  ]);

  const client = new Anthropic();
  const reponse = await client.messages.parse({
    model: MODELE,
    max_tokens: 16000,
    output_config: { format: zodOutputFormat(Proposition), effort: 'medium' },
    system: [
      "Tu assistes une équipe de recherche et innovation agroalimentaire dans la saisie de sa base de projets.",
      "On te donne des notes brutes, non mises en forme, éventuellement dans une autre langue que le français.",
      '',
      'Tes règles :',
      "— Rends toujours des énoncés en français, même si la source est dans une autre langue.",
      "— Une entrée = une idée. Découpe un texte qui en contient plusieurs ; ne fusionne pas deux sujets distincts.",
      "— N'invente jamais de pilote, de partenaire ou de détail qui ne figure pas dans le texte : mets null.",
      "— Chaque entrée doit porter au moins un axe de recherche, choisi parmi les ids fournis.",
      "— Ne propose une fusion que si les deux énoncés portent réellement sur la même question ; le doute profite à la non-fusion.",
      "— Ne propose une grappe que si un fil conducteur explicite relie les éléments. Une grappe d'un seul élément n'a pas d'intérêt.",
      "— Tes propositions seront relues et validées par un humain : sois explicite dans les justifications.",
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          `Type d'entrée à créer : ${CIBLES[cible].intitule}.`,
          '',
          'Axes de recherche disponibles (id — libellé) :',
          axes.map((a) => `${a.id} — ${a.libelle}`).join('\n'),
          '',
          `Pilotes connus : ${personnes.map((p) => p.nom).join(', ') || '(aucun)'}`,
          `Partenaires connus : ${partenaires.map((p) => p.nom).slice(0, 150).join(', ') || '(aucun)'}`,
          '',
          'Entrées déjà en base, pour la détection de doublons (id — énoncé) :',
          existantes.map((e) => `${e.id} — ${e.libelle}`).join('\n') || '(base vide)',
          '',
          '--- Texte brut à traiter ---',
          texte,
        ].join('\n'),
      },
    ],
  });

  if (!reponse.parsed_output) {
    throw new ErreurHttp(502, "Le modèle n'a pas renvoyé de proposition exploitable. Réessayez ou saisissez manuellement.");
  }

  // Garde-fou : on ne laisse pas passer un axe inexistant.
  const idsAxes = new Set(axes.map((a) => a.id));
  const proposition = reponse.parsed_output;
  for (const e of proposition.entrees) {
    e.axes = e.axes.filter((id) => idsAxes.has(id));
    if (e.axes.length === 0 && axes.length) e.axes = [];   // l'utilisateur devra choisir
  }
  return proposition;
}
