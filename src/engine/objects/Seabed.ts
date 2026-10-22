import { FrontSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { positionLocal, positionWorld, cameraPosition } from 'three/tsl';
import {
	vec2, vec3, vec4, float,
	normalize, min, max, clamp, mix, length, refract, step,
} from '../tsl/math';
import { U } from '../tsl/uniforms';
import { waveSurface } from '../tsl/waves';
import { waterTransmittance, waterScatterColor } from '../tsl/water';
import { seabedHeight } from '../tsl/seabedField';
import { sandColour } from '../tsl/sand';
import { createRadialGrid } from './radialGrid';
import type { QualityPreset } from '../quality';

/**
 * The sandy seabed.
 *
 * Highlights:
 *
 *  - fully procedural sand: albedo variation, mineral specks, shell fragments
 *    and directional ripples,
 *  - the eye ray is refracted through the animated water surface before it
 *    hits the sand, so the sea floor visibly wobbles with the waves,
 *  - Beer-Lambert absorption plus in scattering produces the blue-green haze
 *    that swallows the sand in the distance,
 *  - moving caustics are projected onto the sand by the wave field.
 *
 * The mesh is only rendered while the camera is under the water: from above
 * the ocean surface computes the very same sand itself (see OceanSurface),
 * so the shading is shared through `sandColour`.
 */
export function createSeabed( quality: QualityPreset ): Mesh {

	const geometry = createRadialGrid( quality.seabedRings, quality.seabedSectors, 0.6, 2600 );

	const material = new MeshBasicNodeMaterial();
	material.name = 'seabed';
	material.side = FrontSide;
	material.fog = false;

	// ---------------------------------------------------------------- vertex
	const localXZ = vec2( positionLocal.x, positionLocal.z );
	material.positionNode = vec3( positionLocal.x, seabedHeight( localXZ, U.waterDepth ), positionLocal.z );

	// -------------------------------------------------------------- fragment
	const P = positionWorld;
	const camPos = cameraPosition;

	const toFrag = P.sub( camPos );
	const dist = length( toFrag );

	// --- refraction of the eye ray through the water surface ---------------
	// The crossing point of the eye ray with the water line.
	const denom = min( toFrag.y, float( - 0.001 ) );
	const tCross = clamp( camPos.y.negate().div( denom ), 0, 1 );
	const crossPos = camPos.add( toFrag.mul( tCross ) );

	// 1 when the camera is above the water and the fragment is below it
	const isAbove = step( float( 0 ), camPos.y ).mul( step( float( 0.001 ), toFrag.y.negate() ) );

	const crossSurf = waveSurface(
		vec2( crossPos.x, crossPos.z ),
		U.time, U.waveAmplitude, U.waveSpeed, U.waveScale, U.waveChoppy,
		length( crossPos.sub( camPos ) ),
	);
	const crossN = normalize( vec3( crossSurf.y.negate(), 1, crossSurf.z.negate() ) );

	const refr = refract( toFrag.div( max( dist, float( 0.001 ) ) ), crossN, float( 0.75 ) );

	const bedY = seabedHeight( vec2( crossPos.x, crossPos.z ), U.waterDepth );
	const tHit = clamp( bedY.sub( crossPos.y ).div( min( refr.y, float( - 0.05 ) ) ), 0, 400 );
	const hit = crossPos.add( refr.mul( tHit ) );

	// The sand is sampled at the refracted position, the path length inside
	// the water drives the absorption.
	const sandP = mix( vec2( P.x, P.z ), vec2( hit.x, hit.z ), isAbove );
	const pathLength = mix( dist, length( hit.sub( crossPos ) ), isAbove );

	// --- surface normal and lighting ---------------------------------------
	const lit = sandColour( sandP, quality.softShadows );

	// --- water column ------------------------------------------------------
	const T = waterTransmittance( pathLength, U.underwaterVisibility, U.waterClarity );
	const scatter = waterScatterColor( toFrag.div( max( dist, float( 0.001 ) ) ), U.sunDirection, U.sunIntensity );

	const colour = lit.mul( T ).add( scatter.mul( float( 1 ).sub( T ) ) );

	material.colorNode = vec4( colour, 1 );

	const mesh = new Mesh( geometry, material );
	mesh.name = 'seabed';
	mesh.frustumCulled = false;
	mesh.renderOrder = 0;

	return mesh;

}
