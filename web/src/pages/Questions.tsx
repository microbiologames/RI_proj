import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Grappe, Projet, Question } from '../lib/types';
import { couleurAxe, formaterDateHeure, useThemeSombre } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Bandeau, ChoixMultiple, Modale, SaisieAssistee } from '../components/Base';
import { EditionTexte, Tableau, type Colonne } from '../components/Tableau';
import { appliquerFiltres, BarreFiltres, type EtatFiltres, type Facette } from '../components/Filtres';
import { DialogueAdm } from '../components/DialogueAdm';
import { BoutonExcel, EntetePage, EtatChargement, useBase, useEtatAdm, useOptions, useReferentiels } from './commun';
import { BarreGrappage } from './Grappage';

export function PageQuestions() {
  const sombre = useThemeSombre();
  const base = useBase<Question>('questions');
  const { data: referentiels } = useReferentiels();
  const { data: adm } = useEtatAdm();
  const options = useOptions(referentiels);
  const projets = useQuery({ queryKey: ['projets'], queryFn: () => api.lister<Projet>('projets') });
  const grappes = useQuery({ queryKey: ['grappes'], queryFn: api.grappes });

  const [filtres, setFiltres] = useState<EtatFiltres>({});
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<number[]>([]);
  const [dialogueAdm, setDialogueAdm] = useState(false);
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const facettes: Facette<Question>[] = useMemo(
    () => [
      {
        cle: 'axes',
        etiquette: 'Axes',
        valeurs: (q) => q.axes.map((a) => ({ id: `a${a.id}`, libelle: a.code, couleur: couleurAxe(a, sombre) })),
      },
      {
        cle: 'pilote',
        etiquette: 'Pilote',
        valeurs: (q) => (q.pilote ? [{ id: `p${q.pilote.id}`, libelle: q.pilote.nom }] : [{ id: 'p0', libelle: 'Sans pilote' }]),
      },
      {
        cle: 'projet',
        etiquette: 'Projet',
        valeurs: (q) =>
          q.projet ? [{ id: `pr${q.projet.id}`, libelle: q.projet.acronyme }] : [{ id: 'pr0', libelle: 'Non rattachée' }],
      },
      {
        cle: 'grappe',
        etiquette: 'Grappe',
        valeurs: (q) => (q.grappe ? [{ id: `g${q.grappe.id}`, libelle: q.grappe.nom }] : []),
      },
    ],
    [sombre],
  );

  const visibles = useMemo(
    () => appliquerFiltres(base.lignes, facettes, filtres, recherche, (q) => [q.libelle, q.notes, q.pilote?.nom, q.projet?.acronyme]),
    [base.lignes, facettes, filtres, recherche],
  );

  const colonnes: Colonne<Question>[] = [
    {
      cle: 'libelle',
      entete: 'Question de recherche',
      rendu: (q) => q.libelle,
      edition: (q, fin) => (
        <EditionTexte valeur={q.libelle} terminer={fin} multiligne onValider={(v) => base.majChamp(q.id, 'libelle', v)} />
      ),
    },
    {
      cle: 'pilote',
      entete: 'Pilote',
      largeur: '160px',
      valeur: (q) => q.pilote?.nom ?? '',
      rendu: (q) => q.pilote?.nom ?? <span className="attenue">—</span>,
      edition: (q, fin) => (
        <SaisieAssistee
          valeur={q.pilote_id}
          options={options.personnes}
          onChoisir={(id) => { base.majChamp(q.id, 'pilote_id', id); fin(); }}
          onCreer={async (nom) => {
            const c = await api.creerReference('personnes', { libelle: nom });
            return { id: c.id, libelle: c.nom ?? nom };
          }}
        />
      ),
    },
    {
      cle: 'projet',
      entete: 'Projet',
      largeur: '150px',
      valeur: (q) => q.projet?.acronyme ?? '',
      rendu: (q) =>
        q.projet ? (
          <span className="chip chip-lecture" title={q.projet.titre}>{q.projet.acronyme}</span>
        ) : (
          <span className="attenue">—</span>
        ),
      edition: (q, fin) => (
        <SaisieAssistee
          valeur={q.projet_id}
          options={(projets.data ?? []).map((p) => ({ id: p.id, libelle: `${p.acronyme} — ${p.titre}` }))}
          onChoisir={(id) => { base.majChamp(q.id, 'projet_id', id); fin(); }}
        />
      ),
    },
    {
      cle: 'axes',
      entete: 'Axes de recherche',
      largeur: '210px',
      valeur: (q) => q.axes.map((a) => a.code).join(' '),
      rendu: (q) => (
        <div className="etiquettes">
          {q.axes.map((a) => (
            <span key={a.id} className="chip chip-lecture" title={a.libelle}>
              <span className="pastille" style={{ background: couleurAxe(a, sombre) }} />
              {a.code}
            </span>
          ))}
        </div>
      ),
      edition: (q, fin) => (
        <>
          <ChoixMultiple
            valeurs={q.axes.map((a) => a.id)}
            options={options.axes}
            couleurs={Object.fromEntries((referentiels?.axes ?? []).map((a) => [a.id, couleurAxe(a, sombre)]))}
            onChanger={(ids) => ids.length > 0 && base.majChamp(q.id, 'axes', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>
            Terminer
          </button>
        </>
      ),
    },
    {
      cle: 'grappe',
      entete: 'Grappe',
      largeur: '140px',
      valeur: (q) => q.grappe?.nom ?? '',
      rendu: (q) => (q.grappe ? <span className="chip chip-lecture">{q.grappe.nom}</span> : <span className="attenue">—</span>),
    },
    {
      cle: 'maj_le',
      entete: 'Modifiée',
      largeur: '120px',
      valeur: (q) => q.maj_le,
      rendu: (q) => <span className="attenue petit">{formaterDateHeure(q.maj_le)}</span>,
    },
  ];

  if (!referentiels) return <p className="attenue">Chargement…</p>;

  return (
    <>
      <EntetePage
        titre="Questions de recherche"
        sousTitre="Chaque question relève d'au moins un axe de recherche ; le rattachement à un pilote et à un projet reste facultatif."
        actions={
          <>
            <BoutonExcel lignes={visibles} colonnes={colonnes} nom="Questions de recherche" />
            <button type="button" className="btn" onClick={() => setDialogueAdm(true)}>
              ✦ Acquisition de données
            </button>
            <button type="button" className="btn btn-primaire" onClick={() => setCreation(true)}>
              + Nouvelle question
            </button>
          </>
        }
      />

      {message && <Bandeau>{message}</Bandeau>}
      <EtatChargement chargement={base.chargement} erreur={base.erreur} onFermer={base.effacerErreur} />

      <BarreFiltres
        lignes={base.lignes}
        facettes={facettes}
        etat={filtres}
        onChanger={setFiltres}
        recherche={recherche}
        onRecherche={setRecherche}
        placeholderRecherche="Rechercher dans les questions…"
      />

      <BarreGrappage
        typeEntite="question"
        ressource="questions"
        selection={selection}
        onSelection={setSelection}
        grappes={grappes.data ?? []}
        lignes={base.lignes}
        onFait={(m) => { setMessage(m); base.invalider(); }}
      />

      <Tableau
        lignes={visibles}
        colonnes={colonnes}
        selection={selection}
        onSelection={setSelection}
        onDeposer={(source, cible) => setSelection([...new Set([...selection, source, cible])])}
        onBasculerVerrou={base.basculerVerrou}
        onSupprimer={(q) => confirm(`Supprimer « ${q.libelle.slice(0, 60)} » ?`) && base.supprimer.mutate(q.id)}
      />

      {dialogueAdm && (
        <DialogueAdm
          cible="question"
          referentiels={referentiels}
          admDisponible={adm?.disponible ?? false}
          onFermer={() => setDialogueAdm(false)}
          onEnregistre={(m) => { setMessage(m); setDialogueAdm(false); base.invalider(); }}
        />
      )}

      {creation && (
        <FormulaireQuestion
          referentiels={referentiels}
          projets={projets.data ?? []}
          onFermer={() => setCreation(false)}
          onEnregistrer={(corps) => { base.creer.mutate(corps); setCreation(false); }}
        />
      )}
    </>
  );
}

function FormulaireQuestion({
  referentiels,
  projets,
  onFermer,
  onEnregistrer,
}: {
  referentiels: NonNullable<ReturnType<typeof useReferentiels>['data']>;
  projets: Projet[];
  onFermer: () => void;
  onEnregistrer: (corps: unknown) => void;
}) {
  const sombre = useThemeSombre();
  const [libelle, setLibelle] = useState('');
  const [axes, setAxes] = useState<number[]>([]);
  const [piloteId, setPiloteId] = useState<number | null>(null);
  const [projetId, setProjetId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const valide = libelle.trim().length > 0 && axes.length > 0;

  return (
    <Modale
      titre="Nouvelle question de recherche"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button
            type="button"
            className="btn btn-primaire"
            disabled={!valide}
            onClick={() =>
              onEnregistrer({
                libelle: libelle.trim(),
                axes,
                pilote_id: piloteId,
                projet_id: projetId,
                notes: notes.trim() || null,
              })
            }
          >
            Créer
          </button>
        </>
      }
    >
      <label className="champ">
        <span>Question <span className="requis">*</span></span>
        <textarea value={libelle} onChange={(e) => setLibelle(e.target.value)} rows={3} autoFocus />
      </label>

      <label className="champ">
        <span>Axes de recherche <span className="requis">*</span></span>
        <ChoixMultiple
          valeurs={axes}
          options={referentiels.axes.map((a) => ({ id: a.id, libelle: a.libelle }))}
          couleurs={Object.fromEntries(referentiels.axes.map((a) => [a.id, couleurAxe(a, sombre)]))}
          onChanger={setAxes}
        />
      </label>

      <div className="grille-champs">
        <label className="champ">
          <span>Pilote</span>
          <SaisieAssistee
            valeur={piloteId}
            options={referentiels.personnes.map((p) => ({ id: p.id, libelle: p.nom }))}
            onChoisir={setPiloteId}
            onCreer={async (nom) => {
              const c = await api.creerReference('personnes', { libelle: nom });
              return { id: c.id, libelle: c.nom ?? nom };
            }}
            placeholder="Aucun"
          />
        </label>
        <label className="champ">
          <span>Projet</span>
          <SaisieAssistee
            valeur={projetId}
            options={projets.map((p) => ({ id: p.id, libelle: `${p.acronyme} — ${p.titre}` }))}
            onChoisir={setProjetId}
            placeholder="Aucun"
          />
        </label>
      </div>

      <label className="champ">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
    </Modale>
  );
}
