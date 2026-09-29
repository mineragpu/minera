import { NAME_MAX_BYTES, nameBytes } from './validation.ts';

interface NameStepProps {
  value: string;
  onChange: (value: string) => void;
  locked: boolean;
}

export function NameStep({ value, onChange, locked }: NameStepProps) {
  const bytes = nameBytes(value);
  const tooLong = bytes > NAME_MAX_BYTES;
  return (
    <div className="field">
      <label className="flabel" htmlFor="rig-name">
        Rig name
      </label>
      <input
        className="input"
        id="rig-name"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        disabled={locked}
        aria-invalid={tooLong}
        aria-describedby="rig-name-hint rig-name-count"
      />
      <p className="hint" id="rig-name-hint">
        Shown on the launchpad board. It cannot be changed after deploying.
      </p>
      <p className={tooLong ? 'field-status field-status--error' : 'hint'} id="rig-name-count">
        {bytes} of {NAME_MAX_BYTES} bytes{tooLong ? '. Shorten the name to deploy.' : ''}
      </p>
    </div>
  );
}
