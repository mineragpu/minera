import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import './button.css';

interface ButtonLook {
  variant: 'primary' | 'ghost';
  size?: 'sm';
  block?: boolean;
  /** The light band that sweeps across on hover and focus. */
  glint?: boolean;
}

function lookClasses(
  variant: ButtonLook['variant'],
  size: ButtonLook['size'] | undefined,
  block: boolean | undefined,
  extra: string | undefined,
): string {
  return ['btn', `btn--${variant}`, size && `btn--${size}`, block && 'btn--block', extra]
    .filter(Boolean)
    .join(' ');
}

export type ButtonProps = ButtonLook & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant,
  size,
  block,
  glint = true,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={lookClasses(variant, size, block, className)} {...rest}>
      {children}
      {glint && <i className="gl" aria-hidden="true" />}
    </button>
  );
}

export type ButtonLinkProps = ButtonLook & AnchorHTMLAttributes<HTMLAnchorElement>;

export function ButtonLink({ variant, size, block, glint = true, className, children, ...rest }: ButtonLinkProps) {
  return (
    <a className={lookClasses(variant, size, block, className)} {...rest}>
      {children}
      {glint && <i className="gl" aria-hidden="true" />}
    </a>
  );
}
