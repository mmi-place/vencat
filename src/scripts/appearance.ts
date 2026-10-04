export const backgrounds = [
  { id: 'unified', label: 'Nuit', category: 'Uni', background: '#020618' },
  { id: 'slate', label: 'Ardoise', category: 'Uni', background: '#14181e' },
  { id: 'forest', label: 'Forêt', category: 'Image', background: 'linear-gradient(#020618b8, #020618d9), url(/background.jpg) center / cover' },
  { id: 'winter', label: 'Lumières d’hiver', category: 'Image', background: 'linear-gradient(#020618bb, #020618dc), url(/noel.jpg) center / cover' },
  { id: 'graphite', label: 'Graphite', category: 'Dégradé', background: 'linear-gradient(145deg, #202732, #070b14 80%)' },
  { id: 'dusk', label: 'Crépuscule', category: 'Dégradé', background: 'linear-gradient(155deg, #25203c, #101326 55%, #090e18)' },
  { id: 'sage', label: 'Sauge', category: 'Dégradé', background: 'linear-gradient(145deg, #24342f, #101a19 60%, #080e15)' },
  { id: 'geometry', label: 'Facettes', category: 'Géométrique', background: 'linear-gradient(135deg, transparent 55%, #1c294080 55%), linear-gradient(35deg, #172236 35%, transparent 35%), #0a1020' },
] as const;
export type Background = typeof backgrounds[number]['id'];
export function resolveBackground(value: unknown): Background {
  if (typeof value === 'string' && backgrounds.some(item => item.id === value)) return value as Background;
  return ['image', 'image-darker', 'image-blurried'].includes(String(value)) ? 'forest' : 'unified';
}

export type Theme = 'dark' | 'light' | 'system';
export const themes = [
  { id: 'dark', label: 'Sombre', description: 'Fond sombre, par défaut' },
  { id: 'light', label: 'Clair', description: 'Fond clair' },
  { id: 'system', label: 'Appareil', description: 'Suit le thème du système' },
] as const;
const lightBackgrounds: Record<Background, string> = {
  unified: '#f4f5f8', slate: '#e8edf2',
  forest: 'linear-gradient(#ffffffc4, #ffffffd9), url(/background.jpg) center / cover',
  winter: 'linear-gradient(#ffffffc4, #ffffffd9), url(/noel.jpg) center / cover',
  graphite: 'linear-gradient(145deg, #edf0f5, #dce3ed)', dusk: 'linear-gradient(155deg, #eee8f7, #f4f0fa 55%, #e4eaf2)',
  sage: 'linear-gradient(145deg, #e0eee7, #f0f6f2 60%, #e4edf0)',
  geometry: 'linear-gradient(135deg, transparent 55%, #c6d2e780 55%), linear-gradient(35deg, #e2e8f0 35%, transparent 35%), #f3f5f9',
};
export const backgroundStyle = (id: Background, theme: 'dark' | 'light') => theme === 'light' ? lightBackgrounds[id] : backgrounds.find(item => item.id === id)!.background;
