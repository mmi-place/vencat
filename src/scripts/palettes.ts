// Course colour palettes. Type colours follow `courseTypes` order; modules pick a colour from a stable hash.
export const courseTypes = ['CM', 'TD', 'TP', 'DS', 'Projet Tutoré', 'Réunion', 'Entreprise', 'inconnu'] as const;

export interface PaletteColor { value: string; name: string }
export interface Palette { id: string; label: string; description: string; colors: readonly PaletteColor[]; modules?: readonly string[] }

const named = (pairs: [string, string][]) => pairs.map(([value, name]) => ({ value, name }));
export const palettes = [
  { id: 'vencat', label: 'Vencat', description: 'Les couleurs d’origine',
    colors: named([['#b72c48', 'Framboise'], ['#24789d', 'Bleu canard'], ['#622fb5', 'Violet'], ['#a32996', 'Magenta'], ['#08774f', 'Vert'], ['#865d22', 'Bronze'], ['#995008', 'Orange brûlé'], ['#334155', 'Ardoise']]),
    // Former module palette, kept so module colours do not change for existing users.
    modules: ['#622fb5', '#24789d', '#08774f', '#b72c48', '#865d22', '#a32996', '#334c83'] },
  { id: 'pastel', label: 'Pastel', description: 'Des teintes douces',
    colors: named([['#e8899b', 'Rose'], ['#7fb8d6', 'Bleu ciel'], ['#a993d9', 'Lavande'], ['#d68cc8', 'Orchidée'], ['#80c4a3', 'Menthe'], ['#d4b07a', 'Sable'], ['#e0a36f', 'Abricot'], ['#9aa5b8', 'Gris bleu']]) },
  { id: 'vivid', label: 'Vive', description: 'Des couleurs franches',
    colors: named([['#e11d48', 'Rouge'], ['#0284c7', 'Bleu'], ['#7c3aed', 'Violet'], ['#c026d3', 'Fuchsia'], ['#059669', 'Émeraude'], ['#d97706', 'Ambre'], ['#ea580c', 'Orange'], ['#475569', 'Gris']]) },
  { id: 'okabe', label: 'Daltonisme', description: 'Palette Okabe-Ito, distincte pour la plupart des daltonismes',
    colors: named([['#d55e00', 'Vermillon'], ['#0072b2', 'Bleu'], ['#cc79a7', 'Rose violacé'], ['#e69f00', 'Orange'], ['#009e73', 'Vert bleuté'], ['#56b4e9', 'Bleu ciel'], ['#f0e442', 'Jaune'], ['#7f7f7f', 'Gris']]) },
  { id: 'mono', label: 'Monochrome bleu', description: 'Des nuances de bleu',
    colors: named([['#1e3a5f', 'Bleu nuit'], ['#2c5282', 'Bleu marine'], ['#3b6aa8', 'Bleu'], ['#4a7fc1', 'Bleu moyen'], ['#6b95cc', 'Bleu clair'], ['#8eaed8', 'Bleu pâle'], ['#5a6b85', 'Gris bleu'], ['#334155', 'Ardoise']]) },
  { id: 'mono-pink', label: 'Monochrome rose', description: 'Des nuances de rose',
    colors: named([['#831843', 'Bordeaux'], ['#9d174d', 'Framboise'], ['#be185d', 'Rose profond'], ['#db2777', 'Rose vif'], ['#ec4899', 'Rose'], ['#f472b6', 'Rose clair'], ['#f9a8d4', 'Rose pâle'], ['#8a5a6e', 'Vieux rose']]) },
] as const satisfies readonly Palette[];
export type PaletteId = typeof palettes[number]['id'];
export const isPaletteId = (value: unknown): value is PaletteId => palettes.some(palette => palette.id === value);
export const paletteById = (id: PaletteId): Palette => palettes.find(palette => palette.id === id) ?? palettes[0];

function hash(text: string) { let value = 0; for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0; return value; }
/** Colour of a course type or module in a palette, before any personal choice. */
export function paletteColor(id: PaletteId, mode: 'type' | 'module', key: string) {
  const palette = paletteById(id), colors = palette.colors.map(color => color.value);
  if (mode === 'type') {
    const index = courseTypes.indexOf(key as typeof courseTypes[number]);
    return colors[index >= 0 ? index : hash(key) % colors.length]!;
  }
  const modules = palette.modules ?? colors;
  return modules[hash(key) % modules.length]!;
}
