import { PARAM_GROUPS, type ParamValues } from '../engine/params';
import type { BackendKind } from '../engine/OceanEngine';

interface ControlPanelProps {
	values: ParamValues;
	onChange: ( key: string, value: number | boolean | string ) => void;
	backend: BackendKind;
	onBackend: ( backend: BackendKind ) => void;
	support: { webgpu: boolean; webgl: boolean };
}

export function ControlPanel( { values, onChange, backend, onBackend, support }: ControlPanelProps ) {

	return (
		<aside className="panel">
			<div className="panel__header">
				<span>Parameters</span>
				<span className="panel__badge">live</span>
			</div>

			<div className="panel__body">
				<div className="segmented">
					<button
						type="button"
						className="segmented__item"
						onClick={ () => {
							if ( document.fullscreenElement ) {
								document.exitFullscreen();
							} else {
								document.documentElement.requestFullscreen();
							}
						} }
						title="Toggle fullscreen"
					>
						Fullscreen
					</button>
				</div>

				<div className="group">
					<div className="group__title">Renderer</div>
					<div className="segmented">
						<button
							type="button"
							className={ `segmented__item${ backend === 'webgpu' ? ' is-active' : '' }` }
							disabled={ ! support.webgpu }
							onClick={ () => onBackend( 'webgpu' ) }
							title={ support.webgpu ? 'Switch to the WebGPU backend' : 'WebGPU is not available in this browser' }
						>
							WebGPU
						</button>
						<button
							type="button"
							className={ `segmented__item${ backend === 'webgl' ? ' is-active' : '' }` }
							disabled={ ! support.webgl }
							onClick={ () => onBackend( 'webgl' ) }
							title={ support.webgl ? 'Switch to the WebGL 2 backend' : 'WebGL 2 is not available in this browser' }
						>
							WebGL 2
						</button>
					</div>
				</div>

				{ PARAM_GROUPS.map( ( group ) => (

					<div className="group" key={ group.title }>
						<div className="group__title">{ group.title }</div>

						{ group.params.map( ( param ) => {

							if ( param.kind === 'number' ) {

								const value = values[ param.key ] as number;

								return (
									<label className="control" key={ param.key }>
										<span className="control__label">
											{ param.label }
											<span className="control__value">
												{ value.toFixed( param.step < 0.1 ? 2 : param.step < 1 ? 1 : 0 ) }{ param.unit ?? '' }
											</span>
										</span>
										<input
											type="range"
											min={ param.min }
											max={ param.max }
											step={ param.step }
											value={ value }
											onChange={ ( event ) => onChange( param.key, Number( event.target.value ) ) }
										/>
									</label>
								);

							}

							if ( param.kind === 'boolean' ) {

								const value = values[ param.key ] as boolean;

								return (
									<label className="control control--row" key={ param.key }>
										<span className="control__label">{ param.label }</span>
										<input
											type="checkbox"
											checked={ value }
											onChange={ ( event ) => onChange( param.key, event.target.checked ) }
										/>
									</label>
								);

							}

							const value = values[ param.key ] as string;

							return (
								<div className="control" key={ param.key }>
									<span className="control__label">{ param.label }</span>
									<div className="segmented segmented--wrap">
										{ param.options.map( ( option ) => (
											<button
												type="button"
												key={ option.value }
												className={ `segmented__item${ value === option.value ? ' is-active' : '' }` }
												onClick={ () => onChange( param.key, option.value ) }
											>
												{ option.label }
											</button>
										) ) }
									</div>
								</div>
							);

						} ) }
					</div>

				) ) }

				<p className="panel__footer">
					Drag to orbit · wheel to zoom · shift-drag to pan · keys 1 / 2 / 3 switch viewpoint
				</p>
			</div>
		</aside>
	);

}
