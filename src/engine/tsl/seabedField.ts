import { Fn } from 'three/tsl';
import { vec2, vec3, float, mix, smoothstep, length, min, max, clamp } from './math';
import { fbm3, perlinD } from './noise';

/**
 * TSL node type (the upstream typings for TSL call signatures are loose).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/**
 * Depth of the water column at a world space XZ position.
 *
 * The basin is shallow around the origin (so the sand stays visible) and
 * deepens away from it. A shoal rises on the +X side which produces the
 * turquoise shallow water and the shore foam band.
 */
export const seabedDepth = Fn( ( [ p, waterDepth ]: [ N, N ] ) => {

	const r = length( p );
	const basin = mix( float( 0.32 ), float( 1.0 ), smoothstep( float( 25 ), float( 160 ), r ) );
	const shoal = float( 1 ).sub( float( 0.97 ).mul( smoothstep( float( 90 ), float( 180 ), p.x ) ) );

	return waterDepth.mul( basin ).mul( shoal );

} ).setLayout( {
	name: 'oceanSeabedDepth',
	type: 'float',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'waterDepth', type: 'float' },
	],
} );

/**
 * Height of the seabed (negative below the water line).
 * Large dunes are baked into the geometry, the fine ripples are shading only.
 */
export const seabedHeight = Fn( ( [ p, waterDepth ]: [ N, N ] ) => {

	const depth = seabedDepth( p, waterDepth );
	const dunes = fbm3( p.mul( 0.011 ) ).x.mul( 1.9 ).mul( smoothstep( float( 0.4 ), float( 5 ), depth ) );

	return min( depth.negate().add( dunes ), float( - 0.08 ) );

} ).setLayout( {
	name: 'oceanSeabedHeight',
	type: 'float',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'waterDepth', type: 'float' },
	],
} );

/**
 * Surface gradient of the seabed (dh/dx, dh/dz).
 *
 * Combines the gentle dune slope with the directional sand ripples and a
 * fine sediment grain.
 */
export const seabedSlope = Fn( ( [ p, waterDepth ]: [ N, N ] ) => {

	const depth = seabedDepth( p, waterDepth );

	// dunes
	const dune = fbm3( p.mul( 0.011 ) );
	const duneSlope = dune.yz.mul( 1.9 * 0.011 ).mul( smoothstep( float( 0.4 ), float( 5 ), depth ) );

	// ripples: stretched noise so the crests form parallel bands
	const warp = fbm3( p.mul( 0.028 ) ).x.mul( 7.0 );
	const q = vec2( p.x.add( warp ), p.y.add( warp.mul( 0.35 ) ) );
	const ripple = perlinD( q.mul( vec2( 1.55, 0.32 ) ) );
	const rippleSlope = ripple.yz.mul( vec2( 0.030 * 1.55, 0.030 * 0.32 ) );

	// fine grain
	const grain = perlinD( p.mul( 9.0 ) );
	const grainSlope = grain.yz.mul( 0.0022 * 9.0 );

	return duneSlope.add( rippleSlope ).add( grainSlope );

} ).setLayout( {
	name: 'oceanSeabedSlope',
	type: 'vec2',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'waterDepth', type: 'float' },
	],
} );

/**
 * Albedo of the sand: warm beige with tonal variation, darker mineral
 * specks and a few bright shell fragments.
 */
export const sandAlbedo = Fn( ( [ p ]: [ N ] ) => {

	// wet sand is considerably darker than dry sand
	const base = vec3( 0.375, 0.350, 0.300 );

	// broad tonal variation
	const tone = fbm3( p.mul( 0.07 ) ).x;
	const patch = fbm3( p.mul( 0.35 ) ).x;

	// mineral specks
	const speck = perlinD( p.mul( 22.0 ) ).x;
	const shell = perlinD( p.mul( 3.1 ) ).x;

	// The contrast of the pattern is kept low on purpose: the sand is seen
	// through several metres of water, where the absorption already softens
	// it. A high contrast albedo would make the sea floor compete with the
	// water surface instead of sitting behind it.
	const colour = base
		.mul( float( 1 ).add( tone.mul( 0.16 ) ) )
		.mul( float( 1 ).add( patch.mul( 0.08 ) ) )
		.mul( float( 1 ).sub( smoothstep( float( 0.45 ), float( 0.8 ), speck.abs() ).mul( 0.26 ) ) );

	// bright shell fragments
	const shells = smoothstep( float( 0.72 ), float( 0.88 ), shell.abs() );

	return colour.add( vec3( 0.14, 0.135, 0.125 ).mul( shells ) );

} ).setLayout( {
	name: 'oceanSandAlbedo',
	type: 'vec3',
	inputs: [ { name: 'p', type: 'vec2' } ],
} );

/**
 * How much of the sea floor is still visible at a given path length.
 */
export const seabedVisibility = Fn( ( [ distance, visibility ]: [ N, N ] ) => {

	return clamp( float( 1 ).sub( distance.div( max( visibility, float( 1 ) ) ) ), 0, 1 );

} ).setLayout( {
	name: 'oceanSeabedVisibility',
	type: 'float',
	inputs: [
		{ name: 'distance', type: 'float' },
		{ name: 'visibility', type: 'float' },
	],
} );
