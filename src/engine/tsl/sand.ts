import { Fn } from 'three/tsl';
import { vec2, vec3, float, dot, max, min, smoothstep, normalize, length, cameraPosition } from './math';
import { U, SUN_IRRADIANCE } from './uniforms';
import { waveSurface } from './waves';
import { seabedHeight, seabedSlope, sandAlbedo } from './seabedField';
import { causticLight } from './caustics';
import { skyAmbientLight } from './sky';

/**
 * TSL node type (the upstream typings for TSL call signatures are loose).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/**
 * Soft shadowing of the dunes.
 *
 * The height field is marched towards the sun which gives a soft, physically
 * plausible shadow that reacts to the sun direction.
 */
export const sandSoftShadow = Fn( ( [ p, waterDepth, sunDir ]: [ N, N, N ] ) => {

	const L = normalize( sunDir );
	const h0 = seabedHeight( p, waterDepth );

	let shadow = float( 1 );

	for ( let i = 0; i < 3; i ++ ) {

		const t = ( ( i + 1 ) / 3 ) * 26;
		const q = vec2( p.x.add( L.x.mul( t ) ), p.y.add( L.z.mul( t ) ) );
		const rayHeight = h0.add( L.y.mul( t ) );

		shadow = min( shadow, smoothstep( float( 0 ), float( 0.45 ), rayHeight.sub( seabedHeight( q, waterDepth ) ) ) );

	}

	return shadow;

} ).setLayout( {
	name: 'oceanSandShadow3',
	type: 'float',
	inputs: [
		{ name: 'p', type: 'vec2' },
		{ name: 'waterDepth', type: 'float' },
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
 * @param p world space XZ position on the sea floor
 * @param softShadows whether the (expensive) dune shadow is evaluated
 */
export function sandColour( p: N, softShadows: boolean ): N {

	const L = normalize( U.sunDirection );

	const slope = seabedSlope( p, U.waterDepth );
	const N = normalize( vec3( slope.x.negate(), 1, slope.y.negate() ) );

	const ndl = max( dot( N, L ), 0 );

	const shadow = softShadows ? sandSoftShadow( p, U.waterDepth, U.sunDirection ) : float( 1 );

	const causticSurf = waveSurface(
		p,
		U.time, U.waveAmplitude, U.waveSpeed, U.waveScale, U.waveChoppy,
		length( vec3( p.x, 0, p.y ).sub( cameraPosition ) ),
	);

	const caustic = causticLight( p, causticSurf.yz, shadow, U.causticsIntensity, U.sunIntensity, U.time );

	// Direct sun light. The caustic network modulates it, but it is kept
	// subtle: the sand has to read as a soft bottom, not as a high contrast
	// pattern that competes with the water surface. The 1/pi turns the
	// irradiance of the sun into the radiance of a lambertian surface.
	const sunLight = U.sunColor.mul( U.sunIntensity ).mul( SUN_IRRADIANCE ).div( Math.PI )
		.mul( ndl )
		.mul( shadow )
		.mul( float( 0.30 ).add( caustic.mul( 0.34 ) ) );

	// Sky light. A clear sky contributes a fair amount of diffuse light to
	// the sea floor, so the shadowed dunes never go completely black.
	const ambient = skyAmbientLight( U.sunDirection, U.rayleigh, U.turbidity, U.cloudCoverage, U.time )
		.mul( 0.22 )
		.mul( float( 0.5 ).add( N.y.mul( 0.5 ) ) );

	return sandAlbedo( p ).mul( sunLight.add( ambient ) );

}
