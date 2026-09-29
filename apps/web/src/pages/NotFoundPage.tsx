import { ButtonLink } from '../components/Button.tsx';
import { PATHS } from '../router/routes.ts';
import { useDocumentTitle } from '../router/useDocumentTitle.ts';
import { PageHead } from './PageHead.tsx';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="shell">
      <PageHead kicker="Not found" title="There is no page at this address.">
        The link may be mistyped, or the page may have moved.
      </PageHead>
      <div className="page-actions">
        <ButtonLink variant="primary" href={PATHS.home}>
          Go to the home page
        </ButtonLink>
      </div>
    </div>
  );
}
