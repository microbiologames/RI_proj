import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Projet, Transfert } from '../lib/types';
import { couleurAxe, formaterDate, useThemeSombre } from '../lib/utils';
import { Bandeau, ChoixMultiple, Modale, SaisieAssistee } from '../components/Base';
import { EditionDate, EditionTexte, Tableau, type Colonne } from '../components/Tableau';
import { appliquerFiltres, BarreFiltres, type EtatFiltres, type Facette } from '../components/Filtres';
import { Carte, type PointCarte } from '../components/Carte';
import { Histogramme } from '../components/Histogramme';
import { BoutonExcel, EntetePage, EtatChargement, PanneauVisuel, useBase, useOptions, useReferentiels } from './commun';

export function PageTransferts() {
  const sombre = useThemeSombre();
  const base = useBase<Transfert>('transferts');
  const { data: referentiels } = useReferentiels();
  const options = useOptions(referentiels);
  const projets = useQuery({ queryKey: ['projets'], queryFn: () => api.lister<Projet>('projets') });

  const [filtres, setFiltres] = useState<EtatFiltres>({});
  const [recherche, setRecherche] = useState('');
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const facettes: Facette<Transfert>[] = useMemo(
    () => [
      { cle: 'type', etiquette: 'Type', valeurs: (t) => [{ id: `t${t.type.id}`, libelle: t.type.libelle }] },
      {
        cle: 'pilotes',
        etiquette: 'Pilote',
        valeurs: (t) =>
          t.pilotes.length ? t.pilotes.map((p) => ({ id: `p${p.id}`, libelle: p.nom })) : [{ id: 'p0', libelle: 'Sans pilote' }],
      },
      {
        cle: 'projet',
        etiquette: 'Projet',
        valeurs: (t) => (t.projet ? [{ id: `pr${t.projet.id}`, libelle: t.projet.acronyme }] : [{ id: 'pr0', libelle: 'Hors projet' }]),
      },
      {
        cle: 'axes',
        etiquette: 'Axes',
        valeurs: (t) => t.axes.map((a) => ({ id: `a${a.id}`, libelle: a.code, couleur: couleurAxe(a, sombre) })),
      },
      {
        cle: 'pays',
        etiquette: 'Pays',
        valeurs: (t) => (t.pays ? [{ id: `c${t.pays}`, libelle: t.pays }] : []),
      },
    ],
    [sombre],
  );

  const visibles = useMemo(
    () =>
      appliquerFiltres(base.lignes, facettes, filtres, recherche, (t) => [
        t.libelle,
        t.reference,
        t.notes,
        t.ville,
        t.projet?.acronyme,
        ...t.pilotes.map((p) => p.nom),
      ]),
    [base.lignes, facettes, filtres, recherche],
  );

  const points: PointCarte[] = visibles
    .filter((t): t is Transfert & { latitude: number; longitude: number } => t.latitude !== null && t.longitude !== null)
    .map((t) => ({
      id: t.id,
      libelle: t.libelle,
      sousTitre: `${t.type.libelle}${t.ville ? ` — ${t.ville}, ${t.pays}` : ''}${t.projet ? ` · ${t.projet.acronyme}` : ''}`,
      latitude: t.latitude,
      longitude: t.longitude,
    }));

  const parType = useMemo(() => {
    const compte = new Map<string, { cle: string; libelle: string; valeur: number }>();
    for (const t of visibles) {
      const e = compte.get(String(t.type.id));
      if (e) e.valeur += 1;
      else compte.set(String(t.type.id), { cle: String(t.type.id), libelle: t.type.libelle, valeur: 1 });
    }
    return [...compte.values()].sort((a, b) => b.valeur - a.valeur);
  }, [visibles]);

  const colonnes: Colonne<Transfert>[] = [
    {
      cle: 'libelle',
      entete: 'Transfert',
      rendu: (t) => (
        <>
          {t.libelle}
          {t.reference && (
            <span className="attenue petit mono" style={{ display: 'block' }}>
              {t.reference}
            </span>
          )}
        </>
      ),
      edition: (t, fin) => (
        <EditionTexte valeur={t.libelle} terminer={fin} multiligne onValider={(v) => base.majChamp(t.id, 'libelle', v)} />
      ),
    },
    {
      cle: 'type',
      entete: 'Type',
      largeur: '165px',
      valeur: (t) => t.type.libelle,
      rendu: (t) => <span className="chip chip-lecture">{t.type.libelle}</span>,
      edition: (t, fin) => (
        <select
          autoFocus
          defaultValue={t.type_id}
          onChange={(e) => { base.majChamp(t.id, 'type_id', Number(e.target.value)); fin(); }}
          onBlur={fin}
        >
          {options.typesTransfert.map((o) => (
            <option key={o.id} value={o.id}>{o.libelle}</option>
          ))}
        </select>
      ),
    },
    {
      cle: 'lieu',
      entete: 'Lieu',
      largeur: '160px',
      valeur: (t) => [t.ville, t.pays].filter(Boolean).join(', '),
      rendu: (t) =>
        t.ville ? (
          <>
            {t.ville}
            <span className="attenue">, {t.pays}</span>
            {t.latitude === null && <span title="Non localisé sur la carte"> 📍?</span>}
          </>
        ) : (
          <span className="attenue">—</span>
        ),
      edition: (t, fin) => (
        <EditionTexte
          valeur={t.ville ?? ''}
          terminer={fin}
          onValider={async (v) => {
            base.majChamp(t.id, 'ville', v);
            if (t.pays) {
              const point = await api.geocoder(v, t.pays);
              if (point.lat !== null) base.modifier.mutate({ id: t.id, corps: { latitude: point.lat, longitude: point.lon } });
            }
          }}
        />
      ),
    },
    {
      cle: 'projet',
      entete: 'Projet lié',
      largeur: '130px',
      valeur: (t) => t.projet?.acronyme ?? '',
      rendu: (t) =>
        t.projet ? <span className="chip chip-lecture" title={t.projet.titre}>{t.projet.acronyme}</span> : <span className="attenue">—</span>,
      edition: (t, fin) => (
        <SaisieAssistee
          valeur={t.projet_id}
          options={(projets.data ?? []).map((p) => ({ id: p.id, libelle: `${p.acronyme} — ${p.titre}` }))}
          onChoisir={(id) => { base.majChamp(t.id, 'projet_id', id); fin(); }}
        />
      ),
    },
    {
      cle: 'pilotes',
      entete: 'Pilote(s)',
      largeur: '170px',
      valeur: (t) => t.pilotes.map((p) => p.nom).join(' ; '),
      rendu: (t) => (
        <div className="etiquettes">
          {t.pilotes.length ? (
            t.pilotes.map((p) => <span key={p.id} className="chip chip-lecture">{p.nom}</span>)
          ) : (
            <span className="attenue">—</span>
          )}
        </div>
      ),
      edition: (t, fin) => (
        <>
          <ChoixMultiple
            valeurs={t.pilotes.map((p) => p.id)}
            options={options.personnes}
            onChanger={(ids) => ids.length > 0 && base.majChamp(t.id, 'pilotes', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>Terminer</button>
        </>
      ),
    },
    {
      cle: 'date_transfert',
      entete: 'Date',
      largeur: '110px',
      valeur: (t) => t.date_transfert ?? '',
      rendu: (t) => formaterDate(t.date_transfert),
      edition: (t, fin) => (
        <EditionDate valeur={t.date_transfert} terminer={fin} onValider={(v) => base.majChamp(t.id, 'date_transfert', v)} />
      ),
    },
  ];

  if (!referentiels) return <p className="attenue">Chargement…</p>;

  return (
    <>
      <EntetePage
        titre="Transferts"
        sousTitre="Les actions de valorisation qui font suite aux projets : publications, communications, prestations, outils."
        actions={
          <>
            <BoutonExcel lignes={visibles} colonnes={colonnes} nom="Transferts" />
            <button type="button" className="btn btn-primaire" onClick={() => setCreation(true)}>+ Nouveau transfert</button>
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
        placeholderRecherche="Rechercher un transfert, une référence…"
      />

      <div className="mise-en-page-2col">
        <Tableau
          lignes={visibles}
          colonnes={colonnes}
          onBasculerVerrou={base.basculerVerrou}
          onSupprimer={(t) => confirm(`Supprimer « ${t.libelle.slice(0, 60)} » ?`) && base.supprimer.mutate(t.id)}
        />

        <div className="colonne-visuels">
          <PanneauVisuel
            titre="Cartographie des transferts"
            nomFichier="carte-transferts"
            aide={`${points.length} transfert(s) localisé(s) sur ${visibles.length} affiché(s).`}
          >
            <Carte points={points} hauteur={300} />
          </PanneauVisuel>

          <PanneauVisuel titre="Nombre de transferts par type" nomFichier="histogramme-transferts">
            <Histogramme donnees={parType} unite="transfert" />
          </PanneauVisuel>
        </div>
      </div>

      {creation && (
        <FormulaireTransfert
          referentiels={referentiels}
          projets={projets.data ?? []}
          onFermer={() => setCreation(false)}
          onEnregistrer={(corps) => { base.creer.mutate(corps); setCreation(false); }}
          onMessage={setMessage}
        />
      )}
    </>
  );
}

function FormulaireTransfert({
  referentiels,
  projets,
  onFermer,
  onEnregistrer,
  onMessage,
}: {
  referentiels: NonNullable<ReturnType<typeof useReferentiels>['data']>;
  projets: Projet[];
  onFermer: () => void;
  onEnregistrer: (corps: unknown) => void;
  onMessage: (m: string) => void;
}) {
  const [libelle, setLibelle] = useState('');
  const [typeId, setTypeId] = useState<number>(referentiels.types_transfert[0]?.id ?? 0);
  const [ville, setVille] = useState('');
  const [pays, setPays] = useState('France');
  const [projetId, setProjetId] = useState<number | null>(null);
  const [pilotes, setPilotes] = useState<number[]>([]);
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function creer() {
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (ville.trim() && pays.trim()) {
      setEnCours(true);
      try {
        const point = await api.geocoder(ville.trim(), pays.trim());
        latitude = point.lat;
        longitude = point.lon;
        if (latitude === null) onMessage(`Ville « ${ville} » non localisée : le transfert n'apparaîtra pas sur la carte.`);
      } catch {
        /* sans importance : le transfert existe même sans point */
      } finally {
        setEnCours(false);
      }
    }
    onEnregistrer({
      libelle: libelle.trim(),
      type_id: typeId,
      ville: ville.trim() || null,
      pays: pays.trim() || null,
      latitude,
      longitude,
      projet_id: projetId,
      pilotes,
      date_transfert: date || null,
      reference: reference.trim() || null,
    });
  }

  return (
    <Modale
      titre="Nouveau transfert"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button
            type="button"
            className="btn btn-primaire"
            disabled={!libelle.trim() || !typeId || pilotes.length === 0 || enCours}
            onClick={creer}
          >
            {enCours ? 'Localisation…' : 'Créer'}
          </button>
        </>
      }
    >
      <label className="champ">
        <span>Intitulé <span className="requis">*</span></span>
        <textarea value={libelle} onChange={(e) => setLibelle(e.target.value)} rows={2} autoFocus />
      </label>

      <div className="grille-champs">
        <label className="champ">
          <span>Type <span className="requis">*</span></span>
          <select value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            {referentiels.types_transfert.map((t) => (
              <option key={t.id} value={t.id}>{t.libelle}</option>
            ))}
          </select>
        </label>
        <label className="champ">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="grille-champs">
        <label className="champ">
          <span>Ville <span className="attenue">— lieu du transfert</span></span>
          <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} />
        </label>
        <label className="champ">
          <span>Pays</span>
          <input type="text" value={pays} onChange={(e) => setPays(e.target.value)} />
        </label>
      </div>

      <label className="champ">
        <span>Pilote(s) <span className="requis">*</span></span>
        <ChoixMultiple
          valeurs={pilotes}
          options={referentiels.personnes.map((p) => ({ id: p.id, libelle: p.nom }))}
          onChanger={setPilotes}
        />
      </label>

      <label className="champ">
        <span>Projet lié</span>
        <SaisieAssistee
          valeur={projetId}
          options={projets.map((p) => ({ id: p.id, libelle: `${p.acronyme} — ${p.titre}` }))}
          onChoisir={setProjetId}
          placeholder="Aucun"
        />
      </label>

      <label className="champ">
        <span>Référence <span className="attenue">— DOI, lien, référence bibliographique</span></span>
        <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
    </Modale>
  );
}
