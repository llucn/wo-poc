import { StrictMode } from 'react';
import { AuthProvider } from 'react-oidc-context';
import { HashRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { oidcConfig } from './app/auth/oidc-config';
import { ThemeProvider } from './app/shell/theme-context';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <ThemeProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
);
