import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErreurApi } from '../lib/api';
import { exporterExcel, exporterPng } from '../lib/export';
import type { Referentiels } from '../lib/types';
import type { Colonne } from '../components/Tableau';
import { Bandeau } from '../components/Base';

/** Charge les référentiels une fois pour toute l'application. */
export function useReferentiels() {
  return useQuery({ queryKey: ['referentiels'], queryFn: api.referentiels, staleTime: 5 * 60_000 });
}

export function useEtatAdm() {
  return useQuery({ queryKey: ['adm'], queryFn: api.etatAdm, staleTime: 10 * 60_000 });
}

/**
 * Données d'une base + mutations. Toute écriture invalide aussi le journal et
 * les effectifs de la navigation, qui en dépendent.
 */
export function useBase<T extends { id: number; verrouille: boolean }>(ressource: string) {
  const qc = useQueryClient();
  const [erreur, setErreur] = useState<string | null>(null);

  const invalider = () => {
    void qc.invalidateQueries({ queryKey: [ressource] });
    void qc.invalidateQueries({ queryKey: ['journal'] });
    void qc.invalidateQueries({ queryKey: ['effectifs'] });
    void qc.invalidateQueries({ queryKey: ['grappes'] });
  };
  const surErreur = (e: unknown) => setErreur(e instanceof ErreurApi ? e.message : String(e));

  const liste = useQuery({ queryKey: [ressource], queryFn: () => api.lister<T>(ressource) });

  const creer = useMutation({
    mutationFn: (corps: unknown) => api.creer<T>(ressource, corps),
    onSuccess: () => { setErreur(null); invalider(); },
    onError: surErreur,
  });

  const modifier = useMutation({
    mutationFn: ({ id, corps }: { id: number; corps: unknown }) => api.modifier<T>(ressource, id, corps),
    onSuccess: () => { setErreur(null); invalider(); },
    onError: surErreur,
  });

  const supprimer = useMutation({
    mutationFn: (id: number) => api.supprimer(ressource, id),
    onSuccess: () => { setErreur(null); invalider(); },
    onError: surErreur,
  });

  return {
    lignes: liste.data ?? [],
    chargement: liste.isLoading,
    erreur: erreur ?? (liste.error ? String(liste.error) : null),
    effacerErreur: () => setErreur(null),
    creer,
    modifier,
    supprimer,
    invalider,
    /** Bascule du verrou : un verrou posé bloque toute modification côté serveur. */
    basculerVerrou: (l: T) => modifier.mutate({ id: l.id, corps: { verrouille: !l.verrouille } }),
    /** Modification d'un seul champ depuis l'édition sur place. */
    majChamp: (id: number, champ: string, valeur: unknown) => modifier.mutate({ id, corps: { [champ]: valeur } }),
  };
}

/** En-tête de page : titre, sous-titre, actions. */
export function EntetePage({
  titre,
  sousTitre,
  actions,
}: {
  titre: string;
  sousTitre: string;
  actions?: ReactNode;
}) {
  return (
    <header className="entete-page">
      <div>
        <h1>{titre}</h1>
        <p>{sousTitre}</p>
      </div>
      {actions && <div className="actions-entete">{actions}</div>}
    </header>
  );
}

/** Bouton d'export Excel construit à partir des colonnes affichées. */
export function BoutonExcel<T>({
  lignes,
  colonnes,
  nom,
}: {
  lignes: T[];
  colonnes: Colonne<T>[];
  nom: string;
}) {
  return (
    <button
      type="button"
      className="btn"
      disabled={lignes.length === 0}
      title={`Exporter ${lignes.length} ligne(s) filtrée(s) au format Excel`}
      onClick={() =>
        void exporterExcel(
          lignes.map((l) =>
            Object.fromEntries(
              colonnes.map((c) => [c.entete, normaliserValeurExcel(c.valeur ? c.valeur(l) : (l as Record<string, unknown>)[c.cle])]),
            ),
          ),
          nom,
          nom.toLowerCase().replace(/\s+/g, '-'),
        )
      }
    >
      ⬇ Excel
    </button>
  );
}

function normaliserValeurExcel(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (Array.isArray(v)) return v.map((x) => normaliserValeurExcel(x)).join(' ; ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.libelle ?? o.nom ?? o.acronyme ?? JSON.stringify(o));
  }
  return String(v);
}

/** Panneau de visuel exportable en image. */
export function PanneauVisuel({
  titre,
  nomFichier,
  children,
  aide,
}: {
  titre: string;
  nomFichier: string;
  children: ReactNode;
  aide?: string;
}) {
  const [zone, setZone] = useState<HTMLElement | null>(null);
  return (
    <section className="panneau" ref={setZone}>
      <div className="entete-panneau">
        <h3>{titre}</h3>
        <button
          type="button"
          className="btn btn-fantome btn-s"
          data-exclure-export="oui"
          title="Exporter ce visuel en PNG"
          onClick={() => zone && exporterPng(zone, nomFichier)}
        >
          ⬇ PNG
        </button>
      </div>
      {aide && <p className="attenue petit" style={{ margin: '0 0 8px' }}>{aide}</p>}
      {children}
    </section>
  );
}

export function EtatChargement({ chargement, erreur, onFermer }: { chargement: boolean; erreur: string | null; onFermer: () => void }) {
  if (erreur) {
    return (
      <Bandeau type="erreur">
        {erreur}{' '}
        <button type="button" className="btn btn-fantome btn-s" onClick={onFermer}>
          Masquer
        </button>
      </Bandeau>
    );
  }
  if (chargement) return <p className="attenue">Chargement…</p>;
  return null;
}

/** Options d'autocomplétion dérivées d'un référentiel. */
export function useOptions(referentiels: Referentiels | undefined) {
  return useMemo(
    () => ({
      personnes: (referentiels?.personnes ?? []).map((p) => ({ id: p.id, libelle: p.nom })),
      axes: (referentiels?.axes ?? []).map((a) => ({ id: a.id, libelle: a.libelle })),
      expertises: (referentiels?.expertises ?? []).map((e) => ({ id: e.id, libelle: e.libelle })),
      financements: (referentiels?.financements ?? []).map((f) => ({ id: f.id, libelle: f.libelle })),
      labellisations: (referentiels?.labellisations ?? []).map((l) => ({ id: l.id, libelle: l.libelle })),
      typesTransfert: (referentiels?.types_transfert ?? []).map((t) => ({ id: t.id, libelle: t.libelle })),
    }),
    [referentiels],
  );
}
