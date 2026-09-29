import { LatticeBackground } from './components/LatticeBackground.tsx';

export function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="page">
        <LatticeBackground />
        <main id="main" />
      </div>
    </>
  );
}
