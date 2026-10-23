/**
 * Quality presets.
 *
 * They control the tessellation of the ocean and the seabed, the number of
 * suspended particles and light shafts, whether the expensive soft shadow
 * lookup on the sand is enabled and - most importantly on mobile - the
 * resolution of the drawing buffer.
 *
 * The water shader is entirely fragment bound: every pixel of water
 * evaluates the wave field, the sky, the sea floor and the foam. The frame
 * rate therefore scales with the number of pixels, which is why the presets
 * carry a device pixel ratio cap and a render scale.
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
	/** Upper limit for the device pixel ratio. */
	pixelRatioCap: number;
	/** Additional scale applied to the drawing buffer. */
	renderScale: number;
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
		pixelRatioCap: 1.0,
		renderScale: 0.7,
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
		pixelRatioCap: 1.25,
		renderScale: 0.85,
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
		pixelRatioCap: 1.5,
		renderScale: 1.0,
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
		pixelRatioCap: 2.0,
		renderScale: 1.0,
	},
};
