import { Color, Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * Sun irradiance expressed in the same radiometric units as the sky radiance.
 *
 * The Preetham sky returns a radiance of roughly 0.1 (zenith) to 5 (horizon)
 * while a sunlit surface has a radiance of about albedo / PI * E. With an
 * irradiance of 3 the balance between the sky, the sun lit sand and the
 * specular highlights of the water matches what a camera would record.
 */
export const SUN_IRRADIANCE = 3.0;

/**
 * Central uniform block shared by every TSL material in the scene.
 *
 * A single module level instance is used on purpose: TSL graphs capture the
 * uniform nodes at build time, so sharing them keeps every material in sync
 * with the GUI without rebuilding shaders when a value changes.
 */
export const U = {
	// time / animation
	time: uniform( 0 ),

	// wave field
	waveAmplitude: uniform( 1 ),
	waveSpeed: uniform( 1 ),
	waveScale: uniform( 1 ),
	waveChoppy: uniform( 0.55 ),

	// sun + atmosphere
	sunDirection: uniform( new Vector3( 0.32, 0.62, 0.72 ).normalize() ),
	sunColor: uniform( new Color( 1.0, 0.955, 0.88 ) ),
	sunIntensity: uniform( 1.0 ),
	turbidity: uniform( 2.6 ),
	rayleigh: uniform( 1.7 ),
	cloudCoverage: uniform( 0.32 ),

	// water body
	waterDepth: uniform( 12 ),
	waterClarity: uniform( 1 ),
	underwaterVisibility: uniform( 26 ),
	reflectionStrength: uniform( 1 ),
	foamAmount: uniform( 0.65 ),

	// underwater effects
	causticsIntensity: uniform( 1 ),
	godRaysIntensity: uniform( 0.9 ),
	particleAmount: uniform( 0.7 ),

	// 0 = camera above the water line, 1 = fully submerged
	underwater: uniform( 0 ),
};
