import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Partenaire } from '../lib/types';
import { formaterDateHeure } from '../lib/utils';
import { Bandeau, ChoixMultiple, Modale } from '../components/Base';
import { EditionTexte, Tableau, type Colonne } from '../components/Tableau';
import { appliquerFiltres, BarreFiltres, type EtatFiltres, type Facette } from '../components/Filtres';
import { Carte, type PointCarte } from '../components/Carte';
import { BoutonExcel, EntetePage, EtatChargement, PanneauVisuel, useBase, useOptions, useReferentiels } from './commun';

export function PagePartenaires() {
  const base = useBase<Partenaire>('partenaires');
  const { data: referentiels } = useReferentiels();
  const options = useOptions(referentiels);

  const [filtres, setFiltres] = useState<EtatFiltres>({});
  const [recherche, setRecherche] = useState('');
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const facettes: Facette<Partenaire>[] = useMemo(
    () => [
      { cle: 'pays', etiquette: 'Pays', valeurs: (p) => [{ id: `c${p.pays}`, libelle: p.pays }] },
      {
        cle: 'expertises',
        etiquette: 'Expertise',
        valeurs: (p) =>
          p.expertises.length
            ? p.expertises.map((e) => ({ id: `e${e.id}`, libelle: e.libelle }))
            : [{ id: 'e0', libelle: 'Non renseignée' }],
      },
      {
        cle: 'projets',
        etiquette: 'Lien projet',
        valeurs: (p) =>
          p.projets.length ? [{ id: 'lie', libelle: 'Lié à un projet' }] : [{ id: 'libre', libelle: 'Sans projet' }],
      },
    ],
    [],
  );

  const visibles = useMemo(
    () =>
      appliquerFiltres(base.lignes, facettes, filtres, recherche, (p) => [
        p.nom,
        p.ville,
        p.pays,
        p.notes,
        ...p.expertises.map((e) => e.libelle),
      ]),
    [base.lignes, facettes, filtres, recherche],
  );

  const points: PointCarte[] = visibles
    .filter((p): p is Partenaire & { latitude: number; longitude: number } => p.latitude !== null && p.longitude !== null)
    .map((p) => ({
      id: p.id,
      libelle: p.nom,
      sousTitre: `${p.ville}, ${p.pays}${p.expertises.length ? ` — ${p.expertises.map((e) => e.libelle).join(', ')}` : ''}`,
      latitude: p.latitude,
      longitude: p.longitude,
    }));

  const colonnes: Colonne<Partenaire>[] = [
    {
      cle: 'nom',
      entete: 'Partenaire',
      rendu: (p) => <strong>{p.nom}</strong>,
      edition: (p, fin) => <EditionTexte valeur={p.nom} terminer={fin} onValider={(v) => base.majChamp(p.id, 'nom', v)} />,
    },
    {
      cle: 'ville',
      entete: 'Ville',
      largeur: '150px',
      rendu: (p) => p.ville,
      edition: (p, fin) => <EditionTexte valeur={p.ville} terminer={fin} onValider={(v) => base.majChamp(p.id, 'ville', v)} />,
    },
    {
      cle: 'pays',
      entete: 'Pays',
      largeur: '130px',
      rendu: (p) => p.pays,
      edition: (p, fin) => <EditionTexte valeur={p.pays} terminer={fin} onValider={(v) => base.majChamp(p.id, 'pays', v)} />,
    },
    {
      cle: 'expertises',
      entete: 'Expertise',
      largeur: '230px',
      valeur: (p) => p.expertises.map((e) => e.libelle).join(' ; '),
      rendu: (p) => (
        <div className="etiquettes">
          {p.expertises.length ? (
            p.expertises.map((e) => <span key={e.id} className="chip chip-lecture">{e.libelle}</span>)
          ) : (
            <span className="attenue">—</span>
          )}
        </div>
      ),
      edition: (p, fin) => (
        <>
          <ChoixMultiple
            valeurs={p.expertises.map((e) => e.id)}
            options={options.expertises}
            onChanger={(ids) => ids.length > 0 && base.majChamp(p.id, 'expertises', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>Terminer</button>
        </>
      ),
    },
    {
      cle: 'projets',
      entete: 'Projets liés',
      largeur: '150px',
      valeur: (p) => p.projets.map((x) => x.acronyme).join(' ; '),
      rendu: (p) => (
        <div className="etiquettes">
          {p.projets.length ? (
            p.projets.map((x) => <span key={x.id} className="chip chip-lecture">{x.acronyme}</span>)
          ) : (
            <span className="attenue">—</span>
          )}
        </div>
      ),
    },
    {
      cle: 'position',
      entete: 'Carte',
      largeur: '80px',
      valeur: (p) => (p.latitude === null ? 'non' : 'oui'),
      rendu: (p) =>
        p.latitude === null ? (
          <span title="Coordonnées manquantes : lancez le géocodage depuis les réglages">📍<span className="attenue">?</span></span>
        ) : (
          <span title={`${p.latitude.toFixed(3)}, ${p.longitude!.toFixed(3)}`}>📍</span>
        ),
    },
    {
      cle: 'maj_le',
      entete: 'Modifié',
      largeur: '120px',
      valeur: (p) => p.maj_le,
      rendu: (p) => <span className="attenue petit">{formaterDateHeure(p.maj_le)}</span>,
    },
  ];

  if (!referentiels) return <p className="attenue">Chargement…</p>;

  return (
    <>
      <EntetePage
        titre="Partenaires"
        sousTitre="Lieu et expertise de chaque partenaire. Un partenaire peut être lié à un projet, à une idée brute, ou à rien encore."
        actions={
          <>
            <BoutonExcel lignes={visibles} colonnes={colonnes} nom="Partenaires" />
            <button type="button" className="btn btn-primaire" onClick={() => setCreation(true)}>+ Nouveau partenaire</button>
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
        placeholderRecherche="Rechercher un partenaire, une ville, une expertise…"
      />

      <div className="mise-en-page-2col">
        <Tableau
          lignes={visibles}
          colonnes={colonnes}
          onBasculerVerrou={base.basculerVerrou}
          onSupprimer={(p) => confirm(`Supprimer ${p.nom} ?`) && base.supprimer.mutate(p.id)}
        />

        <div className="colonne-visuels">
          <PanneauVisuel
            titre="Cartographie des partenariats"
            nomFichier="carte-partenaires"
            aide={`${points.length} partenaire(s) localisé(s) sur ${visibles.length} affiché(s).`}
          >
            <Carte points={points} hauteur={340} />
          </PanneauVisuel>
        </div>
      </div>

      {creation && (
        <FormulairePartenaire
          referentiels={referentiels}
          onFermer={() => setCreation(false)}
          onEnregistrer={(corps) => { base.creer.mutate(corps); setCreation(false); }}
          onMessage={setMessage}
        />
      )}
    </>
  );
}

function FormulairePartenaire({
  referentiels,
  onFermer,
  onEnregistrer,
  onMessage,
}: {
  referentiels: NonNullable<ReturnType<typeof useReferentiels>['data']>;
  onFermer: () => void;
  onEnregistrer: (corps: unknown) => void;
  onMessage: (m: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [ville, setVille] = useState('');
  const [pays, setPays] = useState('France');
  const [expertises, setExpertises] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [nouvelleExpertise, setNouvelleExpertise] = useState('');
  const [geocodage, setGeocodage] = useState(false);

  async function creer() {
    let latitude: number | null = null;
    let longitude: number | null = null;
    // On tente de géolocaliser à la création : la carte est utilisable tout de suite.
    setGeocodage(true);
    try {
      const point = await api.geocoder(ville.trim(), pays.trim());
      latitude = point.lat;
      longitude = point.lon;
      if (latitude === null) onMessage(`Ville « ${ville} » non localisée : le partenaire est créé sans point sur la carte.`);
    } catch {
      /* le géocodage est un confort, pas une condition de création */
    } finally {
      setGeocodage(false);
    }
    onEnregistrer({
      nom: nom.trim(),
      ville: ville.trim(),
      pays: pays.trim(),
      latitude,
      longitude,
      expertises,
      notes: notes.trim() || null,
    });
  }

  return (
    <Modale
      titre="Nouveau partenaire"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button
            type="button"
            className="btn btn-primaire"
            disabled={!nom.trim() || !ville.trim() || !pays.trim() || expertises.length === 0 || geocodage}
            onClick={creer}
          >
            {geocodage ? 'Localisation…' : 'Créer'}
          </button>
        </>
      }
    >
      <label className="champ">
        <span>Nom <span className="requis">*</span></span>
        <input type="text" autoFocus value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>

      <div className="grille-champs">
        <label className="champ">
          <span>Ville <span className="requis">*</span></span>
          <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} />
        </label>
        <label className="champ">
          <span>Pays <span className="requis">*</span></span>
          <input type="text" value={pays} onChange={(e) => setPays(e.target.value)} />
        </label>
      </div>

      <label className="champ">
        <span>Expertise <span className="requis">*</span></span>
        <ChoixMultiple
          valeurs={expertises}
          options={referentiels.expertises.map((e) => ({ id: e.id, libelle: e.libelle }))}
          onChanger={setExpertises}
        />
        <div className="ligne" style={{ marginTop: 7 }}>
          <input
            type="text"
            value={nouvelleExpertise}
            placeholder="Ajouter une expertise absente de la liste"
            onChange={(e) => setNouvelleExpertise(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== 'Enter' || !nouvelleExpertise.trim()) return;
              e.preventDefault();
              const creee = await api.creerReference('expertises', { libelle: nouvelleExpertise.trim() });
              referentiels.expertises.push({ id: creee.id, libelle: creee.libelle ?? nouvelleExpertise.trim() });
              setExpertises([...expertises, creee.id]);
              setNouvelleExpertise('');
            }}
          />
        </div>
      </label>

      <label className="champ">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
    </Modale>
  );
}
