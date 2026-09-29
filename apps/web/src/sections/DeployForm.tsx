import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../components/Button.tsx';
import { LiveDot } from '../components/LiveDot.tsx';
import { PreviewTag } from '../components/PreviewTag.tsx';
import { RadioChip } from '../components/RadioChip.tsx';
import { Ticker } from '../components/Ticker.tsx';
import { ChevronDownIcon } from '../components/icons.tsx';
import { PREVIEW_CAMPAIGN, PREVIEW_DEPLOY, type Pair } from '../data/preview.ts';
import { useReducedMotion } from '../motion/useReducedMotion.ts';

const PAIR_LABELS: Readonly<Record<Pair, string>> = {
  eth: 'ETH',
  stock: 'Tokenized stock',
};

function HardwareGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <g stroke="#6B768A" strokeWidth="1.6" strokeLinecap="round">
        <path d="M17 4v6M24 4v6M31 4v6M17 38v6M24 38v6M31 38v6M4 17h6M4 24h6M4 31h6M38 17h6M38 24h6M38 31h6" />
      </g>
      <rect x="10" y="10" width="28" height="28" rx="2" fill="#1A202C" stroke="url(#g-iri)" strokeWidth="1.6" />
      <rect x="17" y="17" width="14" height="14" fill="url(#g-iri)" opacity=".85" />
    </svg>
  );
}

export function DeployForm() {
  const reduced = useReducedMotion();
  const formRef = useRef<HTMLFormElement>(null);
  const [rigName, setRigName] = useState<string>(PREVIEW_DEPLOY.rigName);
  const [pair, setPair] = useState<Pair>('eth');
  const [bond, setBond] = useState<string>(PREVIEW_DEPLOY.bond);
  const [note, setNote] = useState('Preview only. Nothing is sent.');

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = rigName.trim() || 'This rig';
    setNote(`Preview only. ${name} was not deployed.`);
    const form = formRef.current;
    if (form && !reduced) {
      const easing = getComputedStyle(form).getPropertyValue('--ease-out').trim() || 'ease-out';
      form.animate([{ opacity: 0.75 }, { opacity: 1 }], { duration: 900, easing });
    }
  };

  return (
    <form className="panel" ref={formRef} aria-labelledby="panel-title" noValidate onSubmit={onSubmit}>
      <div className="panel__head">
        <h3 className="panel__title" id="panel-title">
          New rig
        </h3>
        <span className="status">Draft</span>
        <PreviewTag />
      </div>

      <div className="hw">
        <HardwareGlyph />
        <div>
          <span className="flabel">Detected hardware</span>
          <p className="hw__value">
            <span className="nw">{PREVIEW_DEPLOY.vramGb} GB VRAM</span> ·{' '}
            <span className="nw">{PREVIEW_DEPLOY.fp16Tflops} TFLOPS FP16</span>
          </p>
          <p className="hw__meta">
            <LiveDot />
            Read by the node client
          </p>
        </div>
        <span className="hw__scan" aria-hidden="true" />
      </div>

      <div className="form">
        <div className="field">
          <label className="flabel" htmlFor="rig-name">
            Rig name
          </label>
          <input
            className="input"
            id="rig-name"
            name="rig-name"
            type="text"
            value={rigName}
            onChange={(event) => setRigName(event.target.value)}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="rig-name-hint"
          />
          <p className="hint" id="rig-name-hint">
            Shown on the launchpad board.
          </p>
        </div>

        <fieldset className="fieldset">
          <legend className="flabel">Pair with</legend>
          <div className="chips">
            <RadioChip id="pair-eth" name="pair" value="eth" checked={pair === 'eth'} onSelect={setPair} describedBy="pair-hint">
              {PAIR_LABELS.eth}
            </RadioChip>
            <RadioChip
              id="pair-stock"
              name="pair"
              value="stock"
              checked={pair === 'stock'}
              onSelect={setPair}
              describedBy="pair-hint"
            >
              {PAIR_LABELS.stock}
              <ChevronDownIcon />
            </RadioChip>
          </div>
          <p className="hint" id="pair-hint">
            Any stock token listed on the network
          </p>
        </fieldset>

        <div className="field">
          <label className="flabel" htmlFor="bond-amount">
            Bond amount
          </label>
          <div className="affix">
            <input
              className="input"
              id="bond-amount"
              name="bond-amount"
              type="text"
              inputMode="decimal"
              value={bond}
              onChange={(event) => setBond(event.target.value)}
              autoComplete="off"
              aria-describedby="bond-hint"
            />
            <span className="affix__unit">
              <Ticker />
            </span>
          </div>
          <p className="hint" id="bond-hint">
            Bonded to the rig while it mines.
          </p>
        </div>

        <dl className="summary">
          <div>
            <dt>Rewards paid in</dt>
            <dd>{PAIR_LABELS[pair]}</dd>
          </div>
          <div>
            <dt>Work</dt>
            <dd>Verified AI inference</dd>
          </div>
          <div>
            <dt>Campaign</dt>
            <dd>
              {PREVIEW_CAMPAIGN.number} · {PREVIEW_CAMPAIGN.name}
            </dd>
          </div>
        </dl>

        <div>
          <Button variant="primary" block type="submit">
            Deploy
          </Button>
          <p className="panel__note" role="status">
            {note}
          </p>
        </div>
      </div>
    </form>
  );
}
