import { lazy, Suspense } from 'react';
import { Skeleton } from '../components/Skeleton.tsx';
import type { Route } from '../router/routes.ts';
import { HomePage } from './HomePage.tsx';
import { LaunchpadPage } from './launchpad/LaunchpadPage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';
import { PlaygroundPage } from './PlaygroundPage.tsx';
import { RigPage } from './rig/RigPage.tsx';
import './page.css';

// The contract pages carry the encoding and signature code, so they load only when opened.
const DeployPage = lazy(() => import('./deploy/DeployPage.tsx').then((module) => ({ default: module.DeployPage })));
const ClaimPage = lazy(() => import('./claim/ClaimPage.tsx').then((module) => ({ default: module.ClaimPage })));

function PageLoading() {
  return (
    <div className="shell page-loading" aria-busy="true">
      <Skeleton width="min(60%, 520px)" height="3.2em" />
      <Skeleton width="min(80%, 640px)" height="1.2em" />
    </div>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'launchpad':
      return <LaunchpadPage />;
    case 'deploy':
      return <DeployPage />;
    case 'claim':
      return <ClaimPage />;
    case 'playground':
      return <PlaygroundPage />;
    case 'rig':
      return <RigPage key={route.nodeKey} nodeKey={route.nodeKey} />;
    default:
      return <NotFoundPage />;
  }
}

export function RouteView({ route }: { route: Route }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Page route={route} />
    </Suspense>
  );
}
