import { BackSide, Mesh, MeshBasicNodeMaterial, SphereGeometry } from 'three/webgpu';
import { positionWorld, cameraPosition } from 'three/tsl';
import { mix, normalize, float } from '../tsl/math';
import { U } from '../tsl/uniforms';
import { skyRadiance } from '../tsl/sky';
import { waterScatterColor } from '../tsl/water';

/**
 * Sky dome.
 *
 * The analytic Preetham sky is used both for the visible dome and for the
 * reflections in the water surface, so the two always agree. When the camera
 * dives below the water line the dome fades into the underwater haze which
 * keeps the transition seamless.
 */
export function createSkyDome( radius = 14000 ) {

	const geometry = new SphereGeometry( radius, 48, 24 );
	const material = new MeshBasicNodeMaterial();
	material.name = 'sky-dome';
	material.side = BackSide;
	material.depthWrite = false;
	material.depthTest = false;
	material.fog = false;

	const dir = normalize( positionWorld.sub( cameraPosition ) );

	const sky = skyRadiance( dir, float( 1 ), U.sunDirection, U.rayleigh, U.turbidity, U.cloudCoverage, U.time );
	const haze = waterScatterColor( dir, U.sunDirection, U.sunIntensity ).mul( 2.4 );

	material.colorNode = mix( sky, haze, U.underwater );

	const mesh = new Mesh( geometry, material );
	mesh.name = 'sky';
	mesh.frustumCulled = false;
	mesh.renderOrder = - 1000;

	return mesh;

}
	