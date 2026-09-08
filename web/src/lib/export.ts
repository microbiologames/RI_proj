
function horodatage(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

function telecharger(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export PNG d'un visuel. La couleur de fond est relue sur la page pour que
 * l'image reste lisible quel que soit le thème actif.
 */
export async function exporterPng(element: HTMLElement, nom: string): Promise<void> {
  // Chargés à la demande : ces deux bibliothèques pèsent l'essentiel du bundle
  // et ne servent qu'au moment d'un export.
  const { toPng } = await import('html-to-image');
  const fond = getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#ffffff';
  const donnees = await toPng(element, {
    backgroundColor: fond,
    pixelRatio: 2,
    // Les contrôles (boutons d'export…) n'ont pas leur place dans l'image.
    filter: (n) => !(n instanceof HTMLElement && n.dataset.exclureExport === 'oui'),
  });
  const a = document.createElement('a');
  a.href = donnees;
  a.download = `${nom}-${horodatage()}.png`;
  a.click();
}

/** Export Excel d'un tableau déjà mis en forme (colonnes = en-têtes visibles). */
export async function exporterExcel(
  lignes: Array<Record<string, unknown>>,
  nomFeuille: string,
  nomFichier: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const feuille = XLSX.utils.json_to_sheet(lignes);
  const largeurs = Object.keys(lignes[0] ?? {}).map((cle) => ({
    wch: Math.min(
      60,
      Math.max(cle.length + 2, ...lignes.map((l) => String(l[cle] ?? '').length + 2).concat([10])),
    ),
  }));
  feuille['!cols'] = largeurs;
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, nomFeuille.slice(0, 31));
  const buffer = XLSX.write(classeur, { bookType: 'xlsx', type: 'array' });
  telecharger(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${nomFichier}-${horodatage()}.xlsx`,
  );
}
