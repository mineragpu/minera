import { Button } from './Button.tsx';
import './load-error.css';

interface LoadErrorProps {
  message: string;
  onRetry: () => void;
}

/** One plain sentence about what failed, and a way to try again. */
export function LoadError({ message, onRetry }: LoadErrorProps) {
  return (
    <div className="load-error" role="status">
      <p>{message}</p>
      <Button variant="ghost" size="sm" glint={false} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
