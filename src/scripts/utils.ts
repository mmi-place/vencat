import { ref } from 'vue';

export const getDuration = (start: Date, end: Date): number => {
    const diff = end.getTime() - start.getTime();
    return diff / (1000 * 60 * 60);
}

export const toFormatHHMM = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

export const durationHHMM = (duration: number): string => {
    const hours = Math.floor(duration / 1);
    const minutes = Math.round(60 * (duration % 1));

	if (duration % 1 == 0) {
		return `${hours}h`;
	} else if (duration < 1) {
		return `${minutes}min`;
	} else {
		return `${hours}h${minutes}min`;
	}

}

export const toFormatJJMoisAAAA = (date: Date, short = false): Record<string, string> => {
	const day: string = date.getDate().toString().padStart(2)
	const mois: string = [
		short ? 'janvier' : 'jan.',
		short ? 'février' : 'fév.',
		short ? 'mars' : 'mars',
		short ? 'avril' : 'avr.',
		short ? 'mai' : 'mai',
		short ? 'juin' : 'juin',
		short ? 'juillet' : 'juil.',
		short ? 'août' : 'août',
		short ? 'septembre' : 'sep.',
		short ? 'octobre' : 'oct.',
		short ? 'novembre' : 'nov.',
		short ? 'décembre' : 'déc.'
	][date.getMonth()]!
	const année: number = date.getFullYear()

	return {
		full: `${day} ${mois} ${année}`,
		month: `${day} ${mois}`
	}
}

export const colors: Record<string, string[]> = {
	// SAMPLE             VERY DARK     DARKER       DARK         ORIGINAL     LIGHT         PASTEL      VERY LIGHT
	'DS':             ['#1A0F1AFF', '#990099', '#CC00CC', '#FF48F3', '#FF99F7', '#FFB3F7', '#FFE6FF'],
	'TD':             ['#0A1117', '#0F3A52', '#1D5A7A', '#2E8DB6', '#6FB5D9', '#A8D9E8', '#D9EFF5'],
	'TP':             ['#0B061A', '#2C1451', '#461F73', '#622FB5', '#9B6FD1', '#D4B5E8', '#EDD9F7'],
	'CM':             ['#1A0609', '#6B1420', '#A01C38', '#E14864', '#EE7A94', '#F5B3C7', '#FDD4DC'],
	'Projet Tutoré':  ['#331100', '#7A3E00', '#B75F00', '#FF9200', '#FFB86A', '#FFD6B3', '#FFF3E6'],
	'Réunion':        ['#2B1A00', '#8B4C00', '#B86600', '#D29130', '#E5B565', '#F0D4A8', '#F9E8D6'],
	'Entreprise':     ['#331100', '#7A3E00', '#B75F00', '#FF9200', '#FFB86A', '#FFD6B3', '#FFF3E6'],
	'pause':          ['#050810', '#0E1820', '#1C2C3E', '#314158', '#6B8FA5', '#A8C7D9', '#D9E8F0'],
	'finished':       ['#050810', '#0E1820', '#1C2C3E', '#314158', '#6B8FA5', '#A8C7D9', '#D9E8F0'],
	'unknown':        ['#050810', '#0E1820', '#1C2C3E', '#314158', '#6B8FA5', '#A8C7D9', '#D9E8F0']
}

export const toOriginal = (key: string): string => {
	return colors[key]?.[3] || '#000000';
}

export const toPastel = (key: string): string => {
	return colors[key]?.[5] || '#FFFFFF';
}


export interface Module {
	title: string;
	emoji: string;
	short: string;
	description: string;
	coeff: number
}

export async function loadModules(): Promise<void> {
	return fetch('https://raw.githubusercontent.com/MMI-CODES/vencat/refs/heads/main/public/modules.json')
		.then(response => response.json())
		.then((data: Record<string, Module>) => {
			modules.value = data;
		})
		.catch(error => {
		console.error('Error loading modules.json:', error);
	});
}

export let modules = ref<Record<string, Module>>({});
