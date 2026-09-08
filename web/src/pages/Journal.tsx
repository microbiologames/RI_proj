import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formaterDateHeure } from '../lib/utils';
import { exporterExcel } from '../lib/export';
import { EntetePage } from './commun';

const ENTITES = [
  ['', 'Toutes les bases'],
  ['projet', 'Projets'],
  ['question', 'Questions'],
  ['idee', 'Idées brutes'],
  ['partenaire', 'Partenaires'],
  ['transfert', 'Transferts'],
  ['grappe', 'Grappes'],
] as const;

const ACTIONS = [
  ['', 'Toutes les actions'],
  ['creation', 'Créations'],
  ['modification', 'Modifications'],
  ['suppression', 'Suppressions'],
  ['bascule', 'Bascules en projet'],
  ['grappage', 'Grappages'],
] as const;

/**
 * Historique des logs. Chaque écriture y laisse une trace horodatée : c'est ce
 * qui donne les dates de création des entrées et permet de comprendre ce qui a
 * changé, y compris quand l'auteur n'est pas renseigné (l'application ne
 * demande pas d'authentification).
 */
export function PageJournal() {
  const [entite, setEntite] = useState('');
  const [action, setAction] = useState('');
  const [limite, setLimite] = useState(300);

  const journal = useQuery({
    queryKey: ['journal', entite, action, limite],
    queryFn: () =>
      api.journal({
        ...(entite ? { entite } : {}),
        ...(action ? { action } : {}),
        limite,
      }),
  });

  const lignes = journal.data ?? [];

  return (
    <>
      <EntetePage
        titre="Journal"
        sousTitre="Toutes les écritures, du plus récent au plus ancien. L'auteur n'est renseigné que si un nom a été saisi dans les réglages."
        actions={
          <button
            type="button"
            className="btn"
            disabled={lignes.length === 0}
            onClick={() =>
              exporterExcel(
                lignes.map((e) => ({
                  Horodatage: formaterDateHeure(e.horodatage),
                  Base: e.entite,
                  'Id entrée': e.entite_id ?? '',
                  Action: e.action,
                  Résumé: e.resume,
                  Auteur: e.auteur ?? '',
                })),
                'Journal',
                'journal',
              )
            }
          >
            ⬇ Excel
          </button>
        }
      />

      <div className="barre-filtres">
        <select value={entite} onChange={(e) => setEntite(e.target.value)}>
          {ENTITES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={limite} onChange={(e) => setLimite(Number(e.target.value))}>
          {[100, 300, 1000, 2000].map((n) => (
            <option key={n} value={n}>{n} dernières entrées</option>
          ))}
        </select>
        <span className="attenue petit pousse-droite">{lignes.length} entrée(s)</span>
      </div>

      <div className="cadre-tableau">
        <table>
          <thead>
            <tr>
              <th style={{ width: 140, cursor: 'default' }}>Horodatage</th>
              <th style={{ width: 110, cursor: 'default' }}>Base</th>
              <th style={{ width: 120, cursor: 'default' }}>Action</th>
              <th style={{ cursor: 'default' }}>Résumé</th>
              <th style={{ width: 130, cursor: 'default' }}>Auteur</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td className="vide" colSpan={5}>
                  {journal.isLoading ? 'Chargement…' : 'Aucune entrée pour ces critères.'}
                </td>
              </tr>
            )}
            {lignes.map((e) => (
              <tr key={e.id}>
                <td className="petit mono">{formaterDateHeure(e.horodatage)}</td>
                <td>
                  <span className="chip chip-lecture">{e.entite}</span>
                </td>
                <td className="petit">{e.action}</td>
                <td>
                  {e.resume}
                  {Object.keys(e.details ?? {}).length > 0 && (
                    <details style={{ marginTop: 3 }}>
                      <summary className="attenue petit" style={{ cursor: 'pointer' }}>Détail</summary>
                      <pre
                        className="mono"
                        style={{
                          margin: '5px 0 0', padding: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          background: 'var(--surface-2)', borderRadius: 'var(--rayon-s)', fontSize: 11,
                        }}
                      >
                        {JSON.stringify(e.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </td>
                <td className="petit">{e.auteur ?? <span className="attenue">anonyme</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
