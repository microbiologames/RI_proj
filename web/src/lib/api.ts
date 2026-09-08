import type { PropositionAdm } from './types';

export class ErreurApi extends Error {
  constructor(readonly statut: number, message: string) {
    super(message);
  }
}

/** Nom facultatif de l'utilisateur : sert uniquement à signer les entrées du journal. */
const CLE_AUTEUR = 'ri.auteur';

export function auteurActuel(): string {
  try {
    return localStorage.getItem(CLE_AUTEUR) ?? '';
  } catch {
    return '';
  }
}

export function definirAuteur(nom: string): void {
  try {
    if (nom.trim()) localStorage.setItem(CLE_AUTEUR, nom.trim());
    else localStorage.removeItem(CLE_AUTEUR);
  } catch {
    /* navigation privée : on se passe de mémorisation */
  }
}

async function requete<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const entetes: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body) entetes['Content-Type'] = 'application/json';
  const nom = auteurActuel();
  if (nom) entetes['X-Auteur'] = nom;

  const reponse = await fetch(`/api${chemin}`, { ...options, headers: entetes });
  if (reponse.status === 204) return undefined as T;

  const texte = await reponse.text();
  const donnees = texte ? JSON.parse(texte) : null;
  if (!reponse.ok) {
    throw new ErreurApi(reponse.status, donnees?.erreur ?? `Erreur ${reponse.status}`);
  }
  return donnees as T;
}

export const api = {
  lister: <T>(ressource: string) => requete<T[]>(`/${ressource}`),
  creer: <T>(ressource: string, corps: unknown) =>
    requete<T>(`/${ressource}`, { method: 'POST', body: JSON.stringify(corps) }),
  modifier: <T>(ressource: string, id: number, corps: unknown) =>
    requete<T>(`/${ressource}/${id}`, { method: 'PATCH', body: JSON.stringify(corps) }),
  supprimer: (ressource: string, id: number) => requete<void>(`/${ressource}/${id}`, { method: 'DELETE' }),

  referentiels: () => requete<import('./types').Referentiels>('/referentiels'),
  creerReference: (cle: string, corps: unknown) =>
    requete<{ id: number; libelle?: string; nom?: string }>(`/referentiels/${cle}`, {
      method: 'POST',
      body: JSON.stringify(corps),
    }),
  modifierAxe: (id: number, corps: unknown) =>
    requete(`/referentiels/axes/${id}`, { method: 'PATCH', body: JSON.stringify(corps) }),

  grappes: () => requete<import('./types').Grappe[]>('/grappes'),
  creerGrappe: (corps: unknown) => requete('/grappes', { method: 'POST', body: JSON.stringify(corps) }),
  modifierGrappe: (id: number, corps: unknown) =>
    requete(`/grappes/${id}`, { method: 'PATCH', body: JSON.stringify(corps) }),
  dissoudreGrappe: (id: number) => requete<void>(`/grappes/${id}`, { method: 'DELETE' }),
  basculerGrappe: (id: number, corps: unknown = {}) =>
    requete<import('./types').Projet>(`/grappes/${id}/bascule`, { method: 'POST', body: JSON.stringify(corps) }),
  basculerEntree: (ressource: 'questions' | 'idees', id: number, corps: unknown = {}) =>
    requete<import('./types').Projet>(`/${ressource}/${id}/bascule`, {
      method: 'POST',
      body: JSON.stringify(corps),
    }),

  journal: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    return requete<import('./types').EntreeJournal[]>(`/journal?${qs}`);
  },

  etatAdm: () => requete<{ disponible: boolean; modele: string }>('/adm/etat'),
  analyserAdm: (cible: string, texte: string) =>
    requete<PropositionAdm>('/adm/analyser', { method: 'POST', body: JSON.stringify({ cible, texte }) }),
  appliquerAdm: (corps: unknown) =>
    requete<{ creees: unknown[]; grappes: unknown[]; message?: string }>('/adm/appliquer', {
      method: 'POST',
      body: JSON.stringify(corps),
    }),

  geocoder: (ville: string, pays: string) =>
    requete<{ lat: number | null; lon: number | null }>('/geocodage', {
      method: 'POST',
      body: JSON.stringify({ ville, pays }),
    }),
  rattraperGeocodage: () => requete<{ traites: number }>('/geocodage/rattrapage', { method: 'POST' }),
};
