import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, cameraPosition, positionWorld, uv } from 'three/tsl';
import {
	vec3, vec4, float, sin, cos, dot,
	cross, length, normalize, max, pow, smoothstep, worldToLocal,
} from '../tsl/math';
import { U, SUN_IRRADIANCE } from '../tsl/uniforms';
import { waterTransmittance, waterScatterColor } from '../tsl/water';

/**
 * Suspended sediment (marine snow).
 *
 * Every particle is a small camera facing quad. The positions are animated
 * in the vertex stage so the CPU never touches the buffers. The particles are
 * attenuated by the same Beer-Lambert model as the sand, which makes them
 * disappear into the blue haze with the distance.
 */
export function createParticles( count: number ): Mesh {

	const positions = new Float32Array( count * 4 * 3 );
	const corners = new Float32Array( count * 4 * 2 );
	const uvs = new Float32Array( count * 4 * 2 );
	const centers = new Float32Array( count * 4 * 3 );
	const seeds = new Float32Array( count * 4 );
	const indices = new Uint32Array( count * 6 );

	const quad = [ [ - 0.5, - 0.5 ], [ 0.5, - 0.5 ], [ 0.5, 0.5 ], [ - 0.5, 0.5 ] ];
	const quadUv = [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ];

	let seed = 1337;
	const random = () => {

		// deterministic pseudo random generator
		seed = ( seed * 1664525 + 1013904223 ) % 4294967296;
		return seed / 4294967296;

	};

	for ( let i = 0; i < count; i ++ ) {

		const angle = random() * Math.PI * 2;
		const radius = Math.sqrt( random() ) * 34 + 0.4;
		const x = Math.cos( angle ) * radius;
		const z = Math.sin( angle ) * radius;
		const y = - 0.35 - random() * 16.5;
		const s = random();

		for ( let v = 0; v < 4; v ++ ) {

			const o = ( i * 4 + v );

			positions[ o * 3 + 0 ] = 0;
			positions[ o * 3 + 1 ] = 0;
			positions[ o * 3 + 2 ] = 0;

			corners[ o * 2 + 0 ] = quad[ v ][ 0 ];
			corners[ o * 2 + 1 ] = quad[ v ][ 1 ];

			uvs[ o * 2 + 0 ] = quadUv[ v ][ 0 ];
			uvs[ o * 2 + 1 ] = quadUv[ v ][ 1 ];

			centers[ o * 3 + 0 ] = x;
			centers[ o * 3 + 1 ] = y;
			centers[ o * 3 + 2 ] = z;

			seeds[ o ] = s;

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
	geometry.setAttribute( 'uv', new BufferAttribute( uvs, 2 ) );
	geometry.setAttribute( 'aCenter', new BufferAttribute( centers, 3 ) );
	geometry.setAttribute( 'aSeed', new BufferAttribute( seeds, 1 ) );
	geometry.setIndex( new BufferAttribute( indices, 1 ) );
	geometry.computeBoundingSphere();

	const material = new MeshBasicNodeMaterial();
	material.name = 'particles';
	material.transparent = true;
	material.depthWrite = false;
	material.blending = AdditiveBlending;
	material.fog = false;

	// ---------------------------------------------------------------- vertex
	const corner = attribute( 'aCorner', 'vec2' );
	const center = attribute( 'aCenter', 'vec3' );
	const seedAttr = attribute( 'aSeed', 'float' );

	const t = U.time;

	const drift = vec3(
		sin( t.mul( 0.11 ).add( seedAttr.mul( 12.9 ) ) ),
		sin( t.mul( 0.07 ).add( seedAttr.mul( 4.3 ) ) ).mul( 0.6 ),
		cos( t.mul( 0.09 ).add( seedAttr.mul( 7.7 ) ) ),
	).mul( 0.5 );

	const world = center.add( drift );
	const toCam = cameraPosition.sub( world );
	const dist = length( toCam );
	const fwd = toCam.div( max( dist, float( 0.001 ) ) );
	const rightRaw = cross( vec3( 0, 1, 0 ), fwd );
	const right = rightRaw.div( max( length( rightRaw ), float( 0.001 ) ) );
	const up = cross( fwd, right );

	const size = float( 0.016 ).add( seedAttr.mul( 0.042 ) ).mul( float( 0.6 ).add( U.particleAmount.mul( 0.6 ) ) );

	const billboard = world
		.add( right.mul( corner.x.mul( size ) ) )
		.add( up.mul( corner.y.mul( size ) ) );

	material.positionNode = worldToLocal( billboard );

	// -------------------------------------------------------------- fragment
	const radial = length( uv().sub( 0.5 ) ).mul( 2 );
	const soft = smoothstep( float( 0.25 ), float( 1 ), radial ).oneMinus();

	const toCamera = cameraPosition.sub( positionWorld );
	const viewDir = toCamera.div( max( length( toCamera ), float( 0.001 ) ) );
	const backlit = max( dot( viewDir.negate(), normalize( U.sunDirection ) ), 0 );

	const glow = float( 0.35 ).add( pow( backlit, float( 2 ) ).mul( 1.8 ) );

	const distance = length( toCamera );
	const T = waterTransmittance( distance, U.underwaterVisibility, U.waterClarity );
	const scatter = waterScatterColor( viewDir.negate(), U.sunDirection, U.sunIntensity );

	const lit = vec3( 0.72, 0.82, 0.88 ).mul( U.sunIntensity ).mul( SUN_IRRADIANCE ).div( Math.PI ).mul( glow );

	const colour = lit.mul( T ).add( scatter.mul( float( 1 ).sub( T ) ).mul( 0.35 ) );

	material.colorNode = vec4( colour.mul( soft ).mul( 0.5 ), 1 );

	const mesh = new Mesh( geometry, material );
	mesh.name = 'particles';
	mesh.frustumCulled = false;
	mesh.renderOrder = 5;

	return mesh;

}
