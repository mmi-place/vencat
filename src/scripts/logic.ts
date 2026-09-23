import { ref, watch } from "vue";
import {
	loadWeek,
	calculateTotalCourseHours,
	type UICourse,
	focusedModule,
} from "./timetable";
import { group_id } from "./utils";
import { isMobileViewport } from "./viewport";

export const weekdays = [
	"Lundi",
	"Mardi",
	"Mercredi",
	"Jeudi",
	"Vendredi",
	"Samedi",
	"Dimanche",
];

export const offset = ref<number>(0);
export const viewport = ref<number>(5);

export const days = ref<UICourse[][]>([[], [], [], [], [], [], []]);

/**
 * `day` est la date de référence.
 *
 * IMPORTANT :
 * day peut être N'IMPORTE QUELLE date.
 *
 * Exemple :
 * - lundi
 * - mercredi
 * - dimanche
 *
 * On ne la modifie jamais automatiquement pour la faire
 * correspondre à la vue.
 */
export const day = ref<Date>(new Date());

/**
 * Retourne le lundi de la semaine contenant la date donnée.
 */
export const getMonday = (date: Date): Date => {
	const result = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	);

	const dayOfWeek = result.getDay();
	const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

	result.setDate(result.getDate() + diff);
	result.setHours(0, 0, 0, 0);

	return result;
};

/**
 * Retourne l'index d'un jour dans sa semaine.
 *
 * Lundi    = 0
 * Mardi    = 1
 * Mercredi = 2
 * ...
 * Dimanche = 6
 */
const getDayOffset = (date: Date): number => {
	const dayOfWeek = date.getDay();

	return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
};

/**
 * L'offset dépend uniquement de la vue.
 *
 * Mobile :
 *   offset = jour correspondant à `day`
 *
 * Desktop :
 *   offset = 0
 *
 * IMPORTANT :
 * On ne modifie JAMAIS `day` ici.
 */
watch(
	day,
	(newDate) => {
		offset.value = isMobileViewport.value ? getDayOffset(newDate) : 0;
	},
	{
		immediate: true,
		flush: "sync",
	},
);

/**
 * Charge la semaine correspondant à `day`.
 *
 * Peu importe la valeur de `day`, loadWeek reçoit toujours
 * le lundi de sa semaine.
 */
export const loadCurrentWeek = async () => {
	const monday = getMonday(day.value);

	days.value = await loadWeek(
		group_id.value,
		monday,
		focusedModule.value ? [focusedModule.value] : undefined,
	);

	calculateTotalCourseHours(days.value);
};

/**
 * Ajoute un nombre de jours à une date sans modifier la date originale.
 */
const addDays = (date: Date, amount: number): Date => {
	const result = new Date(date);

	result.setDate(result.getDate() + amount);

	return result;
};

/**
 * Définit la date de référence.
 *
 * La date reste exactement celle fournie.
 * La vue s'adapte automatiquement.
 */
export const setDate = async (date: Date, loadOnFinish: boolean = true) => {
	day.value = new Date(date.getFullYear(), date.getMonth(), date.getDate());

	if (loadOnFinish) {
		await loadCurrentWeek();
	}
};

/**
 * Déplace la date de référence.
 */
const move = async (amount: number, loadOnFinish: boolean = true) => {
	day.value = addDays(day.value, amount);

	if (loadOnFinish) {
		await loadCurrentWeek();
	}
};

/**
 * Jour suivant.
 */
export const fwd = async (loadOnFinish: boolean = true) => {
	await move(1, loadOnFinish);
};

/**
 * Jour précédent.
 */
export const bwd = async (loadOnFinish: boolean = true) => {
	await move(-1, loadOnFinish);
};

/**
 * Avance rapidement.
 *
 * Mobile :
 *   +1 jour
 *
 * Desktop :
 *   +6 jours
 */
export const ffwd = async (amount?: number) => {
	const defaultAmount = isMobileViewport.value ? 1 : 6;

	await move(amount ?? defaultAmount);
};

/**
 * Recule rapidement.
 *
 * Mobile :
 *   -1 jour
 *
 * Desktop :
 *   -6 jours
 */
export const fbwd = async (amount?: number) => {
	const defaultAmount = isMobileViewport.value ? 1 : 6;

	await move(-(amount ?? defaultAmount));
};

/**
 * Retourne la date correspondant à une colonne de la vue.
 *
 * `day` peut être n'importe quelle date.
 *
 * On part du lundi de sa semaine, puis on ajoute :
 *
 *   offset + index
 *
 * Exemple mobile :
 *
 * day    = mercredi
 * offset = 2
 *
 * sectionDate(0) = mercredi
 * sectionDate(1) = jeudi
 * sectionDate(2) = vendredi
 *
 * Exemple desktop :
 *
 * day    = mercredi
 * offset = 0
 *
 * sectionDate(0) = lundi
 * sectionDate(1) = mardi
 * sectionDate(2) = mercredi
 */
export const sectionDate = (index: number): Date => {
	return addDays(getMonday(day.value), offset.value + index);
};

/**
 * Vérifie si deux dates appartiennent à la même semaine.
 */
export const isSameWeek = (date: Date, other: Date = new Date()): boolean => {
	return getMonday(date).getTime() === getMonday(other).getTime();
};

/**
 * Recharge la semaine lorsque le groupe ou le module
 * sélectionné change.
 */
watch([group_id, focusedModule], () => {
	loadCurrentWeek();
});
