import { HashRouter } from 'react-router-dom';
import { ApplicationProviders } from './ApplicationProviders';
import { AppRouter } from './router';

export function App() {
  return (
    <HashRouter>
      <ApplicationProviders>
        <AppRouter />
      </ApplicationProviders>
    </HashRouter>
  );
}
