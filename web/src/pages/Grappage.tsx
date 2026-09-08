import { useState } from 'react';
import { api, ErreurApi } from '../lib/api';
import type { Grappe } from '../lib/types';
import { Bandeau, Modale } from '../components/Base';

interface LigneGrappable {
  id: number;
  libelle: string;
  grappe_id: number | null;
  projet_id?: number | null;
}

/**
 * Actions de grappage sur la sélection courante.
 *
 * Deux chemins vers un projet, comme prévu au cahier des charges : basculer
 * une grappe entière, ou basculer une entrée seule. Dans les deux cas le
 * projet est créé au statut « en préparation », avec l'union des axes des
 * éléments d'origine.
 */
export function BarreGrappage({
  typeEntite,
  ressource,
  selection,
  onSelection,
  grappes,
  lignes,
  onFait,
}: {
  typeEntite: 'question' | 'idee';
  ressource: 'questions' | 'idees';
  selection: number[];
  onSelection: (ids: number[]) => void;
  grappes: Grappe[];
  lignes: LigneGrappable[];
  onFait: (message: string) => void;
}) {
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const choisies = lignes.filter((l) => selection.includes(l.id));
  const grappesUtilisables = grappes.filter((g) => g.type_entite === typeEntite && !g.projet_id);

  async function executer(action: () => Promise<string>) {
    setEnCours(true);
    setErreur(null);
    try {
      onFait(await action());
      onSelection([]);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  }

  if (selection.length === 0) {
    return erreur ? <Bandeau type="erreur">{erreur}</Bandeau> : null;
  }

  return (
    <>
      {erreur && <Bandeau type="erreur">{erreur}</Bandeau>}
      <div className="barre-filtres" style={{ borderColor: 'var(--accent)' }}>
        <strong style={{ fontSize: 13 }}>
          {selection.length} {selection.length > 1 ? 'entrées sélectionnées' : 'entrée sélectionnée'}
        </strong>

        <button type="button" className="btn btn-s" disabled={selection.length < 2 || enCours} onClick={() => setCreation(true)}>
          ⧉ Créer une grappe
        </button>

        {grappesUtilisables.length > 0 && (
          <select
            className="btn btn-s"
            value=""
            disabled={enCours}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (!id) return;
              void executer(async () => {
                await api.modifierGrappe(id, { ajouter: selection });
                return `${selection.length} entrée(s) ajoutée(s) à la grappe.`;
              });
            }}
          >
            <option value="">Ajouter à une grappe existante…</option>
            {grappesUtilisables.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom} ({g.nb_membres})
              </option>
            ))}
          </select>
        )}

        {choisies.some((l) => l.grappe_id) && (
          <button
            type="button"
            className="btn btn-s"
            disabled={enCours}
            onClick={() => {
              const parGrappe = new Map<number, number[]>();
              for (const l of choisies) {
                if (!l.grappe_id) continue;
                parGrappe.set(l.grappe_id, [...(parGrappe.get(l.grappe_id) ?? []), l.id]);
              }
              void executer(async () => {
                for (const [id, ids] of parGrappe) await api.modifierGrappe(id, { retirer: ids });
                return 'Entrées retirées de leur grappe.';
              });
            }}
          >
            Retirer de la grappe
          </button>
        )}

        {selection.length === 1 && (
          <button
            type="button"
            className="btn btn-s btn-primaire"
            disabled={enCours || Boolean(choisies[0]?.projet_id)}
            title={
              choisies[0]?.projet_id
                ? 'Cette entrée est déjà rattachée à un projet.'
                : 'Créer un projet « en préparation » à partir de cette entrée'
            }
            onClick={() =>
              void executer(async () => {
                const p = await api.basculerEntree(ressource, selection[0]!);
                return `Projet ${p.acronyme} créé en préparation.`;
              })
            }
          >
            → Basculer en projet
          </button>
        )}

        <button type="button" className="btn btn-fantome btn-s pousse-droite" onClick={() => onSelection([])}>
          Désélectionner
        </button>
      </div>

      {creation && (
        <FormulaireGrappe
          nbMembres={selection.length}
          typeEntite={typeEntite}
          onFermer={() => setCreation(false)}
          onCreer={(nom, description, basculer) => {
            setCreation(false);
            void executer(async () => {
              const g = (await api.creerGrappe({
                nom,
                type_entite: typeEntite,
                description: description || null,
                membres: selection,
              })) as Grappe;
              if (!basculer) return `Grappe « ${nom} » créée avec ${selection.length} élément(s).`;
              const p = await api.basculerGrappe(g.id);
              return `Grappe « ${nom} » créée et basculée dans le projet ${p.acronyme} (en préparation).`;
            });
          }}
        />
      )}
    </>
  );
}

function FormulaireGrappe({
  nbMembres,
  typeEntite,
  onFermer,
  onCreer,
}: {
  nbMembres: number;
  typeEntite: 'question' | 'idee';
  onFermer: () => void;
  onCreer: (nom: string, description: string, basculer: boolean) => void;
}) {
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [basculer, setBasculer] = useState(false);

  return (
    <Modale
      titre={`Regrouper ${nbMembres} ${typeEntite === 'idee' ? 'idées brutes' : 'questions'}`}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button
            type="button"
            className="btn btn-primaire"
            disabled={!nom.trim()}
            onClick={() => onCreer(nom.trim(), description.trim(), basculer)}
          >
            {basculer ? 'Créer et basculer en projet' : 'Créer la grappe'}
          </button>
        </>
      }
    >
      <label className="champ">
        <span>Nom de la grappe <span className="requis">*</span></span>
        <input
          type="text"
          value={nom}
          autoFocus
          onChange={(e) => setNom(e.target.value)}
          placeholder="Servira de titre au projet en cas de bascule"
        />
      </label>
      <label className="champ">
        <span>Ce qui relie ces éléments</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </label>
      <label className="ligne" style={{ gap: 7 }}>
        <input type="checkbox" checked={basculer} onChange={() => setBasculer((v) => !v)} />
        <span>
          Basculer immédiatement dans la base projets, au statut <strong>« en préparation »</strong>
        </span>
      </label>
    </Modale>
  );
}
