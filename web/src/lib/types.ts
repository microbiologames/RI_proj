export interface Axe {
  id: number;
  code: string;
  libelle: string;
  couleur: string;
  couleur_sombre: string;
  ordre: number;
  actif: boolean;
}

export interface Reference { id: number; libelle: string }
export interface Expertise extends Reference { domaine: string | null }

export interface Personne {
  id: number;
  nom: string;
  email: string | null;
  actif: boolean;
  fonction: string | null;
  /** false pour les contributeurs hors équipe R&I (ex. « Équipe CO3P »). */
  equipe_ri: boolean;
  ordre: number;
}

export interface PersonneDetail extends Personne {
  expertises: Expertise[];
  nb_projets_en_cours: number;
  nb_projets_total: number;
  nb_questions: number;
  nb_idees: number;
  nb_transferts: number;
}

/** Une problématique porte le rattachement aux axes ; les questions en héritent. */
export interface Problematique {
  id: number;
  libelle: string;
  axes_valides: boolean;
  axes: Axe[];
  nb_questions: number;
  questions: string[];
  cree_le: string;
}

export interface ScopeFeuilleDeRoute {
  id: number;
  axe_id: number;
  axe: Axe;
  scope: string;
  contribution: string | null;
  ordre: number;
}

export interface EtatQualification {
  problematiques: number;
  problematiques_validees: number;
  problematiques_sans_axe: number;
  questions: number;
  questions_sans_axe: number;
  projets: number;
  projets_sans_axe: number;
  idees: number;
  idees_sans_axe: number;
}

export interface SuggestionPilote {
  personne: { id: number; nom: string; fonction: string | null };
  score: number;
  couverture: number;
  nb_projets_en_cours: number;
  experience_axes: number;
  raisons: string[];
}

export interface Referentiels {
  axes: Axe[];
  personnes: Personne[];
  expertises: Expertise[];
  financements: Reference[];
  labellisations: Reference[];
  types_transfert: Reference[];
  transitions: Reference[];
  problematiques: Reference[];
  categories_partenaire: Reference[];
}

export type StatutIdee = 'brute' | 'attente_codir' | 'attente_financement';

export const LIBELLES_STATUT_IDEE: Record<StatutIdee, string> = {
  brute: 'Idée brute',
  attente_codir: 'Attente validation CODIR',
  attente_financement: 'Attente financement',
};

/** Une idée franchit ces étapes avant de devenir un projet en préparation. */
export const COULEURS_STATUT_IDEE: Record<StatutIdee, string> = {
  brute: '#78766f',
  attente_codir: '#fab219',
  attente_financement: '#ec835a',
};

export const LIBELLES_SOURCE_LOCALISATION: Record<string, string> = {
  saisie: 'Saisie',
  recherche_web: 'Trouvée en ligne',
  deduite_du_nom: 'Déduite du nom',
  estimee: 'Estimée — à vérifier',
  sans_lieu: 'Sans implantation propre',
};

export type Statut = 'en_preparation' | 'en_cours' | 'termine' | 'abandonne';

export const LIBELLES_STATUT: Record<Statut, string> = {
  en_preparation: 'En préparation',
  en_cours: 'En cours',
  termine: 'Terminé',
  abandonne: 'Abandonné',
};

/** Couleurs de statut réservées (jamais réutilisées pour une série). */
export const COULEURS_STATUT: Record<Statut, string> = {
  en_preparation: '#fab219',
  en_cours: '#0ca30c',
  termine: '#2a78d6',
  abandonne: '#78766f',
};

interface Base {
  id: number;
  verrouille: boolean;
  cree_le: string;
  maj_le: string;
  notes: string | null;
}

export interface Partenaire extends Base {
  nom: string;
  ville: string | null;
  pays: string | null;
  zone: string | null;
  categorie_id: number | null;
  categorie: Reference | null;
  utile_pour: string | null;
  localisation_source: string;
  latitude: number | null;
  longitude: number | null;
  expertises: Expertise[];
  projets: Array<{ id: number; acronyme: string }>;
}

export interface Projet extends Base {
  acronyme: string;
  titre: string;
  statut: Statut;
  pilotes: Array<{ id: number; nom: string }>;
  date_debut: string | null;
  date_fin: string | null;
  budget_total: number | null;
  budget_adria: number | null;
  pct_financement: number | null;
  contributions_adria: string | null;
  axes: Axe[];
  partenaires: Array<Pick<Partenaire, 'id' | 'nom' | 'ville' | 'pays' | 'latitude' | 'longitude'>>;
  financements: Reference[];
  labellisations: Reference[];
  questions: Array<{ id: number; libelle: string }>;
  nb_transferts: number;
}

export interface Question extends Base {
  libelle: string;
  pilote_id: number | null;
  grappe_id: number | null;
  transition_id: number | null;
  problematique_id: number | null;
  pilote: { id: number; nom: string } | null;
  grappe: { id: number; nom: string } | null;
  transition: Reference | null;
  problematique: { id: number; libelle: string; axes_valides: boolean } | null;
  projets: Array<{ id: number; acronyme: string; titre: string; statut: Statut }>;
  idees: Array<{ id: number; libelle: string; statut: StatutIdee }>;
  axes: Axe[];
}

export interface Idee extends Base {
  libelle: string;
  titre: string | null;
  statut: StatutIdee;
  transition_id: number | null;
  problematique_id: number | null;
  transition: Reference | null;
  problematique: { id: number; libelle: string; axes_valides: boolean } | null;
  questions: Array<{ id: number; libelle: string }>;
  pilote_id: number | null;
  partenaire_id: number | null;
  grappe_id: number | null;
  projet_id: number | null;
  pilote: { id: number; nom: string } | null;
  partenaire: { id: number; nom: string; ville: string; pays: string } | null;
  projet: { id: number; acronyme: string } | null;
  grappe: { id: number; nom: string } | null;
  axes: Axe[];
}

export interface Transfert extends Base {
  libelle: string;
  type_id: number;
  type: Reference;
  ville: string | null;
  pays: string | null;
  latitude: number | null;
  longitude: number | null;
  projet_id: number | null;
  projet: { id: number; acronyme: string; titre: string } | null;
  date_transfert: string | null;
  reference: string | null;
  pilotes: Array<{ id: number; nom: string }>;
  axes: Axe[];
}

export interface Grappe {
  id: number;
  nom: string;
  type_entite: 'question' | 'idee';
  description: string | null;
  origine: 'manuelle' | 'adm';
  projet_id: number | null;
  projet: { id: number; acronyme: string } | null;
  nb_membres: number;
  cree_le: string;
  maj_le: string;
}

export interface EntreeJournal {
  id: number;
  horodatage: string;
  entite: string;
  entite_id: number | null;
  action: string;
  resume: string;
  details: Record<string, unknown>;
  auteur: string | null;
}

/** Proposition rendue par le module ADM, avant validation par l'utilisateur. */
export interface PropositionAdm {
  langue_source: string;
  entrees: Array<{
    libelle: string;
    axes: number[];
    pilote: string | null;
    partenaire: string | null;
    justification: string;
  }>;
  fusions: Array<{
    entree_existante_id: number;
    index_entree_nouvelle: number;
    libelle_fusionne: string;
    justification: string;
  }>;
  grappes: Array<{
    nom: string;
    index_entrees_nouvelles: number[];
    ids_entrees_existantes: number[];
    justification: string;
  }>;
}

/** Toute entité éditable dans un tableau. */
export type Entite = Question | Idee | Projet | Partenaire | Transfert;
