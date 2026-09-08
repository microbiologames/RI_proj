import { useEffect, useState } from 'react';
import type { Axe } from './types';

/** Normalise pour comparer sans accents ni casse (recherche, autocomplétion). */
export function normaliser(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function formaterDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

export function formaterDateHeure(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formaterEuros(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

/** Vrai si le thème effectif est sombre — sert à choisir la variante de couleur des axes. */
export function useThemeSombre(): boolean {
  const [sombre, setSombre] = useState(estSombre);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const relire = () => setSombre(estSombre());
    media.addEventListener('change', relire);
    const observateur = new MutationObserver(relire);
    observateur.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', relire);
      observateur.disconnect();
    };
  }, []);
  return sombre;
}

function estSombre(): boolean {
  const stamp = document.documentElement.dataset.theme;
  if (stamp === 'dark') return true;
  if (stamp === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function couleurAxe(axe: Pick<Axe, 'couleur' | 'couleur_sombre'>, sombre: boolean): string {
  return sombre ? axe.couleur_sombre : axe.couleur;
}

/** Trie une liste sur une clé, en gérant nombres, dates et chaînes accentuées. */
export function comparer(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
}

/** État persisté dans le navigateur (préférences d'affichage uniquement). */
export function useMemoLocal<T>(cle: string, valeurInitiale: T): [T, (v: T) => void] {
  const [valeur, setValeur] = useState<T>(() => {
    try {
      const brut = localStorage.getItem(cle);
      return brut ? (JSON.parse(brut) as T) : valeurInitiale;
    } catch {
      return valeurInitiale;
    }
  });
  const definir = (v: T) => {
    setValeur(v);
    try {
      localStorage.setItem(cle, JSON.stringify(v));
    } catch {
      /* stockage indisponible : la préférence ne survivra pas au rechargement */
    }
  };
  return [valeur, definir];
}
