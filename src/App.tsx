import { useCallback, useEffect, useRef, useState } from 'react';
import { OceanEngine, type BackendKind, type EngineStats } from './engine/OceanEngine';
import { defaultValues, type ParamValues } from './engine/params';
import type { ViewPreset } from './engine/cameraRig';
import { ControlPanel } from './ui/ControlPanel';

type Status = 'detecting' | 'loading' | 'running' | 'error';

interface BackendSupport {
	webgpu: boolean;
	webgl: boolean;
}

async function detectWebGPU(): Promise< boolean > {

	const gpu = ( navigator as Navigator & { gpu?: { requestAdapter: () => Promise< unknown > } } ).gpu;
	if ( ! gpu ) return false;

	try {

		const adapter = await gpu.requestAdapter();
		return adapter !== null;

	} catch {

		return false;

	}

}

function detectWebGL(): boolean {

	try {

		const canvas = document.createElement( 'canvas' );
		return canvas.getContext( 'webgl2' ) !== null;

	} catch {

		return false;

	}

}

export default function App() {

	const containerRef = useRef<HTMLDivElement>( null );
	const engineRef = useRef<OceanEngine | null >( null );

	const [ values, setValues ] = useState< ParamValues >( defaultValues );
	const [ backend, setBackend ] = useState< BackendKind >( 'webgpu' );
	const [ support, setSupport ] = useState< BackendSupport >( { webgpu: false, webgl: false } );
	const [ status, setStatus ] = useState< Status >( 'detecting' );
	const [ error, setError ] = useState< string | null >( null );
	const [ stats, setStats ] = useState< EngineStats | null >( null );
	const [ panelOpen, setPanelOpen ] = useState( true );
	const [ activePreset, setActivePreset ] = useState< ViewPreset >( 'above' );

	// ------------------------------------------------------- backend detection
	useEffect( () => {

		let cancelled = false;

		( async () => {

			const webgpu = await detectWebGPU();
			const webgl = detectWebGL();

			if ( cancelled ) return;

			setSupport( { webgpu, webgl } );

			if ( webgpu ) {

				setBackend( 'webgpu' );

			} else if ( webgl ) {

				setBackend( 'webgl' );
				setError( 'WebGPU is not available in this browser, the demo runs on the WebGL 2 backend.' );

			} else {

				setStatus( 'error' );
				setError( 'Neither WebGPU nor WebGL 2 are available in this browser.' );

			}

		} )();

		return () => { cancelled = true; };

	}, [] );

	// --------------------------------------------------------- engine lifetime
	useEffect( () => {

		const container = containerRef.current;
		if ( container === null || status === 'error' ) return;

		let cancelled = false;
		setStatus( 'loading' );

		OceanEngine.create( container, { container, backend, values } )
			.then( ( engine ) => {

				if ( cancelled ) {

					engine.dispose();
					return;

				}

				engineRef.current = engine;
				setStatus( 'running' );

				// debug hook, handy for tweaking the scene from the console
				( window as unknown as { __ocean?: OceanEngine } ).__ocean = engine;

			} )
			.catch( ( reason: unknown ) => {

				if ( cancelled ) return;

				setStatus( 'error' );
				setError( reason instanceof Error ? reason.message : String( reason ) );

			} );

		return () => {

			cancelled = true;
			engineRef.current?.dispose();
			engineRef.current = null;

		};

		// the engine is only rebuilt when the rendering backend changes
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ backend ] );

	// ------------------------------------------------------------- parameters
	const handleChange = useCallback( ( key: string, value: number | boolean | string ) => {

		setValues( ( previous ) => {

			const next = { ...previous, [ key ]: value };
			engineRef.current?.applyValues( next );
			return next;

		} );

	}, [] );

	useEffect( () => {

		engineRef.current?.applyValues( values );

	}, [ values ] );

	// quality changes rebuild the geometry
	const previousQuality = useRef( values.quality );

	useEffect( () => {

		if ( previousQuality.current === values.quality ) return;
		previousQuality.current = values.quality;
		engineRef.current?.setQuality( values.quality as 'auto' | 'low' | 'medium' | 'high' | 'ultra' );

	}, [ values.quality ] );

	// ------------------------------------------------------------------- stats
	useEffect( () => {

		if ( status !== 'running' ) return;

		const id = window.setInterval( () => {

			const engine = engineRef.current;
			if ( engine ) setStats( engine.getStats() );

		}, 500 );

		return () => window.clearInterval( id );

	}, [ status ] );

	// ---------------------------------------------------------------- keyboard
	useEffect( () => {

		const onKey = ( event: KeyboardEvent ) => {

			if ( event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ) return;

			switch ( event.key.toLowerCase() ) {

				case '1': setActivePreset( 'above' ); engineRef.current?.setView( 'above' ); break;
				case '2': setActivePreset( 'surface' ); engineRef.current?.setView( 'surface' ); break;
				case '3': setActivePreset( 'below' ); engineRef.current?.setView( 'below' ); break;

			}

		};

		window.addEventListener( 'keydown', onKey );
		return () => window.removeEventListener( 'keydown', onKey );

	}, [] );

	const preset = useCallback( ( next: ViewPreset ) => {

		setActivePreset( next );
		engineRef.current?.setView( next );

	}, [] );

	const actualBackend = stats?.backend ?? backend;

	return (
		<div className="app">
			<div className="viewport" ref={ containerRef } />

			{ status === 'loading' || status === 'detecting' ? (
				<div className="overlay overlay--solid">
					<div className="loader" />
					<p className="overlay__title">Preparing the ocean…</p>
					<p className="overlay__hint">Compiling TSL shaders for the { backend.toUpperCase() } backend</p>
				</div>
			) : null }

			{ status === 'error' ? (
				<div className="overlay overlay--solid">
					<p className="overlay__title overlay__title--error">Unable to start the renderer</p>
					<p className="overlay__hint">{ error }</p>
				</div>
			) : null }

			<header className="hud">
				<div className="hud__brand">
					<span className="hud__dot" />
					<div>
						<h1>Photoreal Ocean</h1>
						<p>Three.js WebGPU &amp; TSL</p>
					</div>
				</div>

				<div className="hud__stats">
					<span className="chip">{ actualBackend === 'webgpu' ? 'WebGPU' : 'WebGL 2' }</span>
					{ stats ? <span className="chip">{ stats.fps.toFixed( 0 ) } fps</span> : null }
					{ stats ? <span className="chip">{ stats.quality }</span> : null }
					{ stats ? <span className="chip">{( stats.triangles / 1000 ).toFixed( 0 )}k tris</span> : null }
					{ stats ? <span className="chip">{ stats.drawCalls } calls</span> : null }
				</div>
			</header>

			<div className="viewbar">
				{ ( [ 'above', 'surface', 'below' ] as ViewPreset[] ).map( ( key ) => (
					<button
						key={ key }
						type="button"
						className={ `viewbar__button${ activePreset === key ? ' is-active' : '' }` }
						onClick={ () => preset( key ) }
					>
						{ key === 'above' ? 'Above water' : key === 'surface' ? 'Waterline' : 'Underwater' }
					</button>
				) ) }
			</div>

			<button
				type="button"
				className="panel-toggle"
				onClick={ () => setPanelOpen( ( open ) => ! open ) }
			>
				{ panelOpen ? 'Hide controls' : 'Controls' }
			</button>

			{ panelOpen ? (
				<ControlPanel
					values={ values }
					onChange={ handleChange }
					backend={ backend }
					onBackend={ setBackend }
					support={ support }
				/>
			) : null }

			{ error && status !== 'error' ? <div className="notice">{ error }</div> : null }
		</div>
	);

}
