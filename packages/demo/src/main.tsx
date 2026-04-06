import ReactDOM from 'react-dom/client';

import { DemoApp } from './DemoApp';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Demo root element #root was not found');
}

ReactDOM.createRoot(rootElement).render(<DemoApp />);
