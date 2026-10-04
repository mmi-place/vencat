import { groups } from './groups.js';

export const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const groupOptions = Object.entries(groups).flatMap(([department, promotions]) =>
  Object.entries(promotions).flatMap(([promotion, entries]) => Object.entries(entries).map(([label, id]) => ({
    department, promotion, label, id,
    path: `/${department === 'INF' ? 'info' : slug(department)}/${slug(promotion.replace(new RegExp(`^${department}-`), ''))}/${slug(label)}`,
  }))));
export type GroupOption = typeof groupOptions[number];
export const groupById = (id: string) => groupOptions.find(group => group.id === id);
export const groupByPath = (path: string) => groupOptions.find(group => group.path === path.toLowerCase().replace(/\/$/, ''));
