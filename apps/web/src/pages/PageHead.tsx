import type { ReactNode } from 'react';
import { Kicker } from '../components/Kicker.tsx';
import './page.css';

interface PageHeadProps {
  kicker: string;
  title: ReactNode;
  /** The lede under the title. */
  children?: ReactNode;
  /** Sits beside the title, such as a status tag. */
  aside?: ReactNode;
}

/** The top of a routed page. Its heading takes focus after navigation, so it accepts focus. */
export function PageHead({ kicker, title, children, aside }: PageHeadProps) {
  return (
    <header className="page-head">
      <Kicker>{kicker}</Kicker>
      <div className="page-head__title-row">
        <h1 className="page-title" tabIndex={-1}>
          {title}
        </h1>
        {aside}
      </div>
      {children && <p className="lede">{children}</p>}
    </header>
  );
}
