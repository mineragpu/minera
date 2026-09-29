import { LatticeBackground } from './components/LatticeBackground.tsx';
import { SvgDefs } from './components/SvgDefs.tsx';
import { Nav } from './sections/Nav.tsx';

export function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <SvgDefs />
      <div className="page">
        <LatticeBackground />
        <Nav />
        <main id="main" />
      </div>
    </>
  );
}
