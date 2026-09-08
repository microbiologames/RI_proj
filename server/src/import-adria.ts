/**
 * Import initial des données ADRIA : classeur de contexte (5 onglets) et
 * export CSV des questions de recherche.
 *
 * Usage :
 *   npx tsx src/import-adria.ts contexte.xlsx questions.csv            # simulation
 *   npx tsx src/import-adria.ts contexte.xlsx questions.csv --appliquer
 *
 * Le script est idempotent sur les référentiels (personnes, partenaires,
 * financements…) mais refuse de tourner deux fois sur des bases déjà
 * peuplées : relancer un import complet demande de vider les tables
 * d'abord (--vider).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { pool, query, tx } from './db.js';

const ICI = dirname(fileURLToPath(import.meta.url));

/** SharePoint sépare les valeurs multiples d'un champ par « ;# ». */
function listeSharePoint(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  return String(v)
    .split(/;#/)
    .map((x) => x.trim())
    // Un identifiant numérique suit chaque valeur d'un champ de recherche.
    .filter((x) => x && !/^\d+$/.test(x));
}

/** « Yvan LE MARC - ADRIA » → « Yvan LE MARC » ; « Huchet Veronique » inchangé. */
function nettoyerPersonne(v: string): string {
  return v.replace(/\s*-\s*ADRIA\s*$/i, '').replace(/\s+/g, ' ').trim();
}

/**
 * Prénom seul, tel qu'utilisé dans les onglets Équipe et Expertises, à partir
 * du nom complet de l'extract projets. « Nicolas NGUYEN VAN LONG » → « Nicolas ».
 */
function prenom(nomComplet: string): string {
  return (nomComplet.split(/\s+/)[0] ?? nomComplet).trim();
}

/** Clé de rapprochement : sans accents, sans casse, espaces normalisés. */
function cle(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function texte(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/ /g, ' ').trim();
  return s === '' ? null : s;
}

function nombre(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function date(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = texte(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

/**
 * Le pourcentage de financement externe se déduit de l'auto-financement :
 * un auto-financement nul signifie un projet financé à 100 % par des tiers.
 * Vérifié sur les données : auto/budget ADRIA donne des valeurs rondes
 * (20 %, 50 %, 100 %), ce que auto/budget total ne donne pas.
 */
function pourcentageFinancement(budgetAdria: number | null, autoFinancement: number | null): number | null {
  if (budgetAdria === null || autoFinancement === null || budgetAdria <= 0) return null;
  const pct = (1 - autoFinancement / budgetAdria) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)) * 100) / 100;
}

/** Les statuts MS List qui décrivent en réalité une idée non encore validée. */
const STATUTS_IDEE: Record<string, string> = {
  'idée brute': 'brute',
  'attente validation codir': 'attente_codir',
  'attente financement': 'attente_financement',
};

const STATUTS_PROJET: Record<string, string> = {
  'en cours': 'en_cours',
  terminé: 'termine',
  termine: 'termine',
  abandonné: 'abandonne',
  abandonne: 'abandonne',
  'en préparation': 'en_preparation',
};

interface Options { appliquer: boolean; vider: boolean }

const journalMessages: string[] = [];
const alertes: string[] = [];
function note(m: string) { journalMessages.push(m); }
function alerte(m: string) { alertes.push(m); }

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fichiers = args.filter((a) => !a.startsWith('--'));
  const opts: Options = { appliquer: args.includes('--appliquer'), vider: args.includes('--vider') };
  const [xlsxPath, csvPath] = fichiers;

  if (!xlsxPath || !csvPath) {
    console.error('Usage : npx tsx src/import-adria.ts <contexte.xlsx> <questions.csv> [--appliquer] [--vider]');
    process.exit(1);
  }

  const classeur = XLSX.read(await readFile(xlsxPath), { cellDates: true });
  const onglet = (nom: string) =>
    XLSX.utils.sheet_to_json<Record<string, unknown>>(classeur.Sheets[nom]!, { defval: null });

  const equipe = onglet('Equipe R&I');
  const expertises = onglet('Expertises');
  const partenaires = onglet('Partenaires');
  const projets = onglet('Projets');
  const feuilleDeRoute = onglet('Feuille de route Master');
  const questions = lireCsvQuestions(await readFile(csvPath, 'utf8'));

  console.log('Lu :');
  console.log(`  ${equipe.length} collaborateurs · ${expertises.length} expertises · ${partenaires.length} partenaires`);
  console.log(`  ${projets.length} lignes projets · ${feuilleDeRoute.length} lignes de feuille de route · ${questions.length} questions\n`);

  const villes = JSON.parse(await readFile(join(ICI, '..', 'donnees', 'villes-partenaires.json'), 'utf8'));
  const propositionsAxes = JSON.parse(await readFile(join(ICI, '..', 'donnees', 'problematiques-axes.json'), 'utf8'));

  if (!opts.appliquer) {
    simuler(equipe, expertises, partenaires, projets, questions, villes, propositionsAxes);
    return;
  }

  await tx(async (c) => {
    if (opts.vider) {
      await c.query(`TRUNCATE projets, questions_recherche, idees_brutes, partenaires, transferts, grappes,
                              personnes, expertises, problematiques, transitions_alimentaires,
                              categories_partenaire, scopes_feuille_de_route, journal RESTART IDENTITY CASCADE`);
      note('Bases vidées avant import.');
    }

    // -------------------------------------------------- feuille de route
    const axes = new Map<string, number>();
    const axesParLibelle = new Map<string, number>();
    for (const r of await query<{ id: number; code: string; libelle: string }>(
      'SELECT id, code, libelle FROM axes_recherche',
    )) {
      axes.set(r.code, r.id);
      axesParLibelle.set(cle(r.libelle), r.id);
    }
    for (const [i, l] of feuilleDeRoute.entries()) {
      // La colonne du numéro d'axe n'a pas d'en-tête dans le classeur :
      // on rapproche sur le libellé, qui est fiable.
      const libelleAxe = texte(l['Axe R&I']);
      const axeId = libelleAxe ? axesParLibelle.get(cle(libelleAxe)) : undefined;
      if (!axeId) { alerte(`feuille de route ligne ${i + 2} : axe « ${libelleAxe ?? '—'} » non reconnu`); continue; }
      await c.query(
        'INSERT INTO scopes_feuille_de_route (axe_id, scope, contribution, ordre) VALUES ($1, $2, $3, $4)',
        [axeId, texte(l['Scope de questions de recherche']), texte(l["Contributions possibles de l'ADRIA"]), i],
      );
    }
    note(`${feuilleDeRoute.length} scopes de feuille de route rattachés aux axes.`);

    // -------------------------------------------------- équipe
    const personnes = new Map<string, number>();   // clé : prénom en minuscules
    for (const [i, l] of equipe.entries()) {
      const nom = texte(l['Collaborateur']);
      if (!nom) continue;
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO personnes (nom, fonction, ordre) VALUES ($1, $2, $3)
         ON CONFLICT (nom) DO UPDATE SET fonction = EXCLUDED.fonction RETURNING id`,
        [nom, texte(l['Fonction']), i],
      );
      personnes.set(cle(nom), rows[0]!.id);
    }
    note(`${personnes.size} collaborateurs importés avec leur fonction.`);

    // -------------------------------------------------- expertises
    let nbLiensExpertise = 0;
    const colonnesPersonnes = Object.keys(expertises[0] ?? {}).filter(
      (k) => k !== 'Domaine' && k !== 'Expertises',
    );
    for (const l of expertises) {
      const libelle = texte(l['Expertises']);
      if (!libelle) continue;
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO expertises (libelle, domaine) VALUES ($1, $2)
         ON CONFLICT (libelle) DO UPDATE SET domaine = EXCLUDED.domaine RETURNING id`,
        [libelle, texte(l['Domaine'])],
      );
      for (const col of colonnesPersonnes) {
        if (!texte(l[col])) continue;
        const nom = col.trim();
        let id = personnes.get(cle(nom));
        if (!id) {
          // « Équipe CO3P » contribue sans faire partie de l'équipe R&I.
          const { rows: p } = await c.query<{ id: number }>(
            `INSERT INTO personnes (nom, equipe_ri) VALUES ($1, false)
             ON CONFLICT (nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
            [nom],
          );
          id = p[0]!.id;
          personnes.set(cle(nom), id);
        }
        await c.query('INSERT INTO personne_expertises VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, rows[0]!.id]);
        nbLiensExpertise += 1;
      }
    }
    note(`${nbLiensExpertise} liens collaborateur ↔ expertise.`);

    // -------------------------------------------------- partenaires
    const partenairesParNom = new Map<string, number>();
    for (const l of partenaires) {
      const nom = texte(l['Partenaire']);
      if (!nom) continue;
      const loc = villes[nom] ?? { ville: null, pays: null, source: 'saisie' };
      const categorie = texte(l['Catégorie']);
      let categorieId: number | null = null;
      if (categorie) {
        const { rows } = await c.query<{ id: number }>(
          `INSERT INTO categories_partenaire (libelle) VALUES ($1)
           ON CONFLICT (libelle) DO UPDATE SET libelle = EXCLUDED.libelle RETURNING id`,
          [categorie],
        );
        categorieId = rows[0]!.id;
      }
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO partenaires (nom, ville, pays, zone, categorie_id, utile_pour, localisation_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (nom) DO UPDATE SET ville = EXCLUDED.ville, pays = EXCLUDED.pays RETURNING id`,
        [nom, loc.ville, loc.pays, texte(l['Zone géographique']), categorieId, texte(l['Utile pour']), loc.source],
      );
      partenairesParNom.set(cle(nom), rows[0]!.id);
      if (!villes[nom]) alerte(`partenaire « ${nom} » : aucune localisation connue`);
    }
    note(`${partenairesParNom.size} partenaires importés.`);

    // -------------------------------------------------- référentiels des questions
    const transitions = new Map<string, number>();
    const problematiques = new Map<string, number>();

    async function refTransition(libelle: string | null): Promise<number | null> {
      if (!libelle) return null;
      const k = cle(libelle);
      if (transitions.has(k)) return transitions.get(k)!;
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO transitions_alimentaires (libelle) VALUES ($1)
         ON CONFLICT (libelle) DO UPDATE SET libelle = EXCLUDED.libelle RETURNING id`, [libelle],
      );
      transitions.set(k, rows[0]!.id);
      return rows[0]!.id;
    }

    async function refProblematique(libelle: string | null): Promise<number | null> {
      if (!libelle) return null;
      const k = cle(libelle);
      if (problematiques.has(k)) return problematiques.get(k)!;
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO problematiques (libelle) VALUES ($1)
         ON CONFLICT (libelle) DO UPDATE SET libelle = EXCLUDED.libelle RETURNING id`, [libelle],
      );
      const id = rows[0]!.id;
      problematiques.set(k, id);
      // Rattachement proposé aux axes, marqué non validé : c'est une
      // suggestion à relire, pas une donnée d'origine.
      const prop = propositionsAxes[libelle];
      if (prop) {
        for (const code of prop.axes as string[]) {
          const axeId = axes.get(code);
          if (axeId) await c.query('INSERT INTO problematique_axes VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, axeId]);
        }
      } else {
        alerte(`problématique « ${libelle} » : aucun axe proposé, à qualifier à la main`);
      }
      return id;
    }

    // -------------------------------------------------- projets et idées brutes
    const projetsParAcronyme = new Map<string, number>();
    const ideesParAcronyme = new Map<string, number>();
    const partenairesCrees = new Set<string>();
    // Deux acronymes ne différant que par la casse désignent-ils le même
    // projet ? L'export en contient ; on les signale plutôt que de trancher.
    const acronymesVus = new Map<string, string>();
    let nbIdees = 0;

    async function personneId(nomComplet: string): Promise<number> {
      const propre = nettoyerPersonne(nomComplet);
      // L'extract projets donne le nom complet, l'onglet Équipe le prénom seul.
      const parPrenom = personnes.get(cle(prenom(propre)));
      if (parPrenom) return parPrenom;
      const existant = personnes.get(cle(propre));
      if (existant) return existant;
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO personnes (nom, equipe_ri) VALUES ($1, false)
         ON CONFLICT (nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`, [propre],
      );
      personnes.set(cle(propre), rows[0]!.id);
      alerte(`pilote « ${propre} » absent de l'onglet Équipe — créé hors équipe R&I`);
      return rows[0]!.id;
    }

    for (const l of projets) {
      const acronyme = texte(l['Title']);
      if (!acronyme) continue;
      const statutBrut = (texte(l['Statut']) ?? '').toLowerCase();
      const titre = texte(l['Titre du projet']) ?? acronyme;
      const pilotes = listeSharePoint(l['Pilote(s) ADRIA']);

      // Une idée non validée par le CODIR n'est pas un projet.
      if (STATUTS_IDEE[statutBrut]) {
        const { rows } = await c.query<{ id: number }>(
          `INSERT INTO idees_brutes (libelle, titre, statut, notes) VALUES ($1, $2, $3::statut_idee, $4) RETURNING id`,
          [acronyme, titre, STATUTS_IDEE[statutBrut], `Importée depuis MS List (statut « ${texte(l['Statut'])} »).`],
        );
        if (pilotes.length) {
          await c.query('UPDATE idees_brutes SET pilote_id = $2 WHERE id = $1', [rows[0]!.id, await personneId(pilotes[0]!)]);
        }
        ideesParAcronyme.set(cle(acronyme), rows[0]!.id);
        nbIdees += 1;
        continue;
      }

      const dejaVu = acronymesVus.get(cle(acronyme));
      if (dejaVu && dejaVu !== acronyme) {
        alerte(`acronymes « ${dejaVu} » et « ${acronyme} » ne diffèrent que par la casse — deux projets distincts ont été créés, à fusionner si c'est le même`);
      }
      acronymesVus.set(cle(acronyme), acronyme);

      const statut = STATUTS_PROJET[statutBrut] ?? 'en_preparation';
      if (!STATUTS_PROJET[statutBrut]) alerte(`projet ${acronyme} : statut « ${texte(l['Statut'])} » inconnu → en préparation`);

      const budgetAdria = nombre(l['Budget ADRIA']);
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO projets (acronyme, titre, statut, date_debut, date_fin,
                              budget_total, budget_adria, pct_financement)
         VALUES ($1, $2, $3::statut_projet, $4, $5, $6, $7, $8)
         ON CONFLICT (acronyme) DO UPDATE SET titre = EXCLUDED.titre RETURNING id`,
        [acronyme, titre, statut, date(l['Date de début']), date(l['Date de fin']),
         nombre(l['Budget total projet']), budgetAdria,
         pourcentageFinancement(budgetAdria, nombre(l['Auto-financement']))],
      );
      const projetId = rows[0]!.id;
      projetsParAcronyme.set(cle(acronyme), projetId);

      for (const p of pilotes) {
        await c.query('INSERT INTO projet_pilotes VALUES ($1, $2) ON CONFLICT DO NOTHING', [projetId, await personneId(p)]);
      }

      for (const f of listeSharePoint(l['Financement'])) {
        const { rows: r } = await c.query<{ id: number }>(
          `INSERT INTO types_financement (libelle) VALUES ($1)
           ON CONFLICT (libelle) DO UPDATE SET libelle = EXCLUDED.libelle RETURNING id`, [f],
        );
        await c.query('INSERT INTO projet_financements VALUES ($1, $2) ON CONFLICT DO NOTHING', [projetId, r[0]!.id]);
      }

      const labels = listeSharePoint(l['Labellisation']);
      // L'UMT n'est pas une labellisation au sens strict, mais l'équipe la lit comme telle.
      if ((texte(l['UMT']) ?? '').toLowerCase() === 'oui') labels.push('UMT');
      for (const lab of labels) {
        const { rows: r } = await c.query<{ id: number }>(
          `INSERT INTO labellisations (libelle) VALUES ($1)
           ON CONFLICT (libelle) DO UPDATE SET libelle = EXCLUDED.libelle RETURNING id`, [lab],
        );
        await c.query('INSERT INTO projet_labellisations VALUES ($1, $2) ON CONFLICT DO NOTHING', [projetId, r[0]!.id]);
      }

      for (const nomPartenaire of listeSharePoint(l['Autres partenaires']).flatMap((x) => x.split(',').map((y) => y.trim()))) {
        if (!nomPartenaire) continue;
        let id = partenairesParNom.get(cle(nomPartenaire));
        if (!id) {
          // L'onglet Partenaires ne liste que les partenaires stratégiques ;
          // les projets en citent bien d'autres. Les ignorer perdrait des
          // partenariats réels, on les crée donc sans localisation.
          const { rows: np } = await c.query<{ id: number }>(
            `INSERT INTO partenaires (nom, localisation_source, utile_pour)
             VALUES ($1, 'sans_lieu', $2)
             ON CONFLICT (nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
            [nomPartenaire, 'Cité comme partenaire de projet ; absent du référentiel des partenaires stratégiques.'],
          );
          id = np[0]!.id;
          partenairesParNom.set(cle(nomPartenaire), id);
          partenairesCrees.add(nomPartenaire);
        }
        await c.query('INSERT INTO projet_partenaires VALUES ($1, $2) ON CONFLICT DO NOTHING', [projetId, id]);
      }
    }
    const { rows: totaux } = await c.query<{ n: number }>('SELECT count(*)::int AS n FROM projets');
    note(`${totaux[0]!.n} projets et ${nbIdees} idées brutes importés.`);
    if (partenairesCrees.size) {
      note(`${partenairesCrees.size} partenaires créés depuis les projets (absents du référentiel, sans localisation).`);
    }

    // -------------------------------------------------- questions de recherche
    let nbLiensQuestionProjet = 0;
    let nbLiensQuestionIdee = 0;
    let nbAxesPropages = 0;
    for (const q of questions) {
      const libelle = q['Question de recherche'];
      if (!libelle) continue;
      const transitionId = await refTransition(q['Transition alimentaire'] || null);
      const problematiqueId = await refProblematique(q['Problématique'] || null);

      const { rows } = await c.query<{ id: number }>(
        'INSERT INTO questions_recherche (libelle, transition_id, problematique_id) VALUES ($1, $2, $3) RETURNING id',
        [libelle, transitionId, problematiqueId],
      );
      const questionId = rows[0]!.id;

      // Les axes de la question découlent de sa problématique.
      if (problematiqueId) {
        const { rowCount } = await c.query(
          `INSERT INTO question_axes (question_id, axe_id)
           SELECT $1, axe_id FROM problematique_axes WHERE problematique_id = $2
           ON CONFLICT DO NOTHING`,
          [questionId, problematiqueId],
        );
        nbAxesPropages += rowCount ?? 0;
      }

      for (const acronyme of (q['Projets liés'] ?? '').split(',').map((x) => x.trim()).filter((x) => x && x !== '[]')) {
        const projetId = projetsParAcronyme.get(cle(acronyme));
        if (projetId) {
          await c.query('INSERT INTO question_projets VALUES ($1, $2) ON CONFLICT DO NOTHING', [questionId, projetId]);
          nbLiensQuestionProjet += 1;
          continue;
        }
        // L'entrée citée peut être devenue une idée brute (statut non validé).
        const ideeId = ideesParAcronyme.get(cle(acronyme));
        if (ideeId) {
          await c.query('INSERT INTO question_idees VALUES ($1, $2) ON CONFLICT DO NOTHING', [questionId, ideeId]);
          nbLiensQuestionIdee += 1;
        } else {
          alerte(`question « ${libelle.slice(0, 45)}… » : « ${acronyme} » introuvable`);
        }
      }
    }
    note(`${questions.length} questions importées, ${nbLiensQuestionProjet} liens vers des projets et ${nbLiensQuestionIdee} vers des idées brutes, ${nbAxesPropages} axes propagés depuis les problématiques.`);

    // -------------------------------------------------- axes des projets
    // Un projet hérite de l'union des axes de ses questions.
    const { rowCount: axesProjets } = await c.query(
      `INSERT INTO projet_axes (projet_id, axe_id)
       SELECT DISTINCT qp.projet_id, qa.axe_id
       FROM question_projets qp JOIN question_axes qa ON qa.question_id = qp.question_id
       ON CONFLICT DO NOTHING`,
    );
    note(`${axesProjets} rattachements d'axes propagés des questions vers les projets.`);

    const { rowCount: axesIdees } = await c.query(
      `INSERT INTO idee_axes (idee_id, axe_id)
       SELECT DISTINCT qi.idee_id, qa.axe_id
       FROM question_idees qi JOIN question_axes qa ON qa.question_id = qi.question_id
       ON CONFLICT DO NOTHING`,
    );
    note(`${axesIdees} rattachements d'axes propagés des questions vers les idées brutes.`);

    const { rows: sansAxe } = await c.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM projets p WHERE NOT EXISTS (SELECT 1 FROM projet_axes WHERE projet_id = p.id)',
    );
    if (sansAxe[0]!.n) alerte(`${sansAxe[0]!.n} projets restent sans axe (aucune question de recherche rattachée).`);

    await c.query(
      `INSERT INTO journal (entite, action, resume, details)
       VALUES ('projet', 'import', $1, $2)`,
      [`Import initial depuis MS List : ${projetsParAcronyme.size} projets, ${questions.length} questions, ${partenairesParNom.size} partenaires`,
       JSON.stringify({ messages: journalMessages, alertes: alertes.length })],
    );
  });

  console.log('Import appliqué :');
  for (const m of journalMessages) console.log(`  · ${m}`);
  rapporterAlertes();
}

/** Le CSV MS List commence par un bloc ListSchema= qu'il faut retirer. */
function lireCsvQuestions(brut: string): Array<Record<string, string>> {
  const sansBom = brut.replace(/^﻿/, '');
  const sansSchema = sansBom.replace(/^ListSchema=\{[\s\S]*?\]\}/, '').replace(/^\s*/, '');

  const lignes: string[][] = [];
  let champ = '';
  let ligne: string[] = [];
  let dansGuillemets = false;
  for (let i = 0; i < sansSchema.length; i += 1) {
    const ch = sansSchema[i]!;
    if (dansGuillemets) {
      if (ch === '"' && sansSchema[i + 1] === '"') { champ += '"'; i += 1; }
      else if (ch === '"') dansGuillemets = false;
      else champ += ch;
    } else if (ch === '"') dansGuillemets = true;
    else if (ch === ',') { ligne.push(champ); champ = ''; }
    else if (ch === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; }
    else if (ch !== '\r') champ += ch;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }

  const entetes = (lignes.shift() ?? []).map((h) => h.trim());
  return lignes
    .filter((l) => l.some((c) => c.trim()))
    .map((l) => Object.fromEntries(entetes.map((h, i) => [h, (l[i] ?? '').trim()])));
}

function simuler(
  equipe: Array<Record<string, unknown>>,
  expertises: Array<Record<string, unknown>>,
  partenaires: Array<Record<string, unknown>>,
  projets: Array<Record<string, unknown>>,
  questions: Array<Record<string, string>>,
  villes: Record<string, { ville: string | null; source: string }>,
  propositions: Record<string, { axes: string[] }>,
): void {
  const idees = projets.filter((l) => STATUTS_IDEE[(texte(l['Statut']) ?? '').toLowerCase()]);
  const vraisProjets = projets.length - idees.length;

  console.log('Ce que ferait l\'import :');
  console.log(`  · ${equipe.length} collaborateurs, ${expertises.length} expertises`);
  console.log(`  · ${partenaires.length} partenaires`);
  console.log(`  · ${vraisProjets} projets`);
  console.log(`  · ${idees.length} idées brutes (statuts non validés) : ${idees.map((l) => texte(l['Title'])).join(', ')}`);
  console.log(`  · ${questions.length} questions de recherche`);

  const problematiques = new Set(questions.map((q) => q['Problématique']).filter(Boolean));
  const sansProposition = [...problematiques].filter((p) => !propositions[p!]);
  console.log(`  · ${problematiques.size} problématiques distinctes, ${problematiques.size - sansProposition.length} avec un axe proposé`);
  if (sansProposition.length) console.log(`    à qualifier à la main : ${sansProposition.join(' | ')}`);

  const sansVille = partenaires.map((l) => texte(l['Partenaire'])).filter((n) => n && !villes[n]);
  if (sansVille.length) console.log(`  · partenaires sans localisation connue : ${sansVille.join(', ')}`);

  const parSource = new Map<string, number>();
  for (const v of Object.values(villes)) {
    if (typeof v === 'object' && v?.source) parSource.set(v.source, (parSource.get(v.source) ?? 0) + 1);
  }
  console.log(`  · localisations : ${[...parSource].map(([s, n]) => `${n} ${s}`).join(', ')}`);
  console.log('\nMode simulation. Relancez avec --appliquer pour écrire en base.');
}

function rapporterAlertes(): void {
  if (!alertes.length) { console.log('\nAucun point d\'attention.'); return; }
  console.log(`\n${alertes.length} point(s) d'attention :`);
  const vus = new Set<string>();
  for (const a of alertes) {
    if (vus.has(a)) continue;
    vus.add(a);
    if (vus.size <= 40) console.log(`  · ${a}`);
  }
  if (vus.size > 40) console.log(`  … et ${vus.size - 40} autre(s).`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
