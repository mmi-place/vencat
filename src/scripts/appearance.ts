export const backgrounds = [
  { id: 'unified', label: 'Nuit', category: 'Uni', background: '#020618' },
  { id: 'slate', label: 'Ardoise', category: 'Uni', background: '#14181e' },
  { id: 'forest', label: 'Forêt', category: 'Image', background: 'linear-gradient(#0206188c, #02061899), url(/background.jpg) center / cover' },
  { id: 'winter', label: 'Lumières d’hiver', category: 'Image', background: 'linear-gradient(#0206188c, #02061899), url(/noel.jpg) center / cover' },
  { id: 'lake', label: 'Lac alpin', category: 'Image', background: 'linear-gradient(#0206188c, #02061899), url(/backgrounds/lake.jpg) center / cover' },
  { id: 'ocean', label: 'Océan', category: 'Image', background: 'linear-gradient(#0206188c, #02061899), url(/backgrounds/ocean.jpg) center / cover' },
  { id: 'hills', label: 'Collines', category: 'Image', background: 'linear-gradient(#0206188c, #02061899), url(/backgrounds/hills.jpg) center / cover' },
  { id: 'custom', label: 'Mon image', category: 'Image', background: '#020618' },
  { id: 'graphite', label: 'Graphite', category: 'Dégradé', background: 'linear-gradient(145deg, #202732, #070b14 80%)' },
  { id: 'dusk', label: 'Crépuscule', category: 'Dégradé', background: 'linear-gradient(155deg, #25203c, #101326 55%, #090e18)' },
  { id: 'sage', label: 'Sauge', category: 'Dégradé', background: 'linear-gradient(145deg, #24342f, #101a19 60%, #080e15)' },
  { id: 'geometry', label: 'Facettes', category: 'Géométrique', background: 'linear-gradient(135deg, transparent 55%, #1c294080 55%), linear-gradient(35deg, #172236 35%, transparent 35%), #0a1020' },
  { id: 'dots', label: 'Points', category: 'Géométrique', background: 'radial-gradient(#69799140 1px, transparent 1px) 0 0 / 22px 22px, #0b1423' },
  { id: 'rings', label: 'Cercles', category: 'Géométrique', background: 'radial-gradient(ellipse at 100% 0%, transparent 35%, #263d5250 35% 45%, transparent 45% 55%, #263d5250 55% 65%, transparent 65%), #0b1423' },
  { id: 'panels', label: 'Plans', category: 'Géométrique', background: 'linear-gradient(115deg, transparent 40%, #32426360 40% 60%, transparent 60%), #101a2b' },
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
  forest: 'linear-gradient(#ffffffa3, #ffffffb3), url(/background.jpg) center / cover',
  winter: 'linear-gradient(#ffffffa3, #ffffffb3), url(/noel.jpg) center / cover',
  lake: 'linear-gradient(#ffffffa3, #ffffffb3), url(/backgrounds/lake.jpg) center / cover',
  ocean: 'linear-gradient(#ffffffa3, #ffffffb3), url(/backgrounds/ocean.jpg) center / cover',
  hills: 'linear-gradient(#ffffffa3, #ffffffb3), url(/backgrounds/hills.jpg) center / cover',
  custom: '#f4f5f8',
  dots: 'radial-gradient(#6c7e9a55 1px, transparent 1px) 0 0 / 22px 22px, #edf1f6',
  rings: 'radial-gradient(ellipse at 100% 0%, transparent 35%, #a9bddb50 35% 45%, transparent 45% 55%, #a9bddb50 55% 65%, transparent 65%), #edf1f6',
  panels: 'linear-gradient(115deg, transparent 40%, #a9bddb60 40% 60%, transparent 60%), #edf1f6',
  graphite: 'linear-gradient(145deg, #edf0f5, #dce3ed)', dusk: 'linear-gradient(155deg, #eee8f7, #f4f0fa 55%, #e4eaf2)',
  sage: 'linear-gradient(145deg, #e0eee7, #f0f6f2 60%, #e4edf0)',
  geometry: 'linear-gradient(135deg, transparent 55%, #c6d2e780 55%), linear-gradient(35deg, #e2e8f0 35%, transparent 35%), #f3f5f9',
};
export const backgroundStyle = (id: Background, theme: 'dark' | 'light', customUrl = '') => {
  if (id === 'custom' && customUrl) return 'linear-gradient(' + (theme === 'light' ? '#ffffffa3, #ffffffb3' : '#0206188c, #02061899') + '), url("' + customUrl + '") center / cover';
  return theme === 'light' ? lightBackgrounds[id] : backgrounds.find(item => item.id === id)!.background;
};
