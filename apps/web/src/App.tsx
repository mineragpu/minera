import { LatticeBackground } from './components/LatticeBackground.tsx';
import { SvgDefs } from './components/SvgDefs.tsx';
import { RouteView } from './pages/RouteView.tsx';
import { useLocation } from './router/history.ts';
import { matchRoute } from './router/routes.ts';
import { useLinkInterception } from './router/useLinkInterception.ts';
import { useNavigationEffects } from './router/useNavigationEffects.ts';
import { Footer } from './sections/Footer.tsx';
import { Nav } from './sections/Nav.tsx';
import { ConnectDialogProvider } from './wallet/ConnectDialogProvider.tsx';
import { WalletProvider } from './wallet/WalletProvider.tsx';

export function App() {
  const location = useLocation();
  const route = matchRoute(location.pathname);
  useLinkInterception();
  useNavigationEffects(location);

  return (
    <WalletProvider>
      <ConnectDialogProvider>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SvgDefs />
        <div className="page">
          <LatticeBackground />
          <Nav />
          <main id="main">
            <RouteView route={route} />
          </main>
          <Footer />
        </div>
      </ConnectDialogProvider>
    </WalletProvider>
  );
}
