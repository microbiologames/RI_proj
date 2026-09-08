import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * Propose des pilotes pour un projet, d'après les expertises de chacun et la
 * charge en cours. C'est une aide au choix : chaque proposition affiche ce qui
 * la justifie, et rien n'est appliqué sans clic.
 */
export function SuggestionPilote({
  axes,
  expertises = [],
  pilotes,
  onChoisir,
}: {
  axes: number[];
  expertises?: number[];
  pilotes: number[];
  onChoisir: (id: number) => void;
}) {
  const suggestions = useQuery({
    queryKey: ['suggestion-pilote', axes, expertises],
    queryFn: () => api.suggestionPilote(expertises, axes),
    enabled: axes.length > 0 || expertises.length > 0,
    staleTime: 60_000,
  });

  if (axes.length === 0 && expertises.length === 0) {
    return (
      <p className="attenue petit" style={{ margin: '6px 0 0' }}>
        Choisissez d'abord un axe de recherche pour obtenir des suggestions de pilote.
      </p>
    );
  }

  const proposees = (suggestions.data ?? []).filter((s) => !pilotes.includes(s.personne.id)).slice(0, 3);
  if (proposees.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <p className="attenue petit" style={{ margin: '0 0 5px' }}>
        Suggestions, d'après les expertises et la charge en cours :
      </p>
      <div className="etiquettes">
        {proposees.map((s) => (
          <button
            key={s.personne.id}
            type="button"
            className="chip"
            title={s.raisons.join(' · ')}
            onClick={() => onChoisir(s.personne.id)}
          >
            + {s.personne.nom}
            <span className="n">{s.nb_projets_en_cours} en cours</span>
          </button>
        ))}
      </div>
    </div>
  );
}
