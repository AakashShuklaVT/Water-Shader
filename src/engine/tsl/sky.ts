import { Fn, If } from 'three/tsl';
import { vec3, float, acos, cos, pow, exp, dot, max, min, clamp, mix, smoothstep, normalize } from './math';
import { perlin } from './noise';

/**
 * TSL node type (the upstream typings for TSL call signatures are loose).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Rayleigh scattering coefficients for the primary wavelengths (680/550/450 nm). */
const TOTAL_RAYLEIGH = vec3( 5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5 );
/** Mie constants for the primary wavelengths. */
const MIE_CONST = vec3( 1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14 );
/** cosine of the sun's angular diameter (0.53 degrees) */
const SUN_ANGULAR_DIAMETER_COS = 0.99995667694644844;
/** 3 / (16 pi) */
const THREE_OVER_SIXTEENPI = 0.05968310365946075;
/** 1 / (4 pi) */
const ONE_OVER_FOURPI = 0.07957747154594767;
/** Preetham "earth shadow" constants */
const CUTOFF_ANGLE = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000.0;

/**
 * Mie coefficient.
 *
 * three's Sky example uses `totalMie( turbidity ) * mieCoefficient` with a
 * default `mieCoefficient` of 0.005, which folds down to the factor below.
 */
const MIE_COEFFICIENT = 5e-20;

/**
 * Radiance scale of the sky.
 *
 * The Preetham model is calibrated against the solar disc, which sits around
 * 1e4 in its own units. This factor converts the model into the linear
 * radiance range the rest of the scene works in: the zenith ends up near
 * 0.25 in green and the horizon near 0.8, so the sky sits slightly above a
 * sunlit surface (which is roughly 0.2 - 0.4).
 */
export const SKY_RADIANCE_SCALE = 0.005;

const CLOUD_SCALE = 0.0002;
const CLOUD_SPEED = 0.00002;
const CLOUD_ELEVATION = 0.505;
const CLOUD_DENSITY = 0.4;

/**
 * Four octave fBm used by the cloud layer (mirrors three's Sky example).
 */
function cloudFbm( p: N, drift: N ) {

	let result = float( 0 );
	let amplitude = float( 1 );
	let q = p;

	for ( let i = 0; i < 3; i ++ ) {

		result = result.add( amplitude.mul( perlin( q ) ) );
		amplitude = amplitude.mul( 0.5 );
		q = q.mul( 2 ).add( drift );

	}

	return result;

}

/**
 * Preetham daylight sky model with a procedural cloud layer.
 *
 * The result is linear radiance in the same units as the rest of the scene,
 * the renderer takes care of tone mapping and the output colour space.
 *
 * @param dir view direction (world space, normalised)
 * @param sunAmount 1 to include the solar disc, 0 to omit it
 * @param sunDir direction towards the sun
 * @param rayleigh Rayleigh scattering coefficient
 * @param turbidity atmospheric turbidity
 * @param coverage cloud coverage
 * @param time animation time
 */
export const skyRadiance = Fn(
	( [ dir, sunAmount, sunDir, rayleigh, turbidity, coverage, time, cloudAmount ]: [ N, N, N, N, N, N, N, N ] ) => {

		const sun = normalize( sunDir );

		// sun intensity with the Preetham earth shadow falloff
		const sunE = float( EE ).mul( max( float( 0 ), float( 1 ).sub(
			pow( Math.E, float( CUTOFF_ANGLE ).sub( acos( clamp( sun.y, - 1, 1 ) ) ).div( STEEPNESS ).negate() )
		) ) );

		const sunfade = float( 1 ).sub( clamp( float( 1 ).sub( exp( sun.y.div( 450000 ) ) ), 0, 1 ) );
		const rayleighCoefficient = rayleigh.sub( sunfade.oneMinus() );

		const betaR = TOTAL_RAYLEIGH.mul( rayleighCoefficient );
		const betaM = MIE_CONST.mul( float( 0.434 ).mul( float( 0.2 ).mul( turbidity ) ).mul( MIE_COEFFICIENT ) );

		// optical path length towards the horizon
		const zenithAngle = acos( max( float( 0 ), dir.y ) );
		const inverse = float( 1 ).div( cos( zenithAngle ).add(
			float( 0.15 ).mul( pow( float( 93.885 ).sub( zenithAngle.mul( 180 ).div( Math.PI ) ), float( - 1.253 ) ) )
		) );
		const sR = float( 8400 ).mul( inverse );
		const sM = float( 1250 ).mul( inverse );

		// combined extinction
		const Fex = exp( betaR.mul( sR ).add( betaM.mul( sM ) ).negate() );

		const cosTheta = dot( dir, sun );

		// phase functions
		//
		// The Rayleigh phase function of Preetham is
		//     3 / (16 pi) * ( 1 + cos^2( theta ) )
		// with cos( theta ) remapped to 0.5 * ( cosTheta + 1 ). Dropping the
		// additive "1" makes the in-scattering collapse towards the
		// anti-solar half of the sky, which turns the whole ocean black
		// whenever the camera faces away from the sun.
		const phaseCos = cosTheta.mul( 0.5 ).add( 0.5 );
		const rPhase = float( THREE_OVER_SIXTEENPI ).mul( float( 1 ).add( pow( phaseCos, float( 2 ) ) ) );

		const g = float( 0.8 );
		const g2 = g.mul( g );
		const hgDen = max( float( 1 ).sub( g.mul( 2 ).mul( cosTheta ) ).add( g2 ), float( 1e-4 ) );
		const mPhase = float( ONE_OVER_FOURPI ).mul( float( 1 ).sub( g2 ).mul( pow( hgDen, float( - 1.5 ) ) ) );

		const betaRTheta = betaR.mul( rPhase );
		const betaMTheta = betaM.mul( mPhase );

		const ratio = betaRTheta.add( betaMTheta ).div( betaR.add( betaM ) );

		// in scattering
		const Lin = pow( sunE.mul( ratio ).mul( float( 1 ).sub( Fex ) ), vec3( 1.5 ) );
		const horizon = clamp( pow( float( 1 ).sub( sun.y ), float( 5 ) ), 0, 1 );
		const LinHorizon = Lin.mul( mix( vec3( 1 ), pow( sunE.mul( ratio ).mul( Fex ), vec3( 0.5 ) ), horizon ) );

		// night sky term
		const L0 = vec3( 0.1 ).mul( Fex );

		// solar disc
		const sundisc = clamp( cosTheta.sub( SUN_ANGULAR_DIAMETER_COS ).mul( 50000 ), 0, 1 ).mul( sunAmount );
		const sundiscColor = min( float( 760 ).mul( sundisc ).mul( min( sunE.mul( Fex ), float( 80 ) ) ), float( 20000 ) );

		let texColor = LinHorizon.add( L0 ).mul( SKY_RADIANCE_SCALE ).add( vec3( 0, 0.00015, 0.000375 ) );

		// ------------------------------------------------------------ shoulder
		// The Preetham aureole around the sun is extremely bright: without a
		// shoulder it clips a large part of the dome to flat white. The
		// scattered light is compressed towards a ceiling instead. The
		// compression is applied to the luminance only, so the sky keeps its
		// hue and does not turn into a grey sheet.
		const knee = float( 0.4 );
		const lum = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
		const over = max( lum.sub( knee ), float( 0 ) );
		const lumSoft = min( lum, knee ).add( over.div( over.div( knee ).add( 1 ) ) );
		texColor = texColor.mul( lumSoft.div( max( lum, float( 1e-4 ) ) ) );

		// the solar disc is added after the shoulder: it is the only part of
		// the sky that is allowed to be brighter than the ceiling
		texColor = texColor.add( sundiscColor );

		// ------------------------------------------------------------ clouds
		//
		// The cloud layer is the most expensive part of the sky (four noise
		// evaluations per pixel). It is skipped entirely when it is not
		// needed: the water reflects the sky along a ray that points close
		// to the horizon, where the cloud layer is faded out anyway.
		const result = texColor.toVar();

		If( cloudAmount.greaterThan( 0.5 ), () => {

			const dirY = max( dir.y, float( 0.05 ) );
			const cloudUV = dir.xz.div( dirY.mul( CLOUD_ELEVATION ) ).mul( CLOUD_SCALE ).add( time.mul( CLOUD_SPEED ) );

			const evolve = time.mul( CLOUD_SPEED ).mul( 300 );
			const cloudNoise = clamp( cloudFbm( cloudUV.mul( 1000 ), evolve ).mul( 0.7 ).add( 0.5 ), 0, 1 );
			const region = perlin( cloudUV.mul( 300 ) ).mul( 0.37 ).add( 0.5 );
			const cov = clamp( coverage.add( region.sub( 0.5 ).mul( 0.6 ) ), 0, 1 );

			const threshold = float( 1 ).sub( cov );
			const cloudMask = smoothstep( threshold, threshold.add( 0.3 ), cloudNoise );
			const horizonFade = smoothstep( float( 0 ), float( 0.03 ).add( float( 0.06 ).mul( CLOUD_ELEVATION ) ), dir.y );
			const dayFactor = smoothstep( float( - 0.08 ), float( 0.3 ), sun.y );

			// the clouds are lit directly by the sun, the disc is not attenuated
			const cloudSun = sunE.mul( Fex ).mul( 0.22 ).mul( SKY_RADIANCE_SCALE );
			const skyAmbient = LinHorizon.mul( SKY_RADIANCE_SCALE ).add( vec3( 0, 0.00015, 0.000375 ) );

			const cloudDepth = max( float( 0 ), cloudNoise.sub( threshold ) );
			const beer = exp( cloudDepth.mul( - 4 ) );
			const powder = float( 1 ).sub( beer.mul( beer ) );
			const shade = mix( float( 0.45 ), float( 1 ), clamp( beer.mul( powder ).mul( 2.6 ), 0, 1 ) );
			const silver = clamp( float( 0.51 ).div( pow( max( float( 1.49 ).sub( cosTheta.mul( 1.4 ) ), float( 0.05 ) ), float( 1.5 ) ) ), 0, 3 );
			const edge = cloudMask.mul( float( 1 ).sub( cloudMask ) ).mul( 4 );

			const cloudColor = skyAmbient.add( cloudSun.mul( shade ) )
				.add( cloudSun.mul( silver ).mul( edge ).mul( 0.6 ) )
				.mul( max( dayFactor, float( 0.03 ) ) );

			const cloudAlpha = float( 1 ).sub( exp( cloudDepth.mul( CLOUD_DENSITY ).mul( - 12 ) ) ).mul( horizonFade );

			// the solar disc is hidden behind an opaque cloud
			const shaded = texColor.sub( L0.mul( SKY_RADIANCE_SCALE ).mul( cloudAlpha ) );

			const cloudAerial = mix( shaded, cloudColor, Fex );
			result.assign( mix( shaded, cloudAerial, cloudAlpha ) );

		} );

		// Safety net: the value is used for the reflections as well, a single
		// invalid sample would show up as a black or white patch on the
		// water. Clamping keeps the result finite and bounded.
		return min( max( result, vec3( 0 ) ), vec3( 20000 ) );

	} ).setLayout( {
	name: 'oceanSkyRadiance',
	type: 'vec3',
	inputs: [
		{ name: 'dir', type: 'vec3' },
		{ name: 'sunAmount', type: 'float' },
		{ name: 'sunDir', type: 'vec3' },
		{ name: 'rayleigh', type: 'float' },
		{ name: 'turbidity', type: 'float' },
		{ name: 'coverage', type: 'float' },
		{ name: 'time', type: 'float' },
		{ name: 'cloudAmount', type: 'float' },
	],
} );

/**
 * Hemispheric sky light used as the ambient term for the underwater lighting.
 */
export const skyAmbientLight = Fn(
	( [ sunDir, rayleigh, turbidity, coverage, time ]: [ N, N, N, N, N ] ) => {

		// the zenith never carries a cloud, so the cloud layer is skipped
		return skyRadiance( vec3( 0, 1, 0 ), float( 0 ), sunDir, rayleigh, turbidity, coverage, time, float( 0 ) ).mul( 0.45 );

	} ).setLayout( {
	name: 'oceanSkyAmbient',
	type: 'vec3',
	inputs: [
		{ name: 'sunDir', type: 'vec3' },
		{ name: 'rayleigh', type: 'float' },
		{ name: 'turbidity', type: 'float' },
		{ name: 'coverage', type: 'float' },
		{ name: 'time', type: 'float' },
	],
} );
