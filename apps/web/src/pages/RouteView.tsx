import type { Route } from '../router/routes.ts';
import { HomePage } from './HomePage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomePage />;
    default:
      return <NotFoundPage />;
  }
}
