import { DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { faceDirection, positionLocal, positionWorld, cameraPosition } from 'three/tsl';
import {
	vec2, vec3, vec4, float,
	normalize, dot, max, min, clamp, mix, smoothstep, length, reflect, refract, step,
} from '../tsl/math';
import { U, SUN_IRRADIANCE } from '../tsl/uniforms';
import { waveHeight, waveSurface } from '../tsl/waves';
import { skyRadiance } from '../tsl/sky';
import {
	fresnelWater, ggxDistribution, smithGeometry, waterScatterColor, waterTransmittance,
} from '../tsl/water';
import { seabedDepth, seabedHeight } from '../tsl/seabedField';
import { sandColour } from '../tsl/sand';
import { perlin } from '../tsl/noise';
import { createRadialGrid } from './radialGrid';
import type { QualityPreset } from '../quality';

export interface OceanSurface {

	mesh: Mesh;
	/** Switches between the above water and the below water shading model. */
	setUnderwater: ( underwater: boolean ) => void;
	/** Releases the geometry and both materials. */
	dispose: () => void;
}

/**
 * The ocean surface.
 *
 * The shader is a physically flavoured water model:
 *
 *  - a multi scale wave field ( seven directional wave trains + fBm swell )
 *    drives the vertex displacement and the shading normal,
 *  - the reflection is the analytic sky evaluated along the reflected ray, so
 *    the water always mirrors the sky that is actually visible,
 *  - the sun is added as a GGX specular lobe which produces the moving
 *    glitter path,
 *  - the eye ray is refracted into the water, hits the sea floor and the
 *    remaining light is attenuated by Beer-Lambert absorption. What is left
 *    is the in-scattering of the water column, which is what gives the deep
 *    water its blue instead of leaving it black,
 *  - the reflection and the transmission are combined with the exact
 *    Fresnel term, so the energy that goes into the sky grows towards the
 *    grazing angles while the water stays readable from above,
 *  - from below the surface a second material takes over which renders the
 *    Snell window: the sky is visible inside the critical angle and total
 *    internal reflection takes over outside of it.
 */
export function createOceanSurface( quality: QualityPreset ): OceanSurface {

	// The inner radius stays tiny: from above the water the surface is
	// opaque and self contained, so the sea floor mesh is not visible
	// through the hole in the middle of the grid.
	const geometry = createRadialGrid( quality.oceanRings, quality.oceanSectors, 0.05, 9000 );

	// ------------------------------------------------------------------ above
	const above = new MeshBasicNodeMaterial();
	above.name = 'ocean-surface-above';
	above.transparent = false;
	above.depthWrite = true;
	above.side = DoubleSide;
	above.fog = false;

	// ---------------------------------------------------------------- vertex
	const localXZ = vec2( positionLocal.x, positionLocal.z );

	// The level of detail is driven by the distance to the camera, so the
	// waves always fade out with the distance from the viewer and not with
	// the distance from the centre of the grid.
	const viewDistVertex = length( vec3( positionLocal.x, 0, positionLocal.z ).sub( cameraPosition ) );

	const height = waveHeight( localXZ, U.time, U.waveAmplitude, U.waveSpeed, U.waveScale, U.waveChoppy, viewDistVertex );
	above.positionNode = vec3( positionLocal.x, height, positionLocal.z );

	// -------------------------------------------------------------- fragment
	const P = positionWorld;
	const p = vec2( P.x, P.z );
	const viewDist = length( P.sub( cameraPosition ) );

	const surf = waveSurface( p, U.time, U.waveAmplitude, U.waveSpeed, U.waveScale, U.waveChoppy, viewDist );

	// The mesh is double sided so that the far side of a wave crest stays
	// solid. `faceDirection` flips the normal on the back faces.
	const N = normalize( vec3( surf.y.negate(), 1, surf.z.negate() ).mul( faceDirection ) );
	const V = normalize( cameraPosition.sub( P ) );

	const ndv = clamp( dot( N, V ), 0, 1 );

	// The exact Fresnel term: the reflection grows towards 1 at grazing
	// angles and drops to 2% when the camera looks straight down.
	const F = fresnelWater( ndv );

	// --- sky reflection -----------------------------------------------------
	// A reflected ray that dips below the horizon cannot reach the sky. It is
	// folded back onto the horizon so that a wave face which is tilted away
	// from the viewer still shows a plausible sky instead of a black hole.
	const R = reflect( V.negate(), N );
	const Rsafe = normalize( vec3( R.x, max( R.y, float( 0.0025 ) ), R.z ) );

	const sky = skyRadiance( Rsafe, float( 0 ), U.sunDirection, U.rayleigh, U.turbidity, U.cloudCoverage, U.time )
		.mul( U.reflectionStrength );

	const reflection = sky.mul( F );

	// --- sun glitter --------------------------------------------------------
	const L = normalize( U.sunDirection );
	const H = normalize( V.add( L ) );
	const ndh = clamp( dot( N, H ), 0, 1 );
	const ndl = max( dot( N, L ), 0 );

	// The roughness covers the slope variance of the small waves, the large
	// waves are already part of the normal. It is deliberately not mirror
	// smooth: a perfect mirror turns the sky into a hard edged, high
	// contrast pattern.
	const roughness = float( 0.14 );

	const specular = min(
		ggxDistribution( ndh, roughness )
			.mul( smithGeometry( ndv, ndl, roughness ) )
			.mul( fresnelWater( ndh ) )
			.div( max( float( 4 ).mul( ndv ), float( 1e-4 ) ) )
			.mul( U.sunColor ).mul( U.sunIntensity ).mul( SUN_IRRADIANCE ),
		float( 120 ),
	);

	// --- refraction into the water -----------------------------------------
	// The eye ray bends at the surface, travels through the water column and
	// ends on the sea floor. Everything below the surface is attenuated by
	// Beer-Lambert absorption, what is missing is added back as the
	// in-scattering of the water column.
	const refr = refract( V.negate(), N, float( 1 / 1.333 ) );

	const bedY = seabedHeight( p, U.waterDepth );
	const tHit = clamp( bedY.sub( P.y ).div( min( refr.y, float( - 0.02 ) ) ), 0, 400 );
	const hit = P.add( refr.mul( tHit ) );

	const sand = sandColour( vec2( hit.x, hit.z ), quality.softShadows );

	const T = waterTransmittance( tHit, U.underwaterVisibility, U.waterClarity );
	const scatter = waterScatterColor( refr, U.sunDirection, U.sunIntensity );

	const transmitted = sand.mul( T ).add( scatter.mul( float( 1 ).sub( T ) ) );

	// --- subsurface glow through the wave crests ----------------------------
	const sss = clamp( surf.x.mul( 0.5 ), 0, 1 )
		.mul( max( dot( V.negate(), L ), 0 ) )
		.mul( 0.16 );

	// --- foam ---------------------------------------------------------------
	// White caps form where the large waves become steep enough to break.
	// Two noise octaves break the foam into streaks instead of solid patches.
	const slope = surf.w;
	const foamA = perlin( p.mul( 1.1 ).add( vec2( U.time.mul( 0.09 ), U.time.mul( - 0.06 ) ) ) ).mul( 0.5 ).add( 0.5 );
	const foamB = perlin( p.mul( 3.2 ).sub( vec2( U.time.mul( 0.16 ), U.time.mul( 0.11 ) ) ) ).mul( 0.5 ).add( 0.5 );
	const foamNoise = foamA.mul( 0.65 ).add( foamB.mul( 0.35 ) );

	// The threshold is tuned to the slope of the seven wave trains: only the
	// steepest crests break, which is where white caps belong.
	const crest = smoothstep( float( 0.14 ), float( 0.21 ), slope )
		.mul( smoothstep( float( - 0.02 ), float( 0.18 ), surf.x ) );
	const foamCrest = min( crest.mul( foamNoise ).mul( 1.7 ), float( 1 ) );

	// breaking waves along the shallow shoal
	const depth = seabedDepth( p, U.waterDepth );
	const shore = smoothstep( float( 2.4 ), float( 0.2 ), depth );
	const shoreNoise = perlin( p.mul( 1.1 ).add( vec2( U.time.mul( 0.35 ), U.time.mul( 0.16 ) ) ) ).mul( 0.5 ).add( 0.5 );
	const breaking = smoothstep( float( - 0.3 ), float( 0.35 ), surf.x );
	const foamShore = min( shore.mul( shoreNoise.mul( 0.7 ).add( 0.3 ) ).mul( breaking ).mul( 1.9 ), float( 1 ) );

	const foam = min( foamCrest.add( foamShore ), float( 1 ) ).mul( U.foamAmount );

	// --- composite -----------------------------------------------------------
	const foamLit = vec3( 0.82, 0.87, 0.90 )
		.mul( U.sunColor ).mul( U.sunIntensity ).mul( SUN_IRRADIANCE ).div( Math.PI );

	const water = reflection
		.add( specular )
		.add( U.sunColor.mul( U.sunIntensity ).mul( SUN_IRRADIANCE ).mul( sss ).mul( float( 1 ).sub( F ) ) )
		.add( transmitted.mul( float( 1 ).sub( F ) ) );

	// The foam is opaque: it replaces whatever is underneath it.
	const total = mix( water, foamLit, foam );

	above.colorNode = vec4( total, 1 );

	// ------------------------------------------------------------------ below
	const below = new MeshBasicNodeMaterial();
	below.name = 'ocean-surface-below';
	below.transparent = false;
	below.depthWrite = false;
	below.side = DoubleSide;
	below.fog = false;

	below.positionNode = above.positionNode;

	const belowSurf = waveSurface( p, U.time, U.waveAmplitude, U.waveSpeed, U.waveScale, U.waveChoppy, viewDist );
	const belowNormal = normalize( vec3( belowSurf.y.negate(), 1, belowSurf.z.negate() ) );
	const belowView = normalize( cameraPosition.sub( P ) );

	// refraction from water into air: valid only inside the critical angle
	const refrUp = refract( belowView.negate(), belowNormal.negate(), float( 1.333 ) );
	const rlen = length( refrUp );
	const valid = step( float( 0.0001 ), rlen );

	// A total internal reflection returns a zero vector. The direction is
	// nudged so that it stays finite: a NaN would leak into the mix and
	// punch a black hole into the surface.
	const rdir = normalize( refrUp.add( vec3( 0, 1e-4, 0 ) ) );

	// the water column between the camera and the surface dims the window
	const toCam = cameraPosition.sub( P );
	const camDist = length( toCam );
	const camT = waterTransmittance( camDist, U.underwaterVisibility, U.waterClarity );
	const camScatter = waterScatterColor( rdir, U.sunDirection, U.sunIntensity );

	const window = skyRadiance( rdir, float( 1 ), U.sunDirection, U.rayleigh, U.turbidity, U.cloudCoverage, U.time )
		.mul( camT )
		.add( camScatter.mul( float( 1 ).sub( camT ) ) );

	// outside of the critical angle the surface mirrors the water body
	const tir = camScatter.mul( 1.8 );

	below.colorNode = vec4( mix( tir, window, valid ), 1 );

	// ------------------------------------------------------------------ mesh
	const mesh = new Mesh( geometry, above );
	mesh.name = 'ocean';
	mesh.frustumCulled = false;
	mesh.renderOrder = 10;

	let underwater = false;

	return {
		mesh,
		setUnderwater: ( next: boolean ) => {

			if ( next === underwater ) return;

			underwater = next;
			mesh.material = next ? below : above;

		},
		dispose: () => {

			geometry.dispose();
			above.dispose();
			below.dispose();

		},
	};

}
