/**
 * Parameter schema for the demo.
 *
 * The GUI is generated from this description, the engine maps the values to
 * the TSL uniforms. Every value can be changed at runtime, no shader rebuild
 * is required.
 */

export interface NumberParamDef {
	kind: 'number';
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	unit?: string;
}

export interface BooleanParamDef {
	kind: 'boolean';
	key: string;
	label: string;
	value: boolean;
}

export interface SelectParamDef {
	kind: 'select';
	key: string;
	label: string;
	options: { value: string; label: string }[];
	value: string;
}

export type ParamDef = NumberParamDef | BooleanParamDef | SelectParamDef;

export interface ParamGroup {
	title: string;
	params: ParamDef[];
}

export type ParamValues = Record< string, number | boolean | string >;

export const PARAM_GROUPS: ParamGroup[] = [
	{
		title: 'Ocean Surface',
		params: [
			{ kind: 'number', key: 'waveAmplitude', label: 'Wave amplitude', min: 0, max: 2.2, step: 0.01, value: 1 },
			{ kind: 'number', key: 'waveSpeed', label: 'Wave speed', min: 0, max: 2.5, step: 0.01, value: 1 },
			{ kind: 'number', key: 'waveScale', label: 'Wave scale', min: 0.45, max: 2.2, step: 0.01, value: 1 },
			{ kind: 'number', key: 'waveChoppy', label: 'Crest sharpness', min: 0, max: 2, step: 0.01, value: 0.55 },
			{ kind: 'number', key: 'foamAmount', label: 'Foam', min: 0, max: 1.6, step: 0.01, value: 0.65 },
			{ kind: 'number', key: 'reflectionStrength', label: 'Reflection', min: 0, max: 1.6, step: 0.01, value: 1 },
		],
	},
	{
		title: 'Water Body',
		params: [
			{ kind: 'number', key: 'waterDepth', label: 'Depth', min: 2, max: 40, step: 0.1, value: 18, unit: 'm' },
			{ kind: 'number', key: 'waterClarity', label: 'Clarity', min: 0.15, max: 2.5, step: 0.01, value: 1 },
			{ kind: 'number', key: 'underwaterVisibility', label: 'Visibility', min: 4, max: 90, step: 0.5, value: 26, unit: 'm' },
		],
	},
	{
		title: 'Sun & Atmosphere',
		params: [
			{ kind: 'number', key: 'sunElevation', label: 'Sun elevation', min: 1, max: 88, step: 0.5, value: 41, unit: '°' },
			{ kind: 'number', key: 'sunAzimuth', label: 'Sun azimuth', min: 0, max: 360, step: 1, value: 138, unit: '°' },
			{ kind: 'number', key: 'sunIntensity', label: 'Sun intensity', min: 0, max: 3, step: 0.01, value: 1 },
			{ kind: 'number', key: 'turbidity', label: 'Turbidity', min: 1, max: 10, step: 0.05, value: 2.6 },
			{ kind: 'number', key: 'rayleigh', label: 'Rayleigh', min: 0, max: 4, step: 0.01, value: 1.7 },
			{ kind: 'number', key: 'cloudCoverage', label: 'Cloud cover', min: 0, max: 1, step: 0.01, value: 0.32 },
		],
	},
	{
		title: 'Underwater',
		params: [
			{ kind: 'number', key: 'causticsIntensity', label: 'Caustics', min: 0, max: 2.5, step: 0.01, value: 1 },
			{ kind: 'number', key: 'godRaysIntensity', label: 'Light shafts', min: 0, max: 2.5, step: 0.01, value: 0.9 },
			{ kind: 'number', key: 'particleAmount', label: 'Suspended particles', min: 0, max: 2, step: 0.01, value: 0.7 },
		],
	},
	{
		title: 'Rendering',
		params: [
			{
				kind: 'select', key: 'quality', label: 'Quality',
				options: [
					{ value: 'auto', label: 'Auto' },
					{ value: 'low', label: 'Low' },
					{ value: 'medium', label: 'Medium' },
					{ value: 'high', label: 'High' },
					{ value: 'ultra', label: 'Ultra' },
				],
				value: 'auto',
			},
			{ kind: 'number', key: 'exposure', label: 'Exposure', min: 0.2, max: 2.4, step: 0.01, value: 0.9 },
		],
	},
];

export function defaultValues(): ParamValues {

	const values: ParamValues = {};

	for ( const group of PARAM_GROUPS ) {

		for ( const param of group.params ) {

			values[ param.key ] = param.value;

		}

	}

	return values;

}
