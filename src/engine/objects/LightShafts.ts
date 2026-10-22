import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, cameraPosition, positionWorld, varying } from 'three/tsl';
import {
	vec2, vec4, float,
	cross, length, normalize, max, pow, smoothstep, abs, worldToLocal,
} from '../tsl/math';
import { U, SUN_IRRADIANCE } from '../tsl/uniforms';
import { perlin } from '../tsl/noise';
import { waterTransmittance } from '../tsl/water';

/**
 * Volumetric light shafts.
 *
 * Each shaft is a long quad that starts on the water surface and follows the
 * sun direction down into the water. The quads are billboarded around the sun
 * axis so they always keep their width, and the whole set is modulated by a
 * scrolling noise field which gives the shafts their flickering, dusty look.
 */
export function createLightShafts( count: number ): Mesh {

	const positions = new Float32Array( count * 4 * 3 );
	const corners = new Float32Array( count * 4 * 2 );
	const origins = new Float32Array( count * 4 * 3 );
	const params = new Float32Array( count * 4 * 3 );
	const indices = new Uint32Array( count * 6 );

	const quad = [ [ - 0.5, 0 ], [ 0.5, 0 ], [ 0.5, 1 ], [ - 0.5, 1 ] ];

	let seed = 987654321;
	const random = () => {

		seed = ( seed * 1664525 + 1013904223 ) % 4294967296;
		return seed / 4294967296;

	};

	for ( let i = 0; i < count; i ++ ) {

		const angle = random() * Math.PI * 2;
		const radius = Math.sqrt( random() ) * 30 + 0.5;
		const x = Math.cos( angle ) * radius;
		const z = Math.sin( angle ) * radius;
		const width = 0.7 + random() * 2.4;
		const depth = 14 + random() * 16;
		const s = random();

		for ( let v = 0; v < 4; v ++ ) {

			const o = ( i * 4 + v );

			positions[ o * 3 + 0 ] = 0;
			positions[ o * 3 + 1 ] = 0;
			positions[ o * 3 + 2 ] = 0;

			corners[ o * 2 + 0 ] = quad[ v ][ 0 ];
			corners[ o * 2 + 1 ] = quad[ v ][ 1 ];

			origins[ o * 3 + 0 ] = x;
			origins[ o * 3 + 1 ] = 0;
			origins[ o * 3 + 2 ] = z;

			params[ o * 3 + 0 ] = width;
			params[ o * 3 + 1 ] = depth;
			params[ o * 3 + 2 ] = s;

		}

		const base = i * 4;
		const o = i * 6;

		indices[ o + 0 ] = base + 0;
		indices[ o + 1 ] = base + 1;
		indices[ o + 2 ] = base + 2;
		indices[ o + 3 ] = base + 0;
		indices[ o + 4 ] = base + 2;
		indices[ o + 5 ] = base + 3;

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'aCorner', new BufferAttribute( corners, 2 ) );
	geometry.setAttribute( 'aOrigin', new BufferAttribute( origins, 3 ) );
	geometry.setAttribute( 'aParams', new BufferAttribute( params, 3 ) );
	geometry.setIndex( new BufferAttribute( indices, 1 ) );
	geometry.computeBoundingSphere();

	const material = new MeshBasicNodeMaterial();
	material.name = 'light-shafts';
	material.transparent = true;
	material.depthWrite = false;
	material.blending = AdditiveBlending;
	material.side = DoubleSide;
	material.fog = false;

	// ---------------------------------------------------------------- vertex
	const cornerAttr = attribute( 'aCorner', 'vec2' );
	const origin = attribute( 'aOrigin', 'vec3' );
	const shaftParams = attribute( 'aParams', 'vec3' );

	const shaftDir = normalize( U.sunDirection ).negate();

	const toCam = cameraPosition.sub( origin );
	const fwd = toCam.div( max( length( toCam ), float( 0.001 ) ) );
	const rightRaw = cross( shaftDir, fwd );
	const right = rightRaw.div( max( length( rightRaw ), float( 0.001 ) ) );

	const world = origin
		.add( shaftDir.mul( cornerAttr.y.mul( shaftParams.y ) ) )
		.add( right.mul( cornerAttr.x.mul( shaftParams.x ) ) );

	material.positionNode = worldToLocal( world );

	// -------------------------------------------------------------- fragment
	const vCorner = varying( cornerAttr );

	const edge = float( 1 ).sub( abs( vCorner.x ).mul( 2 ) );
	const along = vCorner.y;

	const fade = pow( max( edge, float( 0 ) ), float( 2 ) )
		.mul( smoothstep( float( 0 ), float( 0.18 ), along ) )
		.mul( pow( max( float( 1 ).sub( along ), float( 0 ) ), float( 1.3 ) ) );

	const noiseField = perlin(
		vec2( positionWorld.x, positionWorld.z ).mul( 0.7 )
			.add( vec2( U.time.mul( 0.04 ), U.time.mul( 0.025 ) ) ),
	).mul( 0.5 ).add( 0.5 );

	const toCamera = cameraPosition.sub( positionWorld );
	const distance = length( toCamera );

	const intensity = fade
		.mul( noiseField.mul( 0.65 ).add( 0.35 ) )
		.mul( U.godRaysIntensity )
		.mul( U.underwater );

	const colour = U.sunColor.mul( U.sunIntensity ).mul( SUN_IRRADIANCE )
		.mul( intensity )
		.mul( 0.11 )
		.mul( waterTransmittance( distance, U.underwaterVisibility, U.waterClarity ) );

	material.colorNode = vec4( colour, 1 );

	const mesh = new Mesh( geometry, material );
	mesh.name = 'light-shafts';
	mesh.frustumCulled = false;
	mesh.renderOrder = 8;

	return mesh;

}
