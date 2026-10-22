import { BufferAttribute, BufferGeometry } from 'three/webgpu';

/**
 * Builds a polar ("radial") grid centred on the origin.
 *
 * The ring radii grow geometrically which keeps the triangle density high
 * around the camera while still covering a huge area, so the ocean reaches
 * the horizon without a visible edge and without wasting vertices far away.
 */
export function createRadialGrid( rings: number, sectors: number, rMin: number, rMax: number ): BufferGeometry {

	const vertexCount = 1 + rings * sectors;
	const positions = new Float32Array( vertexCount * 3 );
	const indices: number[] = [];

	// centre vertex
	let v = 1;

	for ( let i = 0; i < rings; i ++ ) {

		const t = i / ( rings - 1 );
		const r = rMin * Math.pow( rMax / rMin, t );

		for ( let s = 0; s < sectors; s ++ ) {

			const a = ( s / sectors ) * Math.PI * 2;

			positions[ v * 3 + 0 ] = Math.cos( a ) * r;
			positions[ v * 3 + 1 ] = 0;
			positions[ v * 3 + 2 ] = Math.sin( a ) * r;

			v ++;

		}

	}

	// centre fan
	for ( let s = 0; s < sectors; s ++ ) {

		const a = 1 + s;
		const b = 1 + ( ( s + 1 ) % sectors );

		indices.push( 0, b, a );

	}

	// quad strip between the rings
	for ( let i = 0; i < rings - 1; i ++ ) {

		for ( let s = 0; s < sectors; s ++ ) {

			const s2 = ( s + 1 ) % sectors;

			const a = 1 + i * sectors + s;
			const b = 1 + i * sectors + s2;
			const c = 1 + ( i + 1 ) * sectors + s;
			const d = 1 + ( i + 1 ) * sectors + s2;

			indices.push( a, b, c );
			indices.push( b, d, c );

		}

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setIndex( indices );
	geometry.computeBoundingSphere();

	return geometry;

}
