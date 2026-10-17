import { useEffect, useState } from 'react';
import { RENTAL_PACKAGES, type Address } from '@minera/shared';
import { createRental, fetchRentals, submitRentalPayment } from '../../api/coordinator.ts';
import type { RentalOffer, RentalView } from '../../api/schemas.ts';
import type { Transaction } from '../../chain/useTransaction.ts';
import { Button } from '../../components/Button.tsx';
import { RadioChip } from '../../components/RadioChip.tsx';
import { TxStatus } from '../../components/TxStatus.tsx';
import { formatAmount } from '../../lib/amount.ts';
import { txUrl } from '../../lib/explorer.ts';
import { PATHS } from '../../router/routes.ts';

interface RentPanelProps {
  operator: Address | null;
  offer: RentalOffer;
  rental: RentalView | null;
  /** Follows a rental: a new quote, or one picked from the list. */
  onRental: (id: string | null) => void;
  payment: Transaction;
}

function unitName(units: number, unitSeconds: number): string {
  const unit = unitSeconds === 3_600 ? 'hour' : 'day';
  return `${units} ${unit}${units === 1 ? '' : 's'}`;
}

function timeLeft(endsAt: Date, now: number): string {
  const minutes = Math.max(0, Math.round((endsAt.getTime() - now) / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ${hours} h left`;
  if (hours > 0) return `${hours} h ${minutes % 60} min left`;
  return `${minutes} min left`;
}

const STATUS_TEXT: Record<RentalView['status'], string> = {
  quoted: 'Waiting for the payment',
  expired: 'Not paid in time',
  paid: 'Paid. Finding a machine',
  starting: 'Machine starting',
  running: 'Running',
  ended: 'Ended',
  failed: 'Stopped and refunded',
  applied: 'Added to the rental',
};

function RentalStatus({ rental }: { rental: RentalView }) {
  const now = Date.now();
  return (
    <div className={`rental rental--${rental.status}`} role="status">
      <p className="rental__title">
        {STATUS_TEXT[rental.status]}
        {rental.gpu && <span className="rental__gpu"> · {rental.gpu}</span>}
      </p>
      {rental.note && <p className="rental__text">{rental.note}</p>}
      {rental.status === 'running' && rental.endsAt && <p className="rental__text">{timeLeft(rental.endsAt, now)}.</p>}
      {rental.refunds.map((refund) => (
        <p className="rental__text" key={refund.reason}>
          Refund of {formatAmount(refund.wei)} ETH:{' '}
          {refund.status === 'done' ? 'sent' : refund.status === 'sent' ? 'on its way' : 'queued'}
          {refund.txHash && (
            <>
              {' '}
              <a className="text-link" href={txUrl(refund.txHash)} target="_blank" rel="noreferrer">
                transaction
              </a>
            </>
          )}
          .
        </p>
      ))}
    </div>
  );
}

/**
 * Renting a GPU machine on the Deploy page: pick a package, pay in ETH from the operator wallet,
 * and the machine is started for you and pairs with this page on its own.
 */
export function RentPanel({ operator, offer, rental, onRental, payment }: RentPanelProps) {
  const [units, setUnits] = useState<number>(RENTAL_PACKAGES[0]);
  const [problem, setProblem] = useState<string | null>(null);
  const [rentals, setRentals] = useState<RentalView[]>([]);
  const pending = payment.state.phase === 'pending' ? payment.state.hash : null;
  const confirmed = payment.state.phase === 'confirmed' ? payment.state.hash : null;
  const paying = ['checking', 'confirming', 'pending'].includes(payment.state.phase);

  // The hash goes to the network as soon as the wallet has sent the payment, so closing the page
  // early loses nothing; once mined, it is sent again to settle at once.
  useEffect(() => {
    const hash = pending ?? confirmed;
    if (!rental || hash === null || rental.status !== 'quoted') return;
    submitRentalPayment(rental.id, hash).catch((cause: unknown) => {
      setProblem(cause instanceof Error ? cause.message : 'The payment could not be checked yet.');
    });
  }, [rental, pending, confirmed]);

  useEffect(() => {
    if (!operator) return;
    const controller = new AbortController();
    fetchRentals(operator, controller.signal).then(setRentals, () => undefined);
    return () => controller.abort();
  }, [operator, rental?.status]);

  const chosen = offer.packages.find((entry) => entry.units === units) ?? offer.packages[0];
  const active = rentals.filter((entry) => entry.parentId === null && ['paid', 'starting', 'running'].includes(entry.status));

  async function pay(parentId?: string) {
    if (!operator || !chosen) return;
    setProblem(null);
    try {
      const quote = await createRental(operator, chosen.units, parentId);
      if (!quote.payment) throw new Error('The quote has no payment details.');
      onRental(quote.id);
      payment.reset();
      await payment.send({ to: quote.payment.to, data: quote.payment.data, value: quote.payment.value });
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'The quote could not be made.');
    }
  }

  return (
    <div className="rent">
      <p className="flow-step__text">
        We rent a GPU machine for you, set it up and pair it with this page. You pay once, in ETH, from the operator
        wallet. When the time is up, the machine is shut down.
      </p>
      {!offer.available || !chosen ? (
        <p className="rent__off">{offer.reason ?? 'No machine is on offer right now. Try again later.'}</p>
      ) : (
        <>
          {offer.gpu && (
            <p className="rent__machine">
              Machine on offer: <b>{offer.gpu.model}</b>, {Math.round(offer.gpu.vramMb / 1024)} GB
            </p>
          )}
          <fieldset className="fieldset" disabled={paying}>
            <legend className="flabel">Rent it for</legend>
            <div className="chips">
              {offer.packages.map((entry) => (
                <RadioChip
                  key={entry.units}
                  id={`rent-${entry.units}`}
                  name="rent-package"
                  value={String(entry.units)}
                  checked={entry.units === chosen.units}
                  onSelect={(value) => setUnits(Number(value))}
                >
                  {unitName(entry.units, offer.unitSeconds)} · {formatAmount(entry.wei)} ETH
                </RadioChip>
              ))}
            </div>
          </fieldset>
          <p className="rent__price">
            {formatAmount(chosen.wei)} ETH, about ${chosen.usd}, at ${offer.ethUsd} per ETH. The price holds for{' '}
            {Math.round(offer.quoteSeconds / 60)} minutes after you press Pay.
          </p>
          <p className="rent__notice">
            Renting costs this whether or not the rig earns. Check what rigs earn on the{' '}
            <a className="text-link" href={PATHS.rewards}>
              Rewards page
            </a>{' '}
            before you rent. If the machine does not start, or stops early, the unused part is refunded to the paying
            wallet automatically.
          </p>
          <Button
            variant="primary"
            block
            disabled={!operator || paying}
            aria-busy={paying}
            onClick={() => void pay()}
          >
            {operator ? `Pay ${formatAmount(chosen.wei)} ETH` : 'Connect your wallet first'}
          </Button>
        </>
      )}
      <TxStatus state={payment.state} />
      {problem && <p className="field-status field-status--error">{problem}</p>}
      {rental && <RentalStatus rental={rental} />}
      {active.length > 0 && (
        <div className="rent__list">
          <p className="flabel">Your rentals</p>
          <ul>
            {active.map((entry) => (
              <li key={entry.id}>
                <button type="button" className="text-link" onClick={() => onRental(entry.id)}>
                  {entry.gpu ?? 'Machine'}, {STATUS_TEXT[entry.status].toLowerCase()}
                  {entry.endsAt ? `, ${timeLeft(entry.endsAt, Date.now())}` : ''}
                </button>
                {entry.status === 'running' && chosen && offer.available && (
                  <button type="button" className="text-link rent__extend" disabled={paying} onClick={() => void pay(entry.id)}>
                    Extend by {unitName(chosen.units, offer.unitSeconds)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
