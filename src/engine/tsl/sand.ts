import { Fn, If } from 'three/tsl';
import { vec2, vec3, float, dot, max, min, smoothstep, normalize } from './math';
import { duneHeight, seabedSlope, sandAlbedo } from './seabedField';
import { causticLight, causticWarp } from './caustics';
import { skyAmbientLight } from './sky';
import { SUN_IRRADIANCE } from './uniforms';

/**
 * TSL node type (the upstream typings for TSL call signatures are loose).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/**
 * Soft shadowing of the dunes.
 *
 * The height field is marched towards the sun which gives a soft, physically
 * plausible shadow that reacts to the sun direction. The march uses the cheap
 * dune height instead of the full sea floor height: the shadow only needs
 * the large scale shape, and the full height costs three noise evaluations
 * per sample.
 */
export const sandSoftShadow = Fn( ( [ p, sunDir ]: [ N, N ] ) => {

	const L = normalize( sunDir );
	const h0 = duneHeight( p );

	let shadow = float( 1 );

	for ( let i = 0; i < 3; i ++ ) {

		const t = ( ( i + 1 ) / 3 ) * 26;
		const q = vec2( p.x.add( L.x.mul( t ) ), p.y.add( L.z.mul( t ) ) );
		const rayHeight = h0.add( L.y.mul( t ) );

		shadow = min( shadow, smoothstep( float( 0 ), float( 0.45 ), rayHeight.sub( duneHeight( q ) ) ) );

	}

	return shadow;

} ).setLayout( {
	name: 'oceanSandShadow3',
	type: 'float',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'sunDir', type: 'vec3' },
	],
} );

/**
 * Radiance of the sand at a point on the sea floor.
 *
 * The function is shared by the sea floor mesh and by the ocean surface so
 * that both agree on the colour of the sand: the ocean surface refracts the
 * eye ray onto the sea floor and uses exactly the same shading, which keeps
 * the shallow water and the underwater view consistent.
 *
 * It is a layout function, so every value it needs has to be passed in as an
 * argument: a layout function is compiled once per backend and shared by
 * every material, which means it may not capture uniforms directly.
 *
 * @param p world space XZ position on the sea floor
 * @param shadowEnabled 1 to evaluate the (expensive) dune shadow, 0 to skip it
 * @param waterDepth depth of the basin
 * @param sunDir direction towards the sun
 * @param sunIntensity strength of the sun
 * @param rayleigh Rayleigh scattering coefficient of the sky
 * @param turbidity atmospheric turbidity of the sky
 * @param cloudCoverage cloud coverage of the sky
 * @param causticsIntensity strength of the caustic network
 * @param time animation time
 */
export const sandColour = Fn(
	( [ p, shadowEnabled, waterDepth, sunDir, sunColor, sunIntensity, rayleigh, turbidity, cloudCoverage, causticsIntensity, time ]: N[] ) => {

		const L = normalize( sunDir );

		const slope = seabedSlope( p, waterDepth );
		const N = normalize( vec3( slope.x.negate(), 1, slope.y.negate() ) );

		const ndl = max( dot( N, L ), 0 );

		// The shadow is a uniform branch: every pixel takes the same path, so
		// it costs nothing when it is switched off.
		const shadow = float( 1 ).toVar();

		If( shadowEnabled.greaterThan( 0.5 ), () => {

			shadow.assign( sandSoftShadow( p, sunDir ) );

		} );

		const caustic = causticLight( p, causticWarp( p, time ), shadow, causticsIntensity, sunIntensity, time );

		// Direct sun light. The caustic network is the same sunlight, focused by
		// the waves, so it modulates the direct light around one instead of
		// replacing it. The 1/pi turns the irradiance of the sun into the
		// radiance of a lambertian surface.
		const sunLight = sunColor.mul( sunIntensity ).mul( SUN_IRRADIANCE ).div( Math.PI )
			.mul( ndl )
			.mul( shadow )
			.mul( float( 0.93 ).add( caustic.mul( 0.26 ) ) );

		// Sky light. A clear sky contributes a fair amount of diffuse light to
		// the sea floor, so the shadowed dunes never go completely black.
		const ambient = skyAmbientLight( sunDir, rayleigh, turbidity, cloudCoverage, time )
			.mul( 0.22 )
			.mul( float( 0.5 ).add( N.y.mul( 0.5 ) ) );

		return sandAlbedo( p ).mul( sunLight.add( ambient ) );

	} ).setLayout( {
	name: 'oceanSandColour',
	type: 'vec3',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'shadowEnabled', type: 'float' },
		{ name: 'waterDepth', type: 'float' },
		{ name: 'sunDir', type: 'vec3' },
		{ name: 'sunColor', type: 'vec3' },
		{ name: 'sunIntensity', type: 'float' },
		{ name: 'rayleigh', type: 'float' },
		{ name: 'turbidity', type: 'float' },
		{ name: 'cloudCoverage', type: 'float' },
		{ name: 'causticsIntensity', type: 'float' },
		{ name: 'time', type: 'float' },
	],
} );

/**
 * Radiance of the sea floor as seen through the water.
 *
 * Beyond a certain path length the Beer-Lambert transmittance has dropped to
 * a fraction of a percent and the in-scattering of the water column takes
 * over completely. The floor is then skipped instead of shading a pixel that
 * nobody can see. Because the whole sea floor costs roughly half of the
 * ocean shader, this is worth a branch.
 *
 * @param p world space XZ position on the sea floor
 * @param pathLength length of the path through the water
 * @param shadowEnabled 1 to evaluate the dune shadow
 * @param waterDepth depth of the basin
 * @param sunDir direction towards the sun
 * @param sunIntensity strength of the sun
 * @param rayleigh Rayleigh scattering coefficient of the sky
 * @param turbidity atmospheric turbidity of the sky
 * @param cloudCoverage cloud coverage of the sky
 * @param causticsIntensity strength of the caustic network
 * @param time animation time
 */
export const sandVisible = Fn(
	( [ p, pathLength, shadowEnabled, waterDepth, sunDir, sunColor, sunIntensity, rayleigh, turbidity, cloudCoverage, causticsIntensity, time ]: N[] ) => {

		const out = vec3( 0 ).toVar();

		If( pathLength.lessThan( 110 ), () => {

			out.assign( sandColour(
				p, shadowEnabled, waterDepth, sunDir, sunColor, sunIntensity,
				rayleigh, turbidity, cloudCoverage, causticsIntensity, time,
			) );

		} );

		return out;

	} ).setLayout( {
	name: 'oceanSandVisible',
	type: 'vec3',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'pathLength', type: 'float' },
		{ name: 'shadowEnabled', type: 'float' },
		{ name: 'waterDepth', type: 'float' },
		{ name: 'sunDir', type: 'vec3' },
		{ name: 'sunColor', type: 'vec3' },
		{ name: 'sunIntensity', type: 'float' },
		{ name: 'rayleigh', type: 'float' },
		{ name: 'turbidity', type: 'float' },
		{ name: 'cloudCoverage', type: 'float' },
		{ name: 'causticsIntensity', type: 'float' },
		{ name: 'time', type: 'float' },
	],
} );
