const definitions: Record<string, Record<string, Record<string, { id: string; federation: string }>>> = {
	// BUT MMI
	MMI: {
		"MMI-1": {
			A1: { id: 'G1-QJ2DMFYC5987', federation: 'MMI1-A1' },
			A2: { id: 'G1-PW2GUKMM5988', federation: 'MMI1-A2' },
			B1: { id: 'G1-HN2CHYNX5990', federation: 'MMI1-B1' },
			B2: { id: 'G1-QW2SJTJH5991', federation: 'MMI1-B2' },
		},
		"MMI-2": {
			A1: { id: 'G1-QS2QEJVB5994', federation: 'MMI2-A1' },
			A2: { id: 'G1-EG2LDXAM5995', federation: 'MMI2-A2' },
			B1: { id: 'G1-AE2BGJHX5997', federation: 'MMI2-B1' },
			B2: { id: 'G1-TM2VJCBU5998', federation: 'MMI2-B2' },
		},
		"MMI-3 (dev)": {
			"FA A1": { id: 'G1-TS2PGRAD6003', federation: 'MMI3-FA-DW-A1' },
			"FA A2": { id: 'G1-KL2GMWYW6004', federation: 'MMI3-FA-DW-A2' },
		},
		"MMI-3 (créa)": {
			"FI A1": { id: 'G1-EB2URAPF6006', federation: 'MMI3-FI-CN-A1' },
			"FI A2": { id: 'G1-JP2NSAYC6007', federation: 'MMI3-FI-CN-A2' },
			"FA A1": { id: 'G1-CC2LTGMX6000', federation: 'MMI3-FA-CN-A1' },
			"FA A2": { id: 'G1-HW2LKCBM6001', federation: 'MMI3-FA-CN-A2' },
		},
	},

	// BUT Info
	INF: {
		"INF-1": {
			A: { id: 'G1-BV1RUTBT5956', federation: 'INF1-A' },
			B: { id: 'G1-PA1XYMSF5959', federation: 'INF1-B' },
			C: { id: 'G1-UP1YWYRQ5962', federation: 'INF1-C' },
		},
		"INF-2": {
			FA: { id: 'G1-QM1PNCQX5970', federation: 'INF2-FA' },
			"FI A": { id: 'G1-RA1HBJDH5972', federation: 'INF2-FI-A' },
			"FI B": { id: 'G1-PD1QJJQR5973', federation: 'INF2-FI-B' },
		},
		"INF-3": {
			"FA A": { id: 'G1-QJ1KPJRA5975', federation: 'INF3-FA-A' },
			"FA B": { id: 'G1-YE1UYMEA5976', federation: 'INF3-FA-B' },
			"FI A": { id: 'G1-WR1HNHXU5978', federation: 'INF3-FI-A' },
			"FI B": { id: 'G1-UQ1YJLXT5979', federation: 'INF3-FI-B' },
		},
	},

	// BUT R&T
	RT: {
		"RT-1": {
			FA: { id: 'G1-YY1XGSFH6011', federation: 'RT1-FA' },
			"FI A1": { id: 'G1-TS1FXUJB6014', federation: 'RT1-FI-A1' },
			"FI A2": { id: 'G1-SF1FGXEH6015', federation: 'RT1-FI-A2' },
			"FI B1": { id: 'G1-ME1YAVBA6017', federation: 'RT1-FI-B1' },
			"FI B2": { id: 'G1-DU1UMAFG6018', federation: 'RT1-FI-B2' },
		},
		"RT-2": {
			"FA A1": { id: 'G1-UM1TLGEB6020', federation: 'RT2-FA-A1' },
			"FA A2": { id: 'G1-XU1NASCK6021', federation: 'RT2-FA-A2' },
			"FI A1": { id: 'G1-MF1EXMPN6026', federation: 'RT2-FI-A1' },
			"FI A2": { id: 'G1-BX1FWEYN6027', federation: 'RT2-FI-A2' },
		},
		"RT-3": {
			"FA A1": { id: 'G1-RM1YKYGD6032', federation: 'RT3-FA-A1' },
			"FA A2": { id: 'G1-KE1GKPRT6033', federation: 'RT3-FA-A2' },
			"FI A1": { id: 'G1-WC1FGWBG6035', federation: 'RT3-FI-A1' },
			"FI A2": { id: 'G1-TE1VTMXH6036', federation: 'RT3-FI-A2' },
		},
	},

	// BUT GEII
	GEII: {
		"GEII-1": {
			TDA1: { id: 'G1-RS1PNWQT7615', federation: 'GEII1-TDA1' },
			TDA2: { id: 'G1-BS1SJDDU7616', federation: 'GEII1-TDA2' },
			TDB1: { id: 'G1-VQ1MQQPP7618', federation: 'GEII1-TDB1' },
			TDB2: { id: 'G1-AA1JJWJN7619', federation: 'GEII1-TDB2' },
			TDC: { id: 'G1-QS1HXJLB7620', federation: 'GEII1-TDC' },
		},
		"GEII-2": {
			"FA TP1": { id: 'G1-EF1HVMUY5944', federation: 'GEII2-FA-TP1' },
			"FA TP2": { id: 'G1-AT1LTTHU5945', federation: 'GEII2-FA-TP2' },
			"FI TD1": { id: 'G1-YD1HKFQX5947', federation: 'GEII2-FI-TD1' },
			"FI TD2": { id: 'G1-AE1SWNVW5948', federation: 'GEII2-FI-TD2' },
		},
		"GEII-3": {
			TDAII: { id: 'G1-LX1TKECQ7404', federation: 'GEII3-TDAII' },
			TDESE: { id: 'G1-DU1YSPPS7403', federation: 'GEII3-TDESE' },
		},
	},
} as Record<string, Record<string, Record<string, { id: string; federation: string }>>>;



export const groups = Object.fromEntries(Object.entries(definitions).map(([department, promotions]) => [department, Object.fromEntries(Object.entries(promotions).map(([promotion, entries]) => [promotion, Object.fromEntries(Object.entries(entries).map(([label, entry]) => [label, entry.id]))]))])) as Record<string, Record<string, Record<string, string>>>;

export const GROUP_TO_FEDERATION = Object.fromEntries(Object.values(definitions).flatMap(promotions => Object.values(promotions).flatMap(entries => Object.values(entries).map(entry => [entry.id, entry.federation]))));
