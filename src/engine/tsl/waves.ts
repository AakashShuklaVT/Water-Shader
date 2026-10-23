import { Fn } from 'three/tsl';
import { vec2, vec4, float, sin, cos, smoothstep, length } from './math';
import { perlinD, fbm3 } from './noise';

/**
 * TSL node type (the upstream typings for TSL call signatures are loose).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const GRAVITY = 9.81;

/** Spatial frequency of the large, irregular swell noise (metres). */
const SWELL_FREQUENCY = 0.016;

interface WaveComponent {
	/** direction of travel in the XZ plane (radians) */
	dir: number;
	/** wavelength in metres */
	len: number;
	/** amplitude in metres at amplitude = 1 */
	amp: number;
	/** phase offset so the components never line up */
	phase: number;
}

/**
 * A small directional wave spectrum.
 *
 * Seven incommensurate wave trains (swell + wind waves) are combined with a
 * drifting fBm "swell" term. The amplitudes follow a roughly Pierson-Moskowitz
 * like fall off (long waves carry more energy), and the frequencies follow the
 * deep water dispersion relation w = sqrt(g * k).
 */
const COMPONENTS: WaveComponent[] = [
	{ dir: 0.12, len: 74.0, amp: 0.48, phase: 0.0 },
	{ dir: 0.83, len: 47.0, amp: 0.31, phase: 1.7 },
	{ dir: 1.57, len: 30.5, amp: 0.195, phase: 3.1 },
	{ dir: 2.34, len: 19.5, amp: 0.12, phase: 4.4 },
	{ dir: 3.08, len: 12.8, amp: 0.068, phase: 5.9 },
	{ dir: 3.95, len: 8.2, amp: 0.036, phase: 2.2 },
	{ dir: 4.90, len: 5.3, amp: 0.018, phase: 0.9 },
];

const SPECTRUM = COMPONENTS.map( ( c ) => {

	const k = ( Math.PI * 2 ) / c.len;

	return {
		kx: Math.cos( c.dir ) * k,
		kz: Math.sin( c.dir ) * k,
		omega: Math.sqrt( GRAVITY * k ),
		amp: c.amp,
		len: c.len,
		phase: c.phase,
	};

} );

/**
 * Sum of the directional wave trains.
 * Returns the height and the analytic gradient (dh/dx, dh/dz).
 *
 * @param p world space XZ position
 * @param viewDist distance of the point from the camera, used for the level
 *   of detail so that the small waves fade out with the distance
 */
function waveTrains( p: N, viewDist: N, time: N, amplitude: N, speed: N, scale: N ) {

	const t = time.mul( speed );

	let h = float( 0 );
	let dhdx = float( 0 );
	let dhdz = float( 0 );

	for ( const c of SPECTRUM ) {

		const kx = scale.mul( c.kx );
		const kz = scale.mul( c.kz );
		// deep water dispersion: w scales with sqrt(k)
		const omega = scale.sqrt().mul( c.omega );

		// distance based level of detail so small waves do not alias far away
		const fade = smoothstep( float( c.len * 5 ), float( c.len * 16 ), viewDist ).oneMinus();
		const a = amplitude.mul( c.amp ).mul( fade );

		const phase = p.x.mul( kx ).add( p.y.mul( kz ) ).sub( omega.mul( t ) ).add( c.phase );

		h = h.add( a.mul( sin( phase ) ) );
		dhdx = dhdx.add( a.mul( kx ).mul( cos( phase ) ) );
		dhdz = dhdz.add( a.mul( kz ).mul( cos( phase ) ) );

	}

	return { h, dhdx, dhdz };

}

/**
 * High frequency ripple gradient (shading only, never displaced).
 */
function detailGradient( p: N, viewDist: N, time: N, amplitude: N ) {

	// fade the ripples out with distance to avoid shimmering noise
	const lod = smoothstep( float( 55 ), float( 14 ), viewDist );
	const strength = float( 0.35 ).add( amplitude.mul( 0.65 ) ).mul( lod );

	// The analytic derivative of perlinD() is taken with respect to its own
	// argument, so it has to be scaled by the frequency the argument was
	// scaled with. Without that the ripples would be far too steep.
	const d1 = perlinD( p.mul( 0.55 ).add( vec2( time.mul( 0.17 ), time.mul( - 0.11 ) ) ) );
	const d2 = perlinD( p.mul( 1.95 ).sub( vec2( time.mul( 0.26 ), time.mul( 0.15 ) ) ) );

	return d1.yz.mul( 0.55 * 0.075 ).add( d2.yz.mul( 1.95 * 0.026 ) ).mul( strength );

}

/**
 * Crest sharpening transfer. Shared by the height and the gradient so the
 * displaced geometry and the shading normals stay consistent.
 */
function sharpen( h: N, choppy: N ) {

	const chop = choppy.mul( 0.2 );

	return h.add( h.mul( h ).mul( h ).mul( chop ) );

}

function sharpenScale( h: N, choppy: N ) {

	const chop = choppy.mul( 0.2 );

	return float( 1 ).add( h.mul( h ).mul( 3 ).mul( chop ) );

}

/**
 * Wave height at a world space XZ position (metres above the still water line).
 *
 * The functions of this module are intentionally free of uniform references:
 * TSL functions that declare a layout are compiled once per backend and then
 * shared by every material, so they may only depend on their arguments.
 *
 * @param p world space XZ position
 * @param viewDist distance of the point from the camera (level of detail)
 */
export const waveHeight = Fn( ( [ p, time, amplitude, speed, scale, choppy, viewDist ]: [ N, N, N, N, N, N, N ] ) => {

	const s = waveTrains( p, viewDist, time, amplitude, speed, scale );

	const swell = fbm3( p.mul( SWELL_FREQUENCY ).add( vec2( time.mul( 0.011 ), time.mul( - 0.008 ) ) ) );
	const h0 = s.h.add( swell.x.mul( amplitude ).mul( 0.55 ) );

	return sharpen( h0, choppy );

} ).setLayout( {
	name: 'oceanWaveHeight',
	type: 'float',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'time', type: 'float' },
		{ name: 'amplitude', type: 'float' },
		{ name: 'speed', type: 'float' },
		{ name: 'scale', type: 'float' },
		{ name: 'choppy', type: 'float' },
		{ name: 'viewDist', type: 'float' },
	],
} );

/**
 * Full wave sample: vec4( height, dh/dx, dh/dz, 0 ).
 * Used for shading, where the normal has to match the displaced surface.
 */
export const waveSurface = Fn( ( [ p, time, amplitude, speed, scale, choppy, viewDist ]: [ N, N, N, N, N, N, N ] ) => {

	const s = waveTrains( p, viewDist, time, amplitude, speed, scale );

	const swell = fbm3( p.mul( SWELL_FREQUENCY ).add( vec2( time.mul( 0.011 ), time.mul( - 0.008 ) ) ) );
	const h0 = s.h.add( swell.x.mul( amplitude ).mul( 0.55 ) );

	const scaleFactor = sharpenScale( h0, choppy );

	const detail = detailGradient( p, viewDist, time, amplitude );

	// The derivative of the fBm is taken with respect to its own argument,
	// so it has to be scaled by the spatial frequency the argument was
	// scaled with. Without that factor the swell would contribute a slope
	// that is larger than the one of the wave trains, which turns the water
	// into noise and floods the whole surface with foam.
	const swellX = s.dhdx.add( swell.y.mul( SWELL_FREQUENCY ).mul( amplitude ).mul( 0.55 ) ).mul( scaleFactor );
	const swellZ = s.dhdz.add( swell.z.mul( SWELL_FREQUENCY ).mul( amplitude ).mul( 0.55 ) ).mul( scaleFactor );

	const dhdx = swellX.add( detail.x );
	const dhdz = swellZ.add( detail.y );

	// the steepness of the large waves, used to place the white caps
	const steepness = length( vec2( swellX, swellZ ) );

	return vec4( sharpen( h0, choppy ), dhdx, dhdz, steepness );

} ).setLayout( {
	name: 'oceanWaveSurface',
	type: 'vec4',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'time', type: 'float' },
		{ name: 'amplitude', type: 'float' },
		{ name: 'speed', type: 'float' },
		{ name: 'scale', type: 'float' },
		{ name: 'choppy', type: 'float' },
		{ name: 'viewDist', type: 'float' },
	],
} );
