import {
	AgXToneMapping,
	Material,
	MathUtils,
	Mesh,
	Scene,
	WebGPURenderer,
} from 'three/webgpu';
import { U } from './tsl/uniforms';
import { createSkyDome } from './objects/SkyDome';
import { createOceanSurface } from './objects/OceanSurface';
import { createSeabed } from './objects/Seabed';
import { createParticles } from './objects/Particles';
import { createLightShafts } from './objects/LightShafts';
import { QUALITY_PRESETS, type QualityPreset } from './quality';
import { CameraRig, type ViewPreset } from './cameraRig';
import type { ParamValues } from './params';

export type BackendKind = 'webgpu' | 'webgl';

export interface EngineOptions {
	container: HTMLElement;
	backend: BackendKind;
	values: ParamValues;
}

export interface EngineStats {
	fps: number;
	backend: BackendKind;
	quality: string;
	triangles: number;
	drawCalls: number;
}

/**
 * The ocean engine.
 *
 * It owns the renderer, the scene graph and the animation loop. The renderer
 * is a `WebGPURenderer`; with `forceWebGL` it falls back to the WebGL 2
 * backend which compiles the very same TSL node materials to GLSL, so both
 * backends run identical shaders.
 */
export class OceanEngine {

	/** The shared TSL uniform block, exposed for live tweaking from the console. */
	readonly uniforms = U;

	private readonly container: HTMLElement;
	private readonly canvas: HTMLCanvasElement;
	private readonly renderer: WebGPURenderer;
	private readonly scene = new Scene();

	private rig!: CameraRig;
	private sky!: Mesh;
	private ocean!: ReturnType< typeof createOceanSurface >;
	private seabed!: Mesh;
	private particles!: Mesh;
	private shafts!: Mesh;

	private quality: QualityPreset;
	private values: ParamValues;
	private backend: BackendKind = 'webgpu';

	private resizeObserver: ResizeObserver | null = null;
	private lastTime = 0;
	private fpsAccumulator = 0;
	private fpsFrames = 0;
	private fps = 0;
	private autoQuality = false;
	private lowFpsTime = 0;
	private disposed = false;

	private constructor( container: HTMLElement, options: EngineOptions ) {

		this.container = container;
		this.values = { ...options.values };

		// Start from the highest preset, then step down automatically if
		// requested ('auto') or if the frame rate collapses.
		this.quality = QUALITY_PRESETS.high;
		if (options.values?.quality) {
			const q = QUALITY_PRESETS[ options.values.quality as keyof typeof QUALITY_PRESETS ];
			if (q) this.quality = q;
		}

		// Every engine owns its own canvas: a canvas can only ever have one
		// WebGL context, so a new one is required whenever the renderer is
		// rebuilt (for example when the user switches the backend).
		this.canvas = document.createElement( 'canvas' );
		this.canvas.className = 'canvas';
		container.appendChild( this.canvas );

		this.renderer = new WebGPURenderer( {
			canvas: this.canvas,
			// MSAA multiplies the memory bandwidth of the frame buffer. On a
			// phone that costs more than it is worth, and the water shader is
			// fragment bound anyway.
			antialias: ! this.isMobileDevice(),
			alpha: false,
			forceWebGL: options.backend === 'webgl',
		} );

	}

	/**
	 * A coarse pointer is a reliable hint for a touch device.
	 */
	private isMobileDevice(): boolean {

		if ( typeof window.matchMedia === 'function' ) {

			try {

				return window.matchMedia( '(pointer: coarse)' ).matches;

			} catch ( error ) {

				// matchMedia is not available, fall through

			}

		}

		return navigator.maxTouchPoints > 1 && window.innerWidth < 900;

	}

	static async create( container: HTMLElement, options: EngineOptions ): Promise< OceanEngine > {

		const engine = new OceanEngine( container, options );
		await engine.init();
		return engine;

	}

	private async init() {

		await this.renderer.init();

		this.backend = ( this.renderer.backend as { isWebGPUBackend?: boolean } ).isWebGPUBackend === true ? 'webgpu' : 'webgl';

		this.renderer.toneMapping = AgXToneMapping;
		this.renderer.toneMappingExposure = this.values.exposure as number;

		this.rig = new CameraRig( this.canvas, this.width / this.height );
		this.sky = createSkyDome();

		this.scene.add( this.sky );
		this.buildScene();
		this.applyValues( this.values );

		this.resize();
		this.setupResizeObserver();

		this.lastTime = performance.now();
		this.renderer.setAnimationLoop( this.animate );

	}

	private get width(): number {

		return Math.max( 1, this.container.clientWidth || window.innerWidth );

	}

	private get height(): number {

		return Math.max( 1, this.container.clientHeight || window.innerHeight );

	}

	private setupResizeObserver() {

		if ( typeof ResizeObserver === 'undefined' ) {

			window.addEventListener( 'resize', this.onWindowResize );
			return;

		}

		this.resizeObserver = new ResizeObserver( () => this.resize() );
		this.resizeObserver.observe( this.container );

	}

	private onWindowResize = () => this.resize();

	private resize() {

		const w = this.width;
		const h = this.height;

		// The water shader is fragment bound, so the resolution of the
		// drawing buffer is the strongest performance lever there is. The
		// preset caps the device pixel ratio and adds a render scale on top.
		const dpr = Math.min( window.devicePixelRatio || 1, this.quality.pixelRatioCap );
		this.renderer.setPixelRatio( dpr * this.quality.renderScale );

		this.renderer.setSize( w, h, false );
		this.rig.resize( w / h );

	}
	private buildScene() {

		if ( this.ocean !== undefined ) {

			this.scene.remove( this.ocean.mesh );
			this.ocean.dispose();

		}

		for ( const mesh of [ this.seabed, this.particles, this.shafts ] ) {

			if ( mesh === undefined ) continue;

			this.scene.remove( mesh );
			mesh.geometry.dispose();
			( mesh.material as Material ).dispose();

		}

		this.ocean = createOceanSurface( this.quality );
		this.seabed = createSeabed( this.quality );
		this.particles = createParticles( this.quality.particles );
		this.shafts = createLightShafts( this.quality.lightShafts );

		this.scene.add( this.seabed, this.particles, this.shafts, this.ocean.mesh );

	}

	/**
	 * Pushes the GUI values into the TSL uniforms.
	 */
	applyValues( values: ParamValues ) {

		this.values = { ...values };

		U.waveAmplitude.value = values.waveAmplitude as number;
		U.waveSpeed.value = values.waveSpeed as number;
		U.waveScale.value = values.waveScale as number;
		U.waveChoppy.value = values.waveChoppy as number;
		U.foamAmount.value = values.foamAmount as number;
		U.reflectionStrength.value = values.reflectionStrength as number;

		U.waterDepth.value = values.waterDepth as number;
		U.waterClarity.value = values.waterClarity as number;
		U.underwaterVisibility.value = values.underwaterVisibility as number;

		U.sunIntensity.value = values.sunIntensity as number;
		U.turbidity.value = values.turbidity as number;
		U.rayleigh.value = values.rayleigh as number;
		U.cloudCoverage.value = values.cloudCoverage as number;

		U.causticsIntensity.value = values.causticsIntensity as number;
		U.godRaysIntensity.value = values.godRaysIntensity as number;
		U.particleAmount.value = values.particleAmount as number;

		const elevation = MathUtils.degToRad( values.sunElevation as number );
		const azimuth = MathUtils.degToRad( values.sunAzimuth as number );

		U.sunDirection.value
			.set( Math.cos( elevation ) * Math.sin( azimuth ), Math.sin( elevation ), Math.cos( elevation ) * Math.cos( azimuth ) )
			.normalize();

		this.renderer.toneMappingExposure = values.exposure as number;

	}

	/**
	 * Switches the quality preset. `auto` lets the engine step the preset down
	 * on its own when the frame rate collapses.
	 */
	setQuality( name: QualityPreset[ 'name' ] | 'auto' ) {

		if ( name === 'auto' ) {

			this.autoQuality = true;
			return;

		}

		this.autoQuality = false;

		if ( this.quality.name === name ) return;

		this.quality = QUALITY_PRESETS[ name ];
		this.buildScene();
		this.resize();

	}

	private stepDownQuality() {

		const order: QualityPreset[ 'name' ][] = [ 'ultra', 'high', 'medium', 'low' ];
		const index = order.indexOf( this.quality.name );

		if ( index < 0 || index >= order.length - 1 ) return;

		this.quality = QUALITY_PRESETS[ order[ index + 1 ] ];
		this.buildScene();
		this.resize();

	}

	setView( preset: ViewPreset ) {

		this.rig.setPreset( preset );

	}

	getStats(): EngineStats {

		const render = this.renderer.info.render;

		return {
			fps: this.fps,
			backend: this.backend,
			quality: this.quality.name,
			triangles: render.triangles,
			drawCalls: render.calls,
		};

	}

	private animate = () => {

		if ( this.disposed ) return;

		const now = performance.now();
		const rawDt = ( now - this.lastTime ) / 1000;
		const dt = Math.min( rawDt, 0.1 );
		this.lastTime = now;

		this.fpsAccumulator += rawDt;
		this.fpsFrames ++;

		if ( this.fpsAccumulator >= 0.5 ) {

			const elapsed = this.fpsAccumulator;

			this.fps = this.fpsFrames / elapsed;
			this.fpsAccumulator = 0;
			this.fpsFrames = 0;

			// adaptive quality: step the preset down when the frame rate
			// collapses and stay there (no oscillation). A very low frame
			// rate is stepped down almost immediately, a merely low one
			// after a couple of seconds.
			if ( this.autoQuality ) {

				if ( this.fps < 26 ) {

					this.lowFpsTime += elapsed;

					const needed = this.fps < 14 ? 0.5 : 2;

					if ( this.lowFpsTime > needed ) {

						this.lowFpsTime = 0;
						this.stepDownQuality();

					}

				} else {

					this.lowFpsTime = 0;

				}

			}

		}

		U.time.value += dt;

		this.rig.update( dt );
		this.sky.position.copy( this.rig.camera.position );

		// smooth transition when the camera crosses the water line
		const y = this.rig.camera.position.y;
		const submerged = y < 0;

		U.underwater.value = submerged ? Math.min( 1, - y * 2.5 ) : 0;

		this.ocean.setUnderwater( submerged );

		// From above the water the ocean surface is opaque and shades the sea
		// floor itself, so the separate floor mesh would only cost fill rate.
		this.seabed.visible = submerged;

		// The particles and the light shafts live inside the water. Above the
		// water line they are completely invisible, but their fragment
		// shaders would still run over a large part of the screen.
		this.particles.visible = submerged;
		this.shafts.visible = submerged;

		this.renderer.render( this.scene, this.rig.camera );
	};

	dispose() {

		if ( this.disposed ) return;
		this.disposed = true;

		this.renderer.setAnimationLoop( null );
		this.resizeObserver?.disconnect();
		window.removeEventListener( 'resize', this.onWindowResize );
		this.rig?.dispose();

		if ( this.ocean !== undefined ) {

			this.scene.remove( this.ocean.mesh );
			this.ocean.dispose();

		}

		for ( const mesh of [ this.sky, this.seabed, this.particles, this.shafts ] ) {

			if ( mesh === undefined ) continue;

			this.scene.remove( mesh );
			mesh.geometry.dispose();
			( mesh.material as Material ).dispose();

		}

		this.renderer.dispose();

		this.canvas.remove();

	}

}
