import { Fn } from 'three/tsl';
import { vec2, vec3, float, floor, fract, dot, mix } from './math';

/**
 * TSL node type. The upstream typings for TSL call signatures are intentionally
 * loose, so the helpers below use `any` to stay readable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/**
 * Sinless gradient hash (Dave Hoskins style).
 * Returns a pseudo random 2D gradient in [-1, 1] for the given lattice point.
 */
export const gradHash = Fn( ( [ i ]: [ N ] ) => {

	const p = fract( vec3( i.x, i.y, i.x ).mul( vec3( 0.1031, 0.1030, 0.0973 ) ) );
	const q = p.add( dot( p, p.yzx.add( 33.33 ) ) );

	return fract( vec2( q.x.add( q.y ), q.x.add( q.z ) ).mul( vec2( q.z, q.y ) ) ).mul( 2 ).sub( 1 );

} ).setLayout( {
	name: 'oceanGradHash',
	type: 'vec2',
	inputs: [ { name: 'i', type: 'vec2' } ],
} );

/**
 * Classic 2D gradient (Perlin style) noise.
 * Returns the noise value in roughly [-1, 1].
 */
export const perlin = Fn( ( [ x ]: [ N ] ) => {

	const p = floor( x );
	const w = fract( x );
	const u = w.mul( w ).mul( w ).mul( w.mul( w.mul( 6 ).sub( 15 ) ).add( 10 ) );

	const a = dot( gradHash( vec2( p.x, p.y ) ), w );
	const b = dot( gradHash( vec2( p.x.add( 1 ), p.y ) ), w.sub( vec2( 1, 0 ) ) );
	const c = dot( gradHash( vec2( p.x, p.y.add( 1 ) ) ), w.sub( vec2( 0, 1 ) ) );
	const d = dot( gradHash( vec2( p.x.add( 1 ), p.y.add( 1 ) ) ), w.sub( vec2( 1, 1 ) ) );

	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ).mul( 1.4 );

} ).setLayout( {
	name: 'oceanPerlin',
	type: 'float',
	inputs: [ { name: 'x', type: 'vec2' } ],
} );

/**
 * Gradient noise with analytic derivatives.
 * Returns vec3( value, d/dx, d/dy ) which allows normals to be derived without
 * extra taps (important for the wave field, which is evaluated per fragment).
 */
export const perlinD = Fn( ( [ x ]: [ N ] ) => {

	const p = floor( x );
	const w = fract( x );
	const u = w.mul( w ).mul( w ).mul( w.mul( w.mul( 6 ).sub( 15 ) ).add( 10 ) );
	const du = w.mul( w ).mul( 30 ).mul( w.mul( w.sub( 2 ) ).add( 1 ) );

	const ga = gradHash( vec2( p.x, p.y ) );
	const gb = gradHash( vec2( p.x.add( 1 ), p.y ) );
	const gc = gradHash( vec2( p.x, p.y.add( 1 ) ) );
	const gd = gradHash( vec2( p.x.add( 1 ), p.y.add( 1 ) ) );

	const va = dot( ga, w );
	const vb = dot( gb, w.sub( vec2( 1, 0 ) ) );
	const vc = dot( gc, w.sub( vec2( 0, 1 ) ) );
	const vd = dot( gd, w.sub( vec2( 1, 1 ) ) );

	const k = va.sub( vb ).sub( vc ).add( vd );
	const value = va
		.add( u.x.mul( vb.sub( va ) ) )
		.add( u.y.mul( vc.sub( va ) ) )
		.add( u.x.mul( u.y ).mul( k ) );

	const bracket = ga
		.add( u.x.mul( gb.sub( ga ) ) )
		.add( u.y.mul( gc.sub( ga ) ) )
		.add( u.x.mul( u.y ).mul( ga.sub( gb ).sub( gc ).add( gd ) ) );

	const d = bracket.add( du.mul( vec2( vb, vc ).sub( va ).add( u.yx.mul( k ) ) ) );

	return vec3( value, d );

} ).setLayout( {
	name: 'oceanPerlinD',
	type: 'vec3',
	inputs: [ { name: 'x', type: 'vec2' } ],
} );

/**
 * Three octave fBm with analytic derivatives.
 * Returns vec3( value, d/dx, d/dy ).
 */
export const fbm3 = Fn( ( [ x ]: [ N ] ) => {

	let sum = float( 0 );
	let dsum = vec2( 0 );

	let amp = float( 0.5 );
	let freq = float( 1 );
	let q = x;

	for ( let i = 0; i < 3; i ++ ) {

		const n = perlinD( q );

		sum = sum.add( n.x.mul( amp ) );
		dsum = dsum.add( n.yz.mul( amp.mul( freq ) ) );

		amp = amp.mul( 0.5 );
		freq = freq.mul( 2.03 );
		q = q.mul( 2.03 ).add( vec2( 19.31, 7.77 ) );

	}

	return vec3( sum, dsum );

} ).setLayout( {
	name: 'oceanFbm3',
	type: 'vec3',
	inputs: [ { name: 'x', type: 'vec2' } ],
} );
