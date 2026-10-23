// `three/webgpu` registers the TSL node namespace at the end of its module
// body. The shader modules call into that namespace while they are being
// evaluated, so the webgpu entry point has to be the very first import of
// the application - otherwise the namespace is still empty at that point.
import 'three/webgpu';

import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const container = document.getElementById( 'root' );

if ( container !== null ) {

	createRoot( container ).render( <App /> );

}
