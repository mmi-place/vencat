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
	'CM':             ['#1A0609', '#6B1420', '#A01C38', '#E14864', '#EE7A94', '#F5B3C7', '#FDD4DC'],
	'DS':             ['#1A0F1A', '#990099', '#CC00CC', '#FF48F3', '#FF99F7', '#FFB3F7', '#FFE6FF'],
	'TP':             ['#0B061A', '#2C1451', '#461F73', '#622FB5', '#9B6FD1', '#D4B5E8', '#EDD9F7'],
	'TD':             ['#0A1117', '#0F3A52', '#1D5A7A', '#2E8DB6', '#6FB5D9', '#A8D9E8', '#D9EFF5'],
	'Projet Tutoré':  ['#000905', '#046741', '#069F65', '#08C57D', '#38F7AE', '#96FBD5', '#E2FEF3'],
	'Réunion':        ['#2B1A00', '#8B4C00', '#B86600', '#D29130', '#E5B565', '#F0D4A8', '#F9E8D6'],
	'Entreprise':     ['#331100', '#7A3E00', '#B75F00', '#F27E00', '#FFB86A', '#FFD6B3', '#FFF3E6'],
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



export const groups: Record<string, Record<string, Record<string, string>>> = {
	// BUT MMI
	MMI: {
		"MMI-1": {
			A1: "G1-QJ2DMFYC5987",
			A2: "G1-PW2GUKMM5988",
			B1: "G1-HN2CHYNX5990",
			B2: "G1-QW2SJTJH5991",
		},
		"MMI-2": {
			A1: "G1-QS2QEJVB5994",
			A2: "G1-EG2LDXAM5995",
			B1: "G1-AE2BGJHX5997",
			B2: "G1-TM2VJCBU5998",
		},
		"MMI-3 (dev)": {
			"FA A1": "G1-TS2PGRAD6003",
			"FA A2": "G1-KL2GMWYW6004",
		},
		"MMI-3 (créa)": {
			"FI A1": "G1-EB2URAPF6006",
			"FI A2": "G1-JP2NSAYC6007",
			"FA A1": "G1-CC2LTGMX6000",
			"FA A2": "G1-HW2LKCBM6001",
		},
	},

	// BUT Info
	INF: {
		"INF-1": {
			A: "G1-BV1RUTBT5956",
			B: "G1-PA1XYMSF5959",
			C: "G1-UP1YWYRQ5962",
		},
		"INF-2": {
			FA: "G1-QM1PNCQX5970",
			"FI A": "G1-RA1HBJDH5972",
			"FI B": "G1-PD1QJJQR5973",
		},
		"INF-3": {
			"FA A": "G1-QJ1KPJRA5975",
			"FA B": "G1-YE1UYMEA5976",
			"FI A": "G1-WR1HNHXU5978",
			"FI B": "G1-UQ1YJLXT5979",
		},
	},

	// BUT R&T
	RT: {
		"RT-1": {
			FA: "G1-YY1XGSFH6011",
			"FI A1": "G1-TS1FXUJB6014",
			"FI A2": "G1-SF1FGXEH6015",
			"FI B1": "G1-ME1YAVBA6017",
			"FI B2": "G1-DU1UMAFG6018",
		},
		"RT-2": {
			"FA A1": "G1-UM1TLGEB6020",
			"FA A2": "G1-XU1NASCK6021",
			"FI A1": "G1-MF1EXMPN6026",
			"FI A2": "G1-BX1FWEYN6027",
		},
		"RT-3": {
			"FA A1": "G1-RM1YKYGD6032",
			"FA A2": "G1-KE1GKPRT6033",
			"FI A1": "G1-WC1FGWBG6035",
			"FI A2": "G1-TE1VTMXH6036",
		},
	},

	// BUT GEII
	GEII: {
		"GEII-1": {
			TDA1: "G1-RS1PNWQT7615",
			TDA2: "G1-BS1SJDDU7616",
			TDB1: "G1-VQ1MQQPP7618",
			TDB2: "G1-AA1JJWJN7619",
			TDC: "G1-QS1HXJLB7620",
		},
		"GEII-2": {
			"FA TP1": "G1-EF1HVMUY5944",
			"FA TP2": "G1-AT1LTTHU5945",
			"FI TD1": "G1-YD1HKFQX5947",
			"FI TD2": "G1-AE1SWNVW5948",
		},
		"GEII-3": {
			TDAII: "G1-LX1TKECQ7404",
			TDESE: "G1-DU1YSPPS7403",
		},
	},
} as Record<string, Record<string, Record<string, string>>>;


import { watch, computed } from 'vue';

export const dept_id = ref<string>(localStorage.getItem('dept_id') || "MMI");
export const promo_id = ref<string>(localStorage.getItem('promo_id') || Object.keys(groups[dept_id.value]!)[0]!);
export const group_id = ref<string>(localStorage.getItem('group_id') || Object.values(groups[dept_id.value]![promo_id.value]!)![0]!);

export const group_label = computed(() => {
	return Object.entries(groups[dept_id.value]![promo_id.value]!).find(([label, id]) => id === group_id.value)?.[0] || '';
});

watch(dept_id, () => {
	promo_id.value = Object.keys(groups[dept_id.value]!)[0]!;
	group_id.value = Object.values(groups[dept_id.value]![promo_id.value]!)[0]!;
	localStorage.setItem('dept_id', dept_id.value);
	localStorage.setItem('promo_id', promo_id.value);
	localStorage.setItem('group_id', group_id.value);
})

watch(promo_id, () => {
	group_id.value = Object.values(groups[dept_id.value]![promo_id.value]!)[0]!;
	localStorage.setItem('promo_id', promo_id.value);
	localStorage.setItem('group_id', group_id.value);
})

watch(group_id, () => {
	localStorage.setItem('group_id', group_id.value);
})

export interface Module {
	title: string;
	emoji: string;
	short: string;
	description: string;
	coeff: number
}

export async function loadModules(): Promise<void> {
	return fetch('https://raw.githubusercontent.com/mmi-place/vencat/refs/heads/main/public/modules.json')
		.then(response => response.json())
		.then((data: Record<string, Module>) => {
			modules.value = data;
		})
		.catch(error => {
		console.error('Error loading modules.json:', error);
	});
}

export let modules = ref<Record<string, Module>>({});
