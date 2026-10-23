import { Fn } from 'three/tsl';
import { vec3, float, clamp, pow, max, min, dot, exp, sqrt, normalize } from './math';

/**
 * TSL node type (the upstream typings for TSL call signatures are loose).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Refractive index of sea water. */
export const WATER_IOR = 1.333;

/** Ratio between the refractive index of air and of sea water. */
export const WATER_ETA = 1 / WATER_IOR;

/**
 * Exact Fresnel reflectance of a dielectric interface.
 *
 * Schlick's approximation is noticeably wrong between roughly 40 and 80
 * degrees of incidence, which is exactly the band the ocean surface is seen
 * from. The full Fresnel equations are cheap, so they are used instead: the
 * reflection now rises smoothly towards 1 at grazing angles and the water
 * stays transparent when the camera looks straight down into it.
 *
 * @param cosTheta cosine of the angle between the view ray and the normal
 * @param eta ratio of the incident and the transmitted refractive index
 */
export const fresnelDielectric = Fn( ( [ cosTheta, eta ]: [ N, N ] ) => {

	const c = clamp( cosTheta, 0, 1 );
	const sinT2 = eta.mul( eta ).mul( float( 1 ).sub( c.mul( c ) ) );
	const cosT = sqrt( max( float( 1 ).sub( sinT2 ), 0 ) );

	const rs = c.sub( eta.mul( cosT ) ).div( max( c.add( eta.mul( cosT ) ), float( 1e-4 ) ) );
	const rp = eta.mul( c ).sub( cosT ).div( max( eta.mul( c ).add( cosT ), float( 1e-4 ) ) );

	return clamp( float( 0.5 ).mul( rs.mul( rs ).add( rp.mul( rp ) ) ), 0, 1 );

} ).setLayout( {
	name: 'oceanFresnelDielectric',
	type: 'float',
	inputs: [
		{ name: 'cosTheta', type: 'float' },
		{ name: 'eta', type: 'float' },
	],
} );

/**
 * Fresnel reflectance of the air / water interface.
 */
export const fresnelWater = Fn( ( [ cosTheta ]: [ N ] ) => {

	return fresnelDielectric( cosTheta, float( WATER_ETA ) );

} ).setLayout( {
	name: 'oceanFresnelWater',
	type: 'float',
	inputs: [ { name: 'cosTheta', type: 'float' } ],
} );

/**
 * GGX (Trowbridge-Reitz) normal distribution.
 */
export const ggxDistribution = Fn( ( [ nDotH, roughness ]: [ N, N ] ) => {

	const a = roughness.mul( roughness );
	const a2 = a.mul( a );
	const d = nDotH.mul( nDotH ).mul( a2.sub( 1 ) ).add( 1 );

	return a2.div( d.mul( d ).mul( Math.PI ) );

} ).setLayout( {
	name: 'oceanGGX',
	type: 'float',
	inputs: [ { name: 'nDotH', type: 'float' }, { name: 'roughness', type: 'float' } ],
} );

/**
 * Schlick-GGX geometry term (Smith).
 */
export const smithGeometry = Fn( ( [ nDotV, nDotL, roughness ]: [ N, N, N ] ) => {

	const k = roughness.mul( roughness ).div( 2 );
	const gv = nDotV.div( nDotV.mul( float( 1 ).sub( k ) ).add( k ) );
	const gl = nDotL.div( nDotL.mul( float( 1 ).sub( k ) ).add( k ) );

	return gv.mul( gl );

} ).setLayout( {
	name: 'oceanSmithG',
	type: 'float',
	inputs: [
		{ name: 'nDotV', type: 'float' },
		{ name: 'nDotL', type: 'float' },
		{ name: 'roughness', type: 'float' },
	],
} );

/**
 * Per channel extinction of the water column.
 *
 * The base numbers are the absorption coefficients of clear ocean water
 * (Jerlov type I). They are scaled by the clarity control and by the
 * requested underwater visibility (three extinction lengths = visibility).
 */
export const waterExtinction = Fn( ( [ visibility, clarity ]: [ N, N ] ) => {

	const base = vec3( 0.50, 0.078, 0.030 );
	const visibilityScale = float( 12 ).div( max( visibility, float( 1 ) ) );

	return base.mul( visibilityScale ).div( max( clarity, float( 0.05 ) ) );

} ).setLayout( {
	name: 'oceanWaterExtinction',
	type: 'vec3',
	inputs: [
		{ name: 'visibility', type: 'float' },
		{ name: 'clarity', type: 'float' },
	],
} );

/**
 * Transmittance of the water column over the given path length.
 */
export const waterTransmittance = Fn( ( [ distance, visibility, clarity ]: [ N, N, N ] ) => {

	return exp( waterExtinction( visibility, clarity ).mul( distance ).negate() );

} ).setLayout( {
	name: 'oceanWaterTransmittance',
	type: 'vec3',
	inputs: [
		{ name: 'distance', type: 'float' },
		{ name: 'visibility', type: 'float' },
		{ name: 'clarity', type: 'float' },
	],
} );

/**
 * Colour of the light scattered back towards the eye inside the water body.
 *
 * This is the colour a deep water column shows when nothing else is visible
 * behind it: it is what keeps the ocean blue instead of black. Strongly
 * forward scattering is added towards the sun direction.
 */
export const waterScatterColor = Fn( ( [ viewDir, sunDir, sunIntensity ]: [ N, N, N ] ) => {

	const sun = normalize( sunDir );
	const forward = pow( max( dot( viewDir, sun ), float( 0 ) ), float( 6 ) );

	// radiance of a fully scattered water column, tuned so that the deep
	// water sits slightly below the zenith sky in brightness
	const base = vec3( 0.014, 0.072, 0.130 ).mul( sunIntensity );

	return base.add( base.mul( forward ).mul( 2.2 ) );

} ).setLayout( {
	name: 'oceanWaterScatter',
	type: 'vec3',
	inputs: [
		{ name: 'viewDir', type: 'vec3' },
		{ name: 'sunDir', type: 'vec3' },
		{ name: 'sunIntensity', type: 'float' },
	],
} );

/**
 * Scattering coefficient of the water column (grey, per metre).
 *
 * It controls how quickly the column turns into its own colour: the light
 * that scatters back has been filtered by the water on its way down and on
 * its way up, so a short path returns a pale, sand dominated turquoise
 * while a long one returns the deep blue of the open sea.
 */
const SCATTERING_COEFFICIENT = 0.032;

/**
 * Radiance of the water column that is seen from above the surface.
 *
 * The light that enters the water is scattered back towards the eye. The
 * *amount* of the column that scatters grows with the path length and
 * saturates, so the deep water converges to its own colour instead of
 * fading to black. The hue comes from the medium itself: the red is
 * swallowed by the water within a few metres, which is what turns the
 * shallows turquoise.
 *
 * @param pathLength distance the eye ray travels inside the water
 * @param viewDir direction the eye ray travels in
 * @param sunDir direction towards the sun
 * @param sunIntensity strength of the sun
 * @param visibility underwater visibility in metres
 * @param clarity clarity of the water
 */
export const waterInScatter = Fn(
	( [ pathLength, viewDir, sunDir, sunIntensity, visibility, clarity ]: [ N, N, N, N, N, N ] ) => {

		const sun = normalize( sunDir );
		const forward = pow( max( dot( viewDir, sun ), float( 0 ) ), float( 6 ) );

		// the colour of the light the water itself scatters: strongly
		// cyan, the red is absorbed within the first metres
		const base = vec3( 0.010, 0.340, 0.420 );

		// how much of the column contributes: saturates with the path length
		const amount = float( 1 ).sub( exp( float( - SCATTERING_COEFFICIENT ).mul( pathLength ) ) );

		// the red is removed over the first metres, the deeper the column the
		// more the colour converges to the pure water colour
		const tint = exp( waterExtinction( visibility, clarity ).mul( min( pathLength, float( 6 ) ).mul( 0.35 ) ).negate() );

		return base.mul( amount ).mul( tint ).mul( sunIntensity ).mul( float( 1 ).add( forward.mul( 1.1 ) ) );

	} ).setLayout( {
	name: 'oceanWaterInScatter',
	type: 'vec3',
	inputs: [
		{ name: 'pathLength', type: 'float' },
		{ name: 'viewDir', type: 'vec3' },
		{ name: 'sunDir', type: 'vec3' },
		{ name: 'sunIntensity', type: 'float' },
		{ name: 'visibility', type: 'float' },
		{ name: 'clarity', type: 'float' },
	],
} );
