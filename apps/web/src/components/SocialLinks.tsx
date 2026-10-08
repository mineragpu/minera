import { BRAND } from '@minera/shared';
import { GitHubIcon, TelegramIcon, XIcon } from './icons.tsx';
import './social-links.css';

const LINKS = [
  { label: 'X', href: BRAND.links.x, Icon: XIcon },
  { label: 'Telegram', href: BRAND.links.telegram, Icon: TelegramIcon },
  { label: 'GitHub', href: BRAND.links.github, Icon: GitHubIcon },
] as const;

/** The project's community links as icon buttons, each named for screen readers. */
export function SocialLinks({ className }: { className?: string }) {
  return (
    <ul className={`social${className ? ` ${className}` : ''}`} aria-label="Community">
      {LINKS.map(({ label, href, Icon }) => (
        <li key={label}>
          <a href={href} target="_blank" rel="noreferrer" aria-label={`${BRAND.name} on ${label}`} title={label}>
            <Icon />
          </a>
        </li>
      ))}
    </ul>
  );
}
