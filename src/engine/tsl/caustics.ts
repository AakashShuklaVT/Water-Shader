import { Fn } from 'three/tsl';
import { vec2, float, clamp, pow, abs } from './math';
import { perlin, perlinD } from './noise';

/**
 * TSL node type (the upstream typings for TSL call signatures are loose).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/**
 * Drift field that warps the caustic network.
 *
 * The caustics are warped by the slope of the water surface, but evaluating
 * the full wave field here would cost five noise evaluations and fourteen
 * sine/cosine pairs per fragment - for a detail that only has to drift and
 * focus. A single drifting gradient gives the same read for a fraction of
 * the price.
 *
 * @param p world space XZ position on the seabed
 * @param time animation time
 */
export const causticWarp = Fn( ( [ p, time ]: [ N, N ] ) => {

	const n = perlinD( p.mul( 0.55 ).add( vec2( time.mul( 0.085 ), time.mul( - 0.058 ) ) ) );

	return n.yz.mul( 0.09 );

} ).setLayout( {
	name: 'oceanCausticWarp',
	type: 'vec2',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'time', type: 'float' },
	],
} );

/**
 * Caustic light pattern projected onto the seabed.
 *
 * The pattern is a network of bright filaments. It is warped by the gradient
 * of the wave field, so the filaments drift with the waves and bunch up in
 * the areas where the surface focuses the sunlight.
 *
 * @param p world space XZ position on the seabed
 * @param gradient surface gradient of the wave field at that position
 * @param time animation time
 */
export const causticPattern = Fn( ( [ p, gradient, time ]: [ N, N, N ] ) => {

	// warp the sampling position with the wave slope: this is what makes the
	// pattern move and focus the way real caustics do
	const q = p.mul( 0.42 ).add( gradient.mul( 3.1 ) );

	const n1 = perlin( q.mul( 0.9 ).add( vec2( time.mul( 0.042 ), time.mul( - 0.028 ) ) ) );
	const n2 = perlin( q.mul( 1.85 ).sub( vec2( time.mul( 0.031 ), time.mul( 0.048 ) ) ) );

	const v = n1.mul( 0.62 ).add( n2.mul( 0.44 ) );

	// ridge like falloff -> bright filaments. The exponent is kept low on
	// purpose: a sharp ridge turns into a thin, hard edged net that reads
	// as a pattern drawn on the sea floor instead of focused light.
	const ridge = clamp( float( 1 ).sub( abs( v ).mul( 1.1 ) ), 0, 1 );

	return pow( ridge, float( 2.0 ) );

} ).setLayout( {
	name: 'oceanCausticPattern',
	type: 'float',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'gradient', type: 'vec2' },
		{ name: 'time', type: 'float' },
	],
} );

/**
 * Final caustic light contribution for a point on the seabed.
 *
 * @param p world space XZ position on the seabed
 * @param gradient surface gradient of the wave field at that position
 * @param shadow 0 in shadow, 1 in full sun
 * @param intensity caustics strength
 * @param sunIntensity sun strength
 * @param time animation time
 */
export const causticLight = Fn(
	( [ p, gradient, shadow, intensity, sunIntensity, time ]: [ N, N, N, N, N, N ] ) => {

		return causticPattern( p, gradient, time )
			.mul( intensity )
			.mul( shadow )
			.mul( sunIntensity );

	} ).setLayout( {
	name: 'oceanCausticLight',
	type: 'float',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'gradient', type: 'vec2' },
		{ name: 'shadow', type: 'float' },
		{ name: 'intensity', type: 'float' },
		{ name: 'sunIntensity', type: 'float' },
		{ name: 'time', type: 'float' },
	],
} );
