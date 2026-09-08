/**
 * Jeu de données de démonstration : de quoi voir toutes les pages remplies
 * avant d'importer les données réelles. Idempotent — relançable sans doublon.
 * Ne fait rien si la base contient déjà des projets.
 */
import { pool, query } from './db.js';

const PARTENAIRES = [
  ['INRAE Rennes', 'Rennes', 'France', 48.1173, -1.6778, ['Microbiologie prévisionnelle', 'Modélisation']],
  ['Université de Wageningen', 'Wageningen', 'Pays-Bas', 51.9692, 5.6654, ['Procédés', 'Qualité nutritionnelle']],
  ['Teagasc', 'Cork', 'Irlande', 51.8985, -8.4756, ['Procédés', 'Microbiologie prévisionnelle']],
  ['CTCPA', 'Avignon', 'France', 43.9493, 4.8055, ['Conserverie', 'Procédés']],
  ['Institut Pasteur de Lille', 'Lille', 'France', 50.6292, 3.0573, ['Sécurité sanitaire']],
  ['Universidade do Minho', 'Braga', 'Portugal', 41.5454, -8.4265, ['Emballage actif']],
  ['SINTEF Ocean', 'Trondheim', 'Norvège', 63.4305, 10.3951, ['Produits de la mer', 'Chaîne du froid']],
];

const PERSONNES = ['Camille Le Goff', 'Yann Kerdraon', 'Sophie Marchand', 'Anaïs Rolland', 'Pierre Guichard'];

const PROJETS: Array<[string, string, string, number[], number[], number[], number[], string, string, number, number, number, string]> = [
  ['SPORELESS', 'Maîtrise des spores thermorésistantes en conserverie de légumes', 'en_cours',
    [1, 2], [1, 4], [2], [2], '2025-01-01', '2027-12-31', 480000, 195000, 62,
    "Modélisation prédictive de l'inactivation, essais pilotes de barème thermique, appui à la validation industrielle."],
  ['NIRSCAN', 'Détection en ligne des altérations par spectroscopie proche infrarouge', 'en_cours',
    [2, 4], [2, 3], [3], [1], '2024-09-01', '2026-08-31', 320000, 140000, 55,
    "Acquisition spectrale, développement des modèles chimiométriques, transfert en ligne pilote."],
  ['BIOFILM-MAP', 'Cartographie des biofilms sur lignes de conditionnement', 'termine',
    [1], [5, 1], [3], [1], '2022-03-01', '2024-06-30', 210000, 96000, 70,
    "Protocole d'échantillonnage, identification des niches, préconisations de nettoyage."],
  ['NUTRIPACK', 'Emballages actifs et préservation de la qualité nutritionnelle', 'en_preparation',
    [2, 3], [6, 2], [1], [4], null as unknown as string, null as unknown as string, 0, 0, 0,
    "Montage du consortium en cours."],
  ['COLDCHAIN', 'Continuité de la chaîne du froid sur produits de la mer', 'en_cours',
    [1, 3], [7], [5], [3], '2025-04-01', '2028-03-31', 640000, 210000, 48,
    "Instrumentation des flux, modélisation des ruptures, indicateurs de fraîcheur."],
  ['ALGOPRED', 'Modèles prédictifs ouverts pour la sécurité microbiologique', 'abandonne',
    [1, 4], [1], [4], [], '2023-01-01', '2023-11-30', 150000, 150000, 100,
    "Projet arrêté faute de cofinancement."],
];

const QUESTIONS: Array<[string, number[], number, number | null]> = [
  ['Quel barème thermique garantit une réduction de 6 log des spores de C. botulinum non protéolytique ?', [1, 2], 1, 1],
  ["Comment la matrice alimentaire modifie-t-elle la thermorésistance des spores ?", [1, 2], 1, 1],
  ['Quelle résolution spectrale est nécessaire pour détecter une altération avant seuil sensoriel ?', [2, 4], 2, 2],
  ["Peut-on transférer un modèle chimiométrique d'un produit à un autre sans réétalonnage ?", [4], 2, 2],
  ['Quelles niches de biofilm échappent aux protocoles de nettoyage standard ?', [1], 3, 3],
  ["Quel indicateur temps-température prédit le mieux la fraîcheur perçue d'un poisson ?", [1, 3], 5, 5],
  ["Quel est l'impact d'un emballage actif sur la teneur en vitamines après 21 jours ?", [3], 4, null],
  ["Comment mutualiser les jeux de données de challenge tests entre centres techniques ?", [4], 1, null],
];

const IDEES: Array<[string, number[], number, number | null]> = [
  ["Utiliser l'imagerie hyperspectrale pour cartographier l'humidité résiduelle en séchage", [2, 4], 2, 2],
  ["Coupler capteurs bas coût et apprentissage automatique pour suivre la chaîne du froid en temps réel", [3, 4], 5, 7],
  ['Explorer la fermentation de coproduits légumiers comme conservateur naturel', [2, 3], 4, 4],
  ["Évaluer les protéines d'insectes comme substrat en microbiologie prévisionnelle", [1, 3], 1, null],
  ["Développer un jumeau numérique de l'autoclave pour optimiser les barèmes", [2, 4], 1, 1],
  ["Tester les hautes pressions sur plats cuisinés réfrigérés prêts à consommer", [1, 2], 3, 3],
  ["Mettre en place un observatoire partagé des dérives de procédé", [4], 4, null],
];

const TRANSFERTS: Array<[string, number, string | null, string | null, number[], number | null, string, string | null]> = [
  ["Thermal inactivation of C. botulinum spores in vegetable matrices", 1, 'Rennes', 'France', [1], 1, '2026-02-12', 'doi:10.1016/j.ijfoodmicro.2026.110412'],
  ['Présentation des résultats SPORELESS au congrès EFFoST', 3, 'Valence', 'Espagne', [1, 3], 1, '2025-11-06', null],
  ['Atelier industriels — maîtrise des spores en conserverie', 5, 'Quimper', 'France', [1, 2], 1, '2026-04-15', null],
  ['NIRS en ligne : poster IAFP European Symposium', 6, 'Bruxelles', 'Belgique', [2], 2, '2026-05-20', null],
  ["Prestation d'audit microbiologique — ligne de conditionnement", 7, 'Nantes', 'France', [3], 3, '2025-09-30', null],
  ["Outil de calcul de barème thermique (version bêta)", 8, 'Quimper', 'France', [1, 5], 1, '2026-06-01', null],
  ["Article de vulgarisation sur les biofilms — Process Alimentaire", 2, 'Paris', 'France', [3], 3, '2024-10-02', null],
];

async function seed(): Promise<void> {
  const dejaLa = await query<{ n: number }>('SELECT count(*)::int AS n FROM projets');
  if ((dejaLa[0]?.n ?? 0) > 0) {
    console.log('La base contient déjà des projets : rien à faire.');
    return;
  }

  for (const nom of PERSONNES) {
    await query('INSERT INTO personnes (nom) VALUES ($1) ON CONFLICT (nom) DO NOTHING', [nom]);
  }

  for (const [nom, ville, pays, lat, lon, expertises] of PARTENAIRES) {
    const [p] = await query<{ id: number }>(
      `INSERT INTO partenaires (nom, ville, pays, latitude, longitude) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (nom) DO UPDATE SET ville = EXCLUDED.ville RETURNING id`,
      [nom, ville, pays, lat, lon],
    );
    for (const libelle of expertises as string[]) {
      const [e] = await query<{ id: number }>(
        'INSERT INTO expertises (libelle) VALUES ($1) ON CONFLICT (libelle) DO UPDATE SET libelle = EXCLUDED.libelle RETURNING id',
        [libelle],
      );
      await query('INSERT INTO partenaire_expertises VALUES ($1, $2) ON CONFLICT DO NOTHING', [p!.id, e!.id]);
    }
  }

  for (const [acronyme, titre, statut, axes, partenaires, financements, labels, debut, fin, total, adria, pct, contributions] of PROJETS) {
    const [pr] = await query<{ id: number }>(
      `INSERT INTO projets (acronyme, titre, statut, pilote_id, date_debut, date_fin,
                            budget_total, budget_adria, pct_financement, contributions_adria)
       VALUES ($1, $2, $3::statut_projet, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [acronyme, titre, statut, 1 + (PROJETS.findIndex((p) => p[0] === acronyme) % PERSONNES.length),
       debut, fin, total || null, adria || null, pct || null, contributions],
    );
    for (const a of axes) await query('INSERT INTO projet_axes VALUES ($1, $2)', [pr!.id, a]);
    for (const p of partenaires) await query('INSERT INTO projet_partenaires VALUES ($1, $2) ON CONFLICT DO NOTHING', [pr!.id, p]);
    for (const f of financements) await query('INSERT INTO projet_financements VALUES ($1, $2) ON CONFLICT DO NOTHING', [pr!.id, f]);
    for (const l of labels) await query('INSERT INTO projet_labellisations VALUES ($1, $2) ON CONFLICT DO NOTHING', [pr!.id, l]);
  }

  for (const [libelle, axes, pilote, projet] of QUESTIONS) {
    const [q] = await query<{ id: number }>(
      'INSERT INTO questions_recherche (libelle, pilote_id, projet_id) VALUES ($1, $2, $3) RETURNING id',
      [libelle, pilote, projet],
    );
    for (const a of axes) await query('INSERT INTO question_axes VALUES ($1, $2)', [q!.id, a]);
  }

  for (const [libelle, axes, pilote, partenaire] of IDEES) {
    const [i] = await query<{ id: number }>(
      'INSERT INTO idees_brutes (libelle, pilote_id, partenaire_id) VALUES ($1, $2, $3) RETURNING id',
      [libelle, pilote, partenaire],
    );
    for (const a of axes) await query('INSERT INTO idee_axes VALUES ($1, $2)', [i!.id, a]);
  }

  for (const [libelle, type, ville, pays, pilotes, projet, date, reference] of TRANSFERTS) {
    const coord = PARTENAIRES.find((p) => p[1] === ville);
    const [t] = await query<{ id: number }>(
      `INSERT INTO transferts (libelle, type_id, ville, pays, latitude, longitude, projet_id, date_transfert, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [libelle, type, ville, pays, coord?.[3] ?? villeConnue(ville)?.[0] ?? null,
       coord?.[4] ?? villeConnue(ville)?.[1] ?? null, projet, date, reference],
    );
    for (const p of pilotes) await query('INSERT INTO transfert_pilotes VALUES ($1, $2) ON CONFLICT DO NOTHING', [t!.id, p]);
  }

  // Une grappe de démonstration, pour montrer le chemin idées → projet.
  const [g] = await query<{ id: number }>(
    `INSERT INTO grappes (nom, type_entite, description, origine)
     VALUES ('Capteurs et données en ligne', 'idee',
             'Trois idées convergent vers une instrumentation continue des lignes.', 'manuelle') RETURNING id`,
  );
  await query('UPDATE idees_brutes SET grappe_id = $1 WHERE id IN (1, 2, 5)', [g!.id]);

  await query(
    `INSERT INTO journal (entite, entite_id, action, resume, auteur)
     VALUES ('projet', NULL, 'import', 'Jeu de données de démonstration chargé', NULL)`,
  );

  console.log('Jeu de démonstration chargé.');
}

/** Quelques villes de transfert absentes de la liste des partenaires. */
function villeConnue(ville: string | null): [number, number] | null {
  const table: Record<string, [number, number]> = {
    Valence: [39.4699, -0.3763],
    Quimper: [47.9959, -4.0968],
    Bruxelles: [50.8476, 4.3572],
    Nantes: [47.2184, -1.5536],
    Paris: [48.8566, 2.3522],
  };
  return (ville && table[ville]) || null;
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
