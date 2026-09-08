import { useMemo, useState, type ReactNode } from 'react';
import { comparer, useMemoLocal } from '../lib/utils';

export interface Colonne<T> {
  cle: string;
  entete: string;
  /** Colonne masquée par défaut, à activer depuis le sélecteur de colonnes. */
  secondaire?: boolean;
  /** Rendu de la cellule. */
  rendu: (ligne: T) => ReactNode;
  /** Valeur utilisée pour le tri et l'export Excel. */
  valeur?: (ligne: T) => unknown;
  /** Édition sur place : rend le contrôle de saisie. Absent = colonne non modifiable. */
  edition?: (ligne: T, terminer: () => void) => ReactNode;
  numerique?: boolean;
  largeur?: string;
}

interface Props<T extends { id: number; verrouille: boolean }> {
  lignes: T[];
  colonnes: Colonne<T>[];
  /** Sélection multiple : permet le grappage depuis la barre d'actions. */
  selection?: number[];
  onSelection?: (ids: number[]) => void;
  /** Glisser-déposer d'une ligne sur une autre pour les regrouper. */
  onDeposer?: (idGlisse: number, idCible: number) => void;
  onBasculerVerrou?: (ligne: T) => void;
  onSupprimer?: (ligne: T) => void;
  actions?: (ligne: T) => ReactNode;
  messageVide?: string;
  /**
   * Active le sélecteur de colonnes, mémorisé sous cette clé. Sans lui toutes
   * les colonnes sont affichées ; avec lui, les colonnes `secondaire` sont
   * masquées au départ pour que le tableau tienne dans sa largeur.
   */
  cleColonnes?: string;
}

export function Tableau<T extends { id: number; verrouille: boolean }>({
  lignes,
  colonnes: toutesColonnes,
  selection,
  onSelection,
  onDeposer,
  onBasculerVerrou,
  onSupprimer,
  actions,
  messageVide = 'Aucune entrée ne correspond aux filtres.',
  cleColonnes,
}: Props<T>) {
  const [tri, setTri] = useState<{ cle: string; sens: 1 | -1 } | null>(null);
  const [masquees, setMasquees] = useMemoLocal<string[]>(
    `ri.colonnes.${cleColonnes ?? 'aucune'}`,
    cleColonnes ? toutesColonnes.filter((c) => c.secondaire).map((c) => c.cle) : [],
  );
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  const colonnes = cleColonnes ? toutesColonnes.filter((c) => !masquees.includes(c.cle)) : toutesColonnes;
  const [enEdition, setEnEdition] = useState<{ id: number; cle: string } | null>(null);
  const [survole, setSurvole] = useState<number | null>(null);

  const triees = useMemo(() => {
    if (!tri) return lignes;
    const col = colonnes.find((c) => c.cle === tri.cle);
    if (!col) return lignes;
    const extraire = col.valeur ?? ((l: T) => (l as Record<string, unknown>)[col.cle]);
    return [...lignes].sort((a, b) => comparer(extraire(a), extraire(b)) * tri.sens);
  }, [lignes, colonnes, tri]);

  const selectionnable = Boolean(selection && onSelection);
  const toutSelectionne = selectionnable && lignes.length > 0 && selection!.length === lignes.length;

  return (
    // Un seul élément racine : ce composant est posé dans des grilles CSS,
    // où deux enfants seraient placés dans deux colonnes différentes.
    <div style={{ minWidth: 0 }}>
      {cleColonnes && (
        <div className="ligne" style={{ marginBottom: 7, position: 'relative' }}>
          <button type="button" className="btn btn-fantome btn-s" onClick={() => setSelecteurOuvert((v) => !v)}>
            ▦ Colonnes ({colonnes.length}/{toutesColonnes.length})
          </button>
          {selecteurOuvert && (
            <div
              className="panneau"
              style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, minWidth: 230, marginTop: 4 }}
            >
              {toutesColonnes.map((c) => (
                <label key={c.cle} className="ligne petit" style={{ gap: 6, padding: '2px 0' }}>
                  <input
                    type="checkbox"
                    checked={!masquees.includes(c.cle)}
                    onChange={() =>
                      setMasquees(
                        masquees.includes(c.cle) ? masquees.filter((m) => m !== c.cle) : [...masquees, c.cle],
                      )
                    }
                  />
                  {c.entete}
                </label>
              ))}
              <button
                type="button"
                className="btn btn-s"
                style={{ marginTop: 7, width: '100%' }}
                onClick={() => setSelecteurOuvert(false)}
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      )}
      <div className="cadre-tableau">
      <table className="tableau-donnees">
        <thead>
          <tr>
            {selectionnable && (
              <th style={{ width: 34, cursor: 'default' }}>
                <input
                  type="checkbox"
                  checked={toutSelectionne}
                  aria-label="Tout sélectionner"
                  onChange={() => onSelection!(toutSelectionne ? [] : lignes.map((l) => l.id))}
                />
              </th>
            )}
            {colonnes.map((c) => (
              <th
                key={c.cle}
                style={c.largeur ? { width: c.largeur } : undefined}
                onClick={() =>
                  setTri((t) => (t?.cle === c.cle ? { cle: c.cle, sens: t.sens === 1 ? -1 : 1 } : { cle: c.cle, sens: 1 }))
                }
                aria-sort={tri?.cle === c.cle ? (tri.sens === 1 ? 'ascending' : 'descending') : 'none'}
              >
                {c.entete}
                <span className="fleche" aria-hidden="true">
                  {tri?.cle === c.cle ? (tri.sens === 1 ? '▲' : '▼') : '↕'}
                </span>
              </th>
            ))}
            {(onBasculerVerrou || onSupprimer || actions) && (
              // Largeur réservée : sans elle, la colonne libre pousse les
              // boutons d'action hors du cadre visible.
              <th style={{ cursor: 'default', width: 76, minWidth: 76 }} />
            )}
          </tr>
        </thead>
        <tbody>
          {triees.length === 0 && (
            <tr>
              <td className="vide" colSpan={colonnes.length + (selectionnable ? 2 : 1)}>
                {messageVide}
              </td>
            </tr>
          )}
          {triees.map((ligne) => {
            const choisie = selection?.includes(ligne.id) ?? false;
            return (
              <tr
                key={ligne.id}
                aria-selected={choisie}
                className={survole === ligne.id ? 'glisse-dessus' : undefined}
                draggable={Boolean(onDeposer)}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(ligne.id))}
                onDragOver={(e) => {
                  if (!onDeposer) return;
                  e.preventDefault();
                  setSurvole(ligne.id);
                }}
                onDragLeave={() => setSurvole((v) => (v === ligne.id ? null : v))}
                onDrop={(e) => {
                  setSurvole(null);
                  if (!onDeposer) return;
                  const source = Number(e.dataTransfer.getData('text/plain'));
                  if (source && source !== ligne.id) onDeposer(source, ligne.id);
                }}
              >
                {selectionnable && (
                  <td>
                    <input
                      type="checkbox"
                      checked={choisie}
                      aria-label={`Sélectionner la ligne ${ligne.id}`}
                      onChange={() =>
                        onSelection!(choisie ? selection!.filter((i) => i !== ligne.id) : [...selection!, ligne.id])
                      }
                    />
                  </td>
                )}
                {colonnes.map((c) => {
                  const editable = Boolean(c.edition) && !ligne.verrouille;
                  const active = enEdition?.id === ligne.id && enEdition.cle === c.cle;
                  return (
                    <td key={c.cle} className={c.numerique ? 'cellule-num' : undefined}>
                      {active && c.edition ? (
                        c.edition(ligne, () => setEnEdition(null))
                      ) : (
                        <div
                          className={
                            c.edition ? (editable ? 'cellule-modifiable' : 'cellule-modifiable cellule-verrouillee') : undefined
                          }
                          title={c.edition && !editable ? 'Entrée verrouillée' : c.edition ? 'Cliquer pour modifier' : undefined}
                          onClick={() => editable && setEnEdition({ id: ligne.id, cle: c.cle })}
                        >
                          {c.rendu(ligne)}
                        </div>
                      )}
                    </td>
                  );
                })}
                {(onBasculerVerrou || onSupprimer || actions) && (
                  <td className="cellule-actions">
                    {actions?.(ligne)}
                    {onBasculerVerrou && (
                      <button
                        type="button"
                        className="btn btn-fantome btn-s"
                        title={ligne.verrouille ? 'Déverrouiller' : 'Verrouiller (empêche toute modification)'}
                        aria-pressed={ligne.verrouille}
                        onClick={() => onBasculerVerrou(ligne)}
                      >
                        {ligne.verrouille ? '🔒' : '🔓'}
                      </button>
                    )}
                    {onSupprimer && (
                      <button
                        type="button"
                        className="btn btn-fantome btn-s btn-danger"
                        title={ligne.verrouille ? 'Déverrouillez avant de supprimer' : 'Supprimer'}
                        disabled={ligne.verrouille}
                        onClick={() => onSupprimer(ligne)}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* --------------------------------------------- Éditeurs de cellule usuels */

export function EditionTexte({
  valeur,
  onValider,
  terminer,
  multiligne,
}: {
  valeur: string;
  onValider: (v: string) => void;
  terminer: () => void;
  multiligne?: boolean;
}) {
  const [v, setV] = useState(valeur);
  const valider = () => {
    if (v.trim() && v !== valeur) onValider(v.trim());
    terminer();
  };
  const props = {
    autoFocus: true,
    value: v,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onBlur: valider,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (!multiligne || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        valider();
      }
      if (e.key === 'Escape') terminer();
    },
  };
  return multiligne ? <textarea {...props} rows={3} /> : <input type="text" {...props} />;
}

export function EditionNombre({
  valeur,
  onValider,
  terminer,
}: {
  valeur: number | null;
  onValider: (v: number | null) => void;
  terminer: () => void;
}) {
  const [v, setV] = useState(valeur === null ? '' : String(valeur));
  const valider = () => {
    const n = v.trim() === '' ? null : Number(v.replace(',', '.'));
    if (n === null || Number.isFinite(n)) onValider(n);
    terminer();
  };
  return (
    <input
      type="number"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === 'Enter') valider();
        if (e.key === 'Escape') terminer();
      }}
    />
  );
}

export function EditionDate({
  valeur,
  onValider,
  terminer,
}: {
  valeur: string | null;
  onValider: (v: string | null) => void;
  terminer: () => void;
}) {
  return (
    <input
      type="date"
      autoFocus
      defaultValue={valeur ?? ''}
      onBlur={(e) => {
        onValider(e.target.value || null);
        terminer();
      }}
      onKeyDown={(e) => e.key === 'Escape' && terminer()}
    />
  );
}
