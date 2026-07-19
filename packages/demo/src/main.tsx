import './index.css';

import ReactDOM from 'react-dom/client';

import { V1DemoApp } from './demo-app/v1-demo-app';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Demo root element #root was not found');
}

ReactDOM.createRoot(rootElement).render(<V1DemoApp />);
