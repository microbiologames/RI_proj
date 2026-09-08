/**
 * Import d'un export CSV de Microsoft List.
 *
 * Usage :
 *   npx tsx src/import-mslist.ts projets export-projets.csv
 *   npx tsx src/import-mslist.ts projets export-projets.csv --appliquer
 *
 * Sans --appliquer, rien n'est écrit : le script affiche ce qu'il ferait, ce
 * qu'il ne sait pas rattacher, et les lignes qu'il refuserait. C'est le mode à
 * utiliser en premier, autant de fois que nécessaire, pour ajuster la
 * correspondance des colonnes ci-dessous avant de toucher à la base.
 *
 * La correspondance est volontairement en clair et modifiable : les noms de
 * colonnes d'un export MS List dépendent de la liste, pas d'un standard.
 */
import { readFile } from 'node:fs/promises';
import { pool, query } from './db.js';

/** Colonnes de l'export → champs de l'application. Adapter à votre liste. */
const CORRESPONDANCES = {
  projets: {
    acronyme: ['Acronyme', 'Titre', 'Title'],
    titre: ['Titre complet', 'Intitulé', 'Nom du projet'],
    statut: ['Statut', 'État', 'Etat'],
    pilote: ['Pilote', 'Responsable', 'Chef de projet'],
    axes: ['Axe de recherche', 'Axes', 'Axe'],
    partenaires: ['Partenaire', 'Partenaires'],
    financements: ['Type de financement', 'Financement'],
    labellisations: ['Labellisation', 'Label'],
    date_debut: ['Date de début', 'Début', 'Debut'],
    date_fin: ['Date de fin', 'Fin'],
    budget_total: ['Budget total', 'Budget'],
    budget_adria: ['Budget ADRIA', 'Part ADRIA'],
    pct_financement: ['% financement', 'Taux de financement', 'Pourcentage financement'],
    contributions_adria: ['Contributions ADRIA', 'Contribution ADRIA'],
    notes: ['Commentaires', 'Notes', 'Remarques'],
  },
  questions: {
    libelle: ['Question de recherche', 'Question', 'Titre', 'Title'],
    pilote: ['Pilote', 'Responsable'],
    projet: ['Projet', 'Projet lié'],
    axes: ['Axe de recherche', 'Axes', 'Axe'],
    notes: ['Commentaires', 'Notes'],
  },
  idees: {
    libelle: ['Idée', 'Idée brute', 'Titre', 'Title'],
    pilote: ['Pilote', 'Responsable'],
    partenaire: ['Partenaire'],
    axes: ['Axe de recherche', 'Axes', 'Axe'],
    notes: ['Commentaires', 'Notes'],
  },
  partenaires: {
    nom: ['Partenaire', 'Nom', 'Titre', 'Title'],
    ville: ['Ville'],
    pays: ['Pays'],
    expertises: ['Expertise', 'Expertises', 'Domaine'],
    notes: ['Commentaires', 'Notes'],
  },
  transferts: {
    libelle: ['Transfert', 'Intitulé', 'Titre', 'Title'],
    type: ['Type', 'Type de transfert'],
    ville: ['Ville', 'Lieu'],
    pays: ['Pays'],
    projet: ['Projet', 'Projet lié'],
    pilotes: ['Pilote', 'Pilotes', 'Auteurs'],
    date_transfert: ['Date', 'Date du transfert'],
    reference: ['Référence', 'DOI', 'Lien'],
    notes: ['Commentaires', 'Notes'],
  },
} as const;

type Cible = keyof typeof CORRESPONDANCES;

const STATUTS: Record<string, string> = {
  'en preparation': 'en_preparation', 'en préparation': 'en_preparation', preparation: 'en_preparation',
  'en cours': 'en_cours', encours: 'en_cours', 'en-cours': 'en_cours',
  termine: 'termine', terminé: 'termine', fini: 'termine', clos: 'termine',
  abandonne: 'abandonne', abandonné: 'abandonne', annule: 'abandonne', annulé: 'abandonne',
};

/** Analyseur CSV tolérant : guillemets, virgules et retours à la ligne inclus. */
function lireCsv(texte: string): Array<Record<string, string>> {
  const sansBom = texte.replace(/^﻿/, '');
  const separateur = (sansBom.split('\n')[0]?.match(/;/g)?.length ?? 0) >
                     (sansBom.split('\n')[0]?.match(/,/g)?.length ?? 0) ? ';' : ',';

  const lignes: string[][] = [];
  let champ = '';
  let ligne: string[] = [];
  let dansGuillemets = false;

  for (let i = 0; i < sansBom.length; i += 1) {
    const c = sansBom[i]!;
    if (dansGuillemets) {
      if (c === '"' && sansBom[i + 1] === '"') { champ += '"'; i += 1; }
      else if (c === '"') dansGuillemets = false;
      else champ += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === separateur) { ligne.push(champ); champ = ''; }
    else if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; }
    else if (c !== '\r') champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }

  const entetes = (lignes.shift() ?? []).map((h) => h.trim());
  return lignes
    .filter((l) => l.some((c) => c.trim()))
    .map((l) => Object.fromEntries(entetes.map((h, i) => [h, (l[i] ?? '').trim()])));
}

/** Première colonne présente parmi les noms candidats. */
function valeur(ligne: Record<string, string>, candidats: readonly string[]): string {
  for (const c of candidats) {
    const trouve = Object.keys(ligne).find((k) => k.toLowerCase() === c.toLowerCase());
    if (trouve && ligne[trouve]) return ligne[trouve]!;
  }
  return '';
}

/**
 * MS List sépare les valeurs d'un champ à choix multiples par « ; ».
 * On ne découpe surtout pas sur la virgule : un libellé unique en contient
 * souvent une (« Qualité, nutrition & durabilité »).
 */
function liste(v: string): string[] {
  return v.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
}

function nombre(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function date(v: string): string | null {
  if (!v) return null;
  const fr = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]!.padStart(2, '0')}-${fr[1]!.padStart(2, '0')}`;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

/** Retrouve un identifiant par libellé, en créant l'entrée si demandé. */
async function resoudre(
  table: string, colonne: string, libelle: string, creer: boolean,
): Promise<number | null> {
  if (!libelle) return null;
  const [existant] = await query<{ id: number }>(
    `SELECT id FROM ${table} WHERE lower(unaccent(${colonne})) = lower(unaccent($1))`, [libelle],
  );
  if (existant) return existant.id;
  if (!creer) return null;
  const [cree] = await query<{ id: number }>(
    `INSERT INTO ${table} (${colonne}) VALUES ($1) RETURNING id`, [libelle],
  );
  return cree?.id ?? null;
}

async function main(): Promise<void> {
  const [cible, fichier] = process.argv.slice(2) as [Cible, string];
  const appliquer = process.argv.includes('--appliquer');

  if (!cible || !fichier || !CORRESPONDANCES[cible]) {
    console.error(`Usage : npx tsx src/import-mslist.ts <${Object.keys(CORRESPONDANCES).join('|')}> <fichier.csv> [--appliquer]`);
    process.exit(1);
  }

  const lignes = lireCsv(await readFile(fichier, 'utf8'));
  console.log(`${lignes.length} ligne(s) lue(s) dans ${fichier}.`);
  console.log(`Colonnes détectées : ${Object.keys(lignes[0] ?? {}).join(' | ')}\n`);

  const map = CORRESPONDANCES[cible] as Record<string, readonly string[]>;
  const avertissements: string[] = [];
  let importees = 0;

  for (const [i, ligne] of lignes.entries()) {
    const champs: Record<string, string> = {};
    for (const [cle, candidats] of Object.entries(map)) champs[cle] = valeur(ligne, candidats);

    const libelle = champs.libelle || champs.acronyme || champs.nom || '';
    if (!libelle) {
      avertissements.push(`ligne ${i + 2} : aucune valeur pour la colonne principale — ignorée`);
      continue;
    }

    // Les axes sont obligatoires partout sauf pour les partenaires et transferts.
    const axesRequis = cible === 'projets' || cible === 'questions' || cible === 'idees';
    const axes: number[] = [];
    for (const nom of liste(champs.axes ?? '')) {
      const id = await resoudre('axes_recherche', 'libelle', nom, false);
      if (id) axes.push(id);
      else avertissements.push(`ligne ${i + 2} : axe « ${nom} » inconnu — à créer dans Réglages avant import`);
    }
    if (axesRequis && axes.length === 0) {
      avertissements.push(`ligne ${i + 2} : « ${libelle.slice(0, 50)} » sans axe reconnu — non importée`);
      continue;
    }

    if (!appliquer) { importees += 1; continue; }

    const piloteId = await resoudre('personnes', 'nom', champs.pilote ?? '', true);

    switch (cible) {
      case 'projets': {
        const statut = STATUTS[(champs.statut ?? '').toLowerCase().trim()] ?? 'en_preparation';
        const [p] = await query<{ id: number }>(
          `INSERT INTO projets (acronyme, titre, statut, pilote_id, date_debut, date_fin,
                                budget_total, budget_adria, pct_financement, contributions_adria, notes)
           VALUES ($1, $2, $3::statut_projet, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (acronyme) DO UPDATE SET titre = EXCLUDED.titre, statut = EXCLUDED.statut
           RETURNING id`,
          [champs.acronyme || libelle, champs.titre || libelle, statut, piloteId,
           date(champs.date_debut ?? ''), date(champs.date_fin ?? ''),
           nombre(champs.budget_total ?? ''), nombre(champs.budget_adria ?? ''),
           nombre(champs.pct_financement ?? ''), champs.contributions_adria || null, champs.notes || null],
        );
        for (const a of axes) await query('INSERT INTO projet_axes VALUES ($1, $2) ON CONFLICT DO NOTHING', [p!.id, a]);
        for (const nom of liste(champs.partenaires ?? '')) {
          const id = await resoudre('partenaires', 'nom', nom, false);
          if (id) await query('INSERT INTO projet_partenaires VALUES ($1, $2) ON CONFLICT DO NOTHING', [p!.id, id]);
          else avertissements.push(`ligne ${i + 2} : partenaire « ${nom} » absent — importez d'abord les partenaires`);
        }
        for (const nom of liste(champs.financements ?? '')) {
          const id = await resoudre('types_financement', 'libelle', nom, true);
          if (id) await query('INSERT INTO projet_financements VALUES ($1, $2) ON CONFLICT DO NOTHING', [p!.id, id]);
        }
        for (const nom of liste(champs.labellisations ?? '')) {
          const id = await resoudre('labellisations', 'libelle', nom, true);
          if (id) await query('INSERT INTO projet_labellisations VALUES ($1, $2) ON CONFLICT DO NOTHING', [p!.id, id]);
        }
        break;
      }

      case 'questions': {
        const projetId = await resoudre('projets', 'acronyme', champs.projet ?? '', false);
        const [q] = await query<{ id: number }>(
          'INSERT INTO questions_recherche (libelle, pilote_id, projet_id, notes) VALUES ($1, $2, $3, $4) RETURNING id',
          [libelle, piloteId, projetId, champs.notes || null],
        );
        for (const a of axes) await query('INSERT INTO question_axes VALUES ($1, $2) ON CONFLICT DO NOTHING', [q!.id, a]);
        break;
      }

      case 'idees': {
        const partenaireId = await resoudre('partenaires', 'nom', champs.partenaire ?? '', false);
        const [x] = await query<{ id: number }>(
          'INSERT INTO idees_brutes (libelle, pilote_id, partenaire_id, notes) VALUES ($1, $2, $3, $4) RETURNING id',
          [libelle, piloteId, partenaireId, champs.notes || null],
        );
        for (const a of axes) await query('INSERT INTO idee_axes VALUES ($1, $2) ON CONFLICT DO NOTHING', [x!.id, a]);
        break;
      }

      case 'partenaires': {
        const [pt] = await query<{ id: number }>(
          `INSERT INTO partenaires (nom, ville, pays, notes) VALUES ($1, $2, $3, $4)
           ON CONFLICT (nom) DO UPDATE SET ville = EXCLUDED.ville, pays = EXCLUDED.pays RETURNING id`,
          [libelle, champs.ville || 'Non renseignée', champs.pays || 'Non renseigné', champs.notes || null],
        );
        for (const nom of liste(champs.expertises ?? '')) {
          const id = await resoudre('expertises', 'libelle', nom, true);
          if (id) await query('INSERT INTO partenaire_expertises VALUES ($1, $2) ON CONFLICT DO NOTHING', [pt!.id, id]);
        }
        break;
      }

      case 'transferts': {
        const typeId = (await resoudre('types_transfert', 'libelle', champs.type ?? '', true))
          ?? (await resoudre('types_transfert', 'libelle', 'Outil', true))!;
        const projetId = await resoudre('projets', 'acronyme', champs.projet ?? '', false);
        const [t] = await query<{ id: number }>(
          `INSERT INTO transferts (libelle, type_id, ville, pays, projet_id, date_transfert, reference, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [libelle, typeId, champs.ville || null, champs.pays || null, projetId,
           date(champs.date_transfert ?? ''), champs.reference || null, champs.notes || null],
        );
        for (const nom of liste(champs.pilotes ?? '')) {
          const id = await resoudre('personnes', 'nom', nom, true);
          if (id) await query('INSERT INTO transfert_pilotes VALUES ($1, $2) ON CONFLICT DO NOTHING', [t!.id, id]);
        }
        break;
      }
    }
    importees += 1;
  }

  if (appliquer) {
    await query(
      `INSERT INTO journal (entite, action, resume) VALUES ($1, 'import', $2)`,
      [cible.replace(/s$/, ''), `Import de ${importees} ligne(s) depuis ${fichier}`],
    );
  }

  console.log(`${importees} ligne(s) ${appliquer ? 'importée(s)' : 'importables'}.`);
  if (avertissements.length) {
    console.log(`\n${avertissements.length} point(s) d'attention :`);
    for (const a of avertissements.slice(0, 60)) console.log(`  · ${a}`);
    if (avertissements.length > 60) console.log(`  … et ${avertissements.length - 60} autre(s).`);
  }
  if (!appliquer) console.log('\nMode simulation. Relancez avec --appliquer pour écrire en base.');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
