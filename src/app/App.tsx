import { HashRouter } from 'react-router-dom';
import { AppProvider } from './AppProvider';
import { AppRouter } from './router';

export function App() {
  return (
    <HashRouter>
      <AppProvider>
        <AppRouter />
      </AppProvider>
    </HashRouter>
  );
}
