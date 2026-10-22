/**
 * Quality presets.
 *
 * They control the tessellation of the ocean and the seabed, the number of
 * suspended particles and light shafts and whether the expensive soft shadow
 * lookup on the sand is enabled.
 */
export interface QualityPreset {
	name: 'low' | 'medium' | 'high' | 'ultra';
	oceanRings: number;
	oceanSectors: number;
	seabedRings: number;
	seabedSectors: number;
	particles: number;
	lightShafts: number;
	softShadows: boolean;
}

export const QUALITY_PRESETS: Record<QualityPreset[ 'name' ], QualityPreset> = {
	low: {
		name: 'low',
		oceanRings: 96,
		oceanSectors: 128,
		seabedRings: 48,
		seabedSectors: 64,
		particles: 320,
		lightShafts: 8,
		softShadows: false,
	},
	medium: {
		name: 'medium',
		oceanRings: 144,
		oceanSectors: 192,
		seabedRings: 72,
		seabedSectors: 96,
		particles: 700,
		lightShafts: 14,
		softShadows: false,
	},
	high: {
		name: 'high',
		oceanRings: 192,
		oceanSectors: 256,
		seabedRings: 96,
		seabedSectors: 128,
		particles: 1100,
		lightShafts: 20,
		softShadows: true,
	},
	ultra: {
		name: 'ultra',
		oceanRings: 256,
		oceanSectors: 320,
		seabedRings: 128,
		seabedSectors: 160,
		particles: 1600,
		lightShafts: 28,
		softShadows: true,
	},
};
