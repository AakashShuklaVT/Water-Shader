import * as TSL from 'three/tsl';

/**
 * Thin re-export of the TSL helpers used by the shaders.
 *
 * three's TypeScript definitions type most of the math helpers with a fixed
 * return type (`floor()` always claims to return a float, even when it is
 * applied to a vec2) which makes it impossible to write the swizzle heavy
 * shader code in a type safe way. The helpers below keep the exact runtime
 * behaviour of three.js but are typed loosely, mirroring how TSL is used in
 * practice.
 */
const tsl = TSL as any;

export const vec2 = tsl.vec2;
export const vec3 = tsl.vec3;
export const vec4 = tsl.vec4;
export const float = tsl.float;
export const int = tsl.int;
export const bool = tsl.bool;

export const abs = tsl.abs;
export const acos = tsl.acos;
export const atan = tsl.atan;
export const clamp = tsl.clamp;
export const cos = tsl.cos;
export const cross = tsl.cross;
export const dot = tsl.dot;
export const exp = tsl.exp;
export const floor = tsl.floor;
export const fract = tsl.fract;
export const length = tsl.length;
export const log = tsl.log;
export const max = tsl.max;
export const min = tsl.min;
export const mix = tsl.mix;
export const normalize = tsl.normalize;
export const pow = tsl.pow;
export const reflect = tsl.reflect;
export const refract = tsl.refract;
export const sign = tsl.sign;
export const sin = tsl.sin;
export const smoothstep = tsl.smoothstep;
export const sqrt = tsl.sqrt;
export const step = tsl.step;
export const tan = tsl.tan;

export {
	Fn,
	attribute,
	cameraPosition,
	modelWorldMatrixInverse,
	normalLocal,
	normalWorld,
	positionLocal,
	positionWorld,
	uniform,
	uv,
	varying,
} from 'three/tsl';

import { modelWorldMatrixInverse } from 'three/tsl';

/**
 * Transforms a world space position into the local space of the object.
 * Used by the billboard style meshes (particles, light shafts).
 */
export const worldToLocal = ( world: unknown ): any =>
	( modelWorldMatrixInverse.mul( vec4( world, 1 ) ) as any ).xyz;
