import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { normaliser } from '../lib/utils';

/* ---------------------------------------------------------------- Modale */

export function Modale({
  titre,
  onFermer,
  children,
  pied,
  large,
}: {
  titre: string;
  onFermer: () => void;
  children: ReactNode;
  pied?: ReactNode;
  large?: boolean;
}) {
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [onFermer]);

  return (
    <div className="voile" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className={large ? 'modale modale-large' : 'modale'} role="dialog" aria-modal="true" aria-label={titre}>
        <div className="entete-modale">
          <h2>{titre}</h2>
          <button type="button" className="btn btn-fantome" onClick={onFermer} aria-label="Fermer">
            ✕
          </button>
        </div>
        {children}
        {pied && <div className="pied-modale">{pied}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Bandeaux */

export function Bandeau({ type = 'info', children }: { type?: 'info' | 'erreur'; children: ReactNode }) {
  return (
    <div className={`bandeau bandeau-${type === 'erreur' ? 'erreur' : 'info'}`} role={type === 'erreur' ? 'alert' : undefined}>
      <span aria-hidden="true">{type === 'erreur' ? '⚠' : 'ℹ'}</span>
      <div>{children}</div>
    </div>
  );
}

/* -------------------------------------------------- Champ à autocomplétion
   « Proposition des réponses en fonction des premiers caractères frappés ».
   Une valeur absente de la liste peut être créée à la volée. */

export interface OptionSaisie {
  id: number;
  libelle: string;
}

export function SaisieAssistee({
  valeur,
  options,
  onChoisir,
  onCreer,
  placeholder,
  autoriserVide = true,
}: {
  valeur: number | null;
  options: OptionSaisie[];
  onChoisir: (id: number | null) => void;
  onCreer?: (libelle: string) => Promise<OptionSaisie>;
  placeholder?: string;
  autoriserVide?: boolean;
}) {
  const choisie = options.find((o) => o.id === valeur) ?? null;
  const [texte, setTexte] = useState(choisie?.libelle ?? '');
  const [ouvert, setOuvert] = useState(false);
  const [indice, setIndice] = useState(0);
  const conteneur = useRef<HTMLDivElement>(null);
  const listeId = useId();

  useEffect(() => setTexte(choisie?.libelle ?? ''), [choisie?.libelle]);

  useEffect(() => {
    const dehors = (e: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) {
        setOuvert(false);
        setTexte(choisie?.libelle ?? '');
      }
    };
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [choisie?.libelle]);

  const filtrees = useMemo(() => {
    const q = normaliser(texte);
    if (!q) return options.slice(0, 50);
    return options.filter((o) => normaliser(o.libelle).includes(q)).slice(0, 50);
  }, [options, texte]);

  const exact = filtrees.some((o) => normaliser(o.libelle) === normaliser(texte));
  const peutCreer = Boolean(onCreer) && texte.trim().length > 1 && !exact;

  async function creer() {
    if (!onCreer) return;
    const cree = await onCreer(texte.trim());
    onChoisir(cree.id);
    setOuvert(false);
  }

  return (
    <div ref={conteneur} style={{ position: 'relative' }}>
      <input
        type="text"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={listeId}
        aria-autocomplete="list"
        value={texte}
        placeholder={placeholder}
        onChange={(e) => {
          setTexte(e.target.value);
          setOuvert(true);
          setIndice(0);
          if (!e.target.value && autoriserVide) onChoisir(null);
        }}
        onFocus={() => setOuvert(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOuvert(true);
            setIndice((i) => Math.min(i + 1, filtrees.length - 1 + (peutCreer ? 1 : 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIndice((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (indice < filtrees.length) {
              const o = filtrees[indice];
              if (o) {
                onChoisir(o.id);
                setTexte(o.libelle);
                setOuvert(false);
              }
            } else if (peutCreer) {
              void creer();
            }
          } else if (e.key === 'Escape') {
            setOuvert(false);
            setTexte(choisie?.libelle ?? '');
          }
        }}
      />
      {ouvert && (filtrees.length > 0 || peutCreer) && (
        <ul
          id={listeId}
          role="listbox"
          style={{
            position: 'absolute', zIndex: 30, top: 'calc(100% + 3px)', left: 0, right: 0,
            maxHeight: 230, overflowY: 'auto', margin: 0, padding: 4, listStyle: 'none',
            background: 'var(--surface)', border: '1px solid var(--bordure-forte)',
            borderRadius: 'var(--rayon-s)', boxShadow: 'var(--ombre)',
          }}
        >
          {filtrees.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === indice}
              onMouseDown={(e) => {
                e.preventDefault();
                onChoisir(o.id);
                setTexte(o.libelle);
                setOuvert(false);
              }}
              onMouseEnter={() => setIndice(i)}
              style={{
                padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                background: i === indice ? 'var(--accent-doux)' : 'transparent',
                color: i === indice ? 'var(--accent)' : 'var(--texte)',
              }}
            >
              {o.libelle}
            </li>
          ))}
          {peutCreer && (
            <li
              role="option"
              aria-selected={indice === filtrees.length}
              onMouseDown={(e) => {
                e.preventDefault();
                void creer();
              }}
              onMouseEnter={() => setIndice(filtrees.length)}
              style={{
                padding: '5px 8px', borderRadius: 4, cursor: 'pointer', borderTop: '1px solid var(--bordure)',
                marginTop: 3, color: 'var(--accent)', fontWeight: 600,
                background: indice === filtrees.length ? 'var(--accent-doux)' : 'transparent',
              }}
            >
              + Créer « {texte.trim()} »
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------- Sélection multiple à chips */

export function ChoixMultiple({
  valeurs,
  options,
  onChanger,
  couleurs,
}: {
  valeurs: number[];
  options: OptionSaisie[];
  onChanger: (ids: number[]) => void;
  couleurs?: Record<number, string>;
}) {
  return (
    <div className="etiquettes">
      {options.map((o) => {
        const actif = valeurs.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className="chip"
            aria-pressed={actif}
            onClick={() => onChanger(actif ? valeurs.filter((v) => v !== o.id) : [...valeurs, o.id])}
          >
            {couleurs?.[o.id] && <span className="pastille" style={{ background: couleurs[o.id] }} />}
            {o.libelle}
          </button>
        );
      })}
    </div>
  );
}
