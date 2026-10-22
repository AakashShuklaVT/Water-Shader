import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three/webgpu';

export type ViewPreset = 'above' | 'below' | 'surface';

interface PointerState {
	x: number;
	y: number;
}

/**
 * Orbit style camera rig.
 *
 * Written by hand instead of using OrbitControls so the camera can freely
 * cross the water line: the polar angle is allowed to go past 90 degrees
 * which puts the camera below the surface while it keeps orbiting.
 */
export class CameraRig {

	readonly camera: PerspectiveCamera;

	private readonly element: HTMLElement;
	private readonly target = new Vector3( 0, 0.4, 0 );
	private readonly targetGoal = new Vector3( 0, 0.4, 0 );
	private readonly spherical = new Spherical( 28, Math.PI * 0.45, 0.12 );
	private readonly sphericalGoal = new Spherical( 28, Math.PI * 0.45, 0.12 );

	private readonly pointers = new Map< number, PointerState >();
	private pinchDistance = 0;
	private panning = false;
	private disposed = false;

	private readonly onPointerDown: ( event: PointerEvent ) => void;
	private readonly onPointerMove: ( event: PointerEvent ) => void;
	private readonly onPointerUp: ( event: PointerEvent ) => void;
	private readonly onWheel: ( event: WheelEvent ) => void;
	private readonly onContextMenu: ( event: MouseEvent ) => void;

	constructor( element: HTMLElement, aspect: number ) {

		this.element = element;
		this.camera = new PerspectiveCamera( 52, aspect, 0.08, 40000 );

		this.onPointerDown = ( event: PointerEvent ) => {

			element.setPointerCapture?.( event.pointerId );
			this.pointers.set( event.pointerId, { x: event.clientX, y: event.clientY } );
			this.panning = event.button === 2 || event.shiftKey;

			if ( this.pointers.size === 2 ) {

				const [ a, b ] = [ ...this.pointers.values() ];
				this.pinchDistance = Math.hypot( a.x - b.x, a.y - b.y );

			}

		};

		this.onPointerMove = ( event: PointerEvent ) => {

			const previous = this.pointers.get( event.pointerId );
			if ( previous === undefined ) return;

			const dx = event.clientX - previous.x;
			const dy = event.clientY - previous.y;

			previous.x = event.clientX;
			previous.y = event.clientY;

			if ( this.pointers.size >= 2 ) {

				const [ a, b ] = [ ...this.pointers.values() ];
				const distance = Math.hypot( a.x - b.x, a.y - b.y );

				if ( this.pinchDistance > 0 ) {

					this.zoom( ( this.pinchDistance - distance ) * 0.02 );

				}

				this.pinchDistance = distance;
				return;

			}

			if ( this.panning ) {

				this.pan( dx, dy );
				return;

			}

			this.sphericalGoal.theta -= dx * 0.005;
			this.sphericalGoal.phi = MathUtils.clamp( this.sphericalGoal.phi - dy * 0.005, 0.08, Math.PI - 0.08 );

		};

		this.onPointerUp = ( event: PointerEvent ) => {

			this.pointers.delete( event.pointerId );
			if ( this.pointers.size < 2 ) this.pinchDistance = 0;
			if ( this.pointers.size === 0 ) this.panning = false;

		};

		this.onWheel = ( event: WheelEvent ) => {

			event.preventDefault();
			this.zoom( event.deltaY * 0.01 );

		};

		this.onContextMenu = ( event: MouseEvent ) => event.preventDefault();

		element.addEventListener( 'pointerdown', this.onPointerDown );
		element.addEventListener( 'pointermove', this.onPointerMove );
		element.addEventListener( 'pointerup', this.onPointerUp );
		element.addEventListener( 'pointercancel', this.onPointerUp );
		element.addEventListener( 'wheel', this.onWheel, { passive: false } );
		element.addEventListener( 'contextmenu', this.onContextMenu );

		this.update( 1 );

	}

	private zoom( amount: number ) {

		this.sphericalGoal.radius = MathUtils.clamp( this.sphericalGoal.radius * ( 1 + amount ), 2.5, 220 );

	}

	private pan( dx: number, dy: number ) {

		const scale = this.sphericalGoal.radius * 0.0016;
		const right = new Vector3().setFromMatrixColumn( this.camera.matrix, 0 );
		const up = new Vector3().setFromMatrixColumn( this.camera.matrix, 1 );

		this.targetGoal.addScaledVector( right, - dx * scale );
		this.targetGoal.addScaledVector( up, dy * scale );
		this.targetGoal.y = MathUtils.clamp( this.targetGoal.y, - 40, 40 );

	}

	/**
	 * Moves the camera to one of the demo viewpoints.
	 */
	setPreset( preset: ViewPreset ) {

		switch ( preset ) {

			case 'above':
				this.targetGoal.set( 0, 0.4, 0 );
				this.sphericalGoal.radius = 28;
				this.sphericalGoal.phi = Math.PI * 0.45;
				break;

			case 'below':
				this.targetGoal.set( 0, - 5.0, 0 );
				this.sphericalGoal.radius = 12;
				this.sphericalGoal.phi = 1.5;
				break;

			case 'surface':
				this.targetGoal.set( 0, - 0.2, 0 );
				this.sphericalGoal.radius = 9;
				this.sphericalGoal.phi = Math.PI * 0.5;
				break;

		}

	}

	update( dt: number ) {

		const k = 1 - Math.pow( 0.0015, Math.min( dt, 0.1 ) );

		this.spherical.radius += ( this.sphericalGoal.radius - this.spherical.radius ) * k;
		this.spherical.phi += ( this.sphericalGoal.phi - this.spherical.phi ) * k;
		this.spherical.theta += ( this.sphericalGoal.theta - this.spherical.theta ) * k;
		this.target.lerp( this.targetGoal, k );

		this.spherical.makeSafe();

		this.camera.position.setFromSpherical( this.spherical ).add( this.target );
		this.camera.lookAt( this.target );

	}

	resize( aspect: number ) {

		this.camera.aspect = aspect;
		this.camera.updateProjectionMatrix();

	}

	dispose() {

		if ( this.disposed ) return;
		this.disposed = true;

		this.element.removeEventListener( 'pointerdown', this.onPointerDown );
		this.element.removeEventListener( 'pointermove', this.onPointerMove );
		this.element.removeEventListener( 'pointerup', this.onPointerUp );
		this.element.removeEventListener( 'pointercancel', this.onPointerUp );
		this.element.removeEventListener( 'wheel', this.onWheel );
		this.element.removeEventListener( 'contextmenu', this.onContextMenu );

		this.pointers.clear();

	}

}
