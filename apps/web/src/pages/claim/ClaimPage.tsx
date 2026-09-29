import { useState } from 'react';
import type { Address, PairAsset } from '@dayagpu/shared';
import { encodeAbiParameters, encodeFunctionData } from 'viem';
import { fetchClaims } from '../../api/coordinator.ts';
import type { ClaimView } from '../../api/schemas.ts';
import { usePoll } from '../../api/usePoll.ts';
import { burnPoolAbi, zapTermsAbi } from '../../chain/abi.ts';
import { quoteClaim } from '../../chain/quote.ts';
import { useTransaction } from '../../chain/useTransaction.ts';
import { LoadError } from '../../components/LoadError.tsx';
import { Skeleton } from '../../components/Skeleton.tsx';
import { TxStatus } from '../../components/TxStatus.tsx';
import { DEPLOYMENT, PAIR_LISTING } from '../../config/contracts.ts';
import { ACTIVE_CHAIN } from '../../config/network.ts';
import { formatAmount } from '../../lib/amount.ts';
import { formatDateTime, timeFromNow } from '../../lib/time.ts';
import { useDocumentTitle } from '../../router/useDocumentTitle.ts';
import { useWallet } from '../../wallet/useWallet.ts';
import { WalletPrompt } from '../../wallet/WalletPrompt.tsx';
import { PageHead } from '../PageHead.tsx';
import { ClaimOptions } from './ClaimOptions.tsx';
import { useClaimQuotes } from './useClaimQuotes.ts';
import '../../components/form.css';
import '../../components/panel.css';
import './claim-page.css';

const REFRESH_MS = 30_000;
/** How long a stock claim's swap terms stay valid once sent. */
const DEADLINE_SECONDS = 20 * 60;
const NO_QUOTE = 'A fresh quote could not be read, so nothing was sent. Try again, or claim in ETH.';

function Figures({ claims }: { claims: ClaimView | null }) {
  const eth = (value: bigint | undefined) => (value === undefined ? <Skeleton width="6ch" /> : `${formatAmount(value)} ETH`);
  return (
    <dl className="claim-figures" aria-busy={claims === null}>
      <div className="claim-figures__main">
        <dt>Claimable now</dt>
        <dd>{eth(claims?.claimable)}</dd>
      </div>
      <div>
        <dt>Earned in total</dt>
        <dd>{eth(claims?.cumulative)}</dd>
      </div>
      <div>
        <dt>Already claimed</dt>
        <dd>{eth(claims?.claimed)}</dd>
      </div>
    </dl>
  );
}

function Settlements({ claims }: { claims: ClaimView }) {
  const upcoming = claims.pending && claims.pending.cumulative > claims.cumulative ? claims.pending : null;
  return (
    <div className="claim-notes">
      <p>
        {claims.settlement
          ? `From settlement ${claims.settlement.index}${claims.settlement.claimableAt ? `, claimable since ${formatDateTime(claims.settlement.claimableAt)}` : ''}.`
          : 'No settlement that includes this wallet is claimable yet.'}
      </p>
      {upcoming && (
        <p>
          Settlement {upcoming.index} adds {formatAmount(upcoming.cumulative - claims.cumulative)} ETH
          {upcoming.claimableAt ? `, claimable ${timeFromNow(upcoming.claimableAt)}` : ''}, after its challenge delay.
        </p>
      )}
    </div>
  );
}

export function ClaimPage() {
  useDocumentTitle('Claim');
  const { status, address, isCorrectNetwork, wallet } = useWallet();
  const transaction = useTransaction();
  const [active, setActive] = useState<Address | 'eth' | null>(null);
  const [requoteFailed, setRequoteFailed] = useState(false);
  const connected = status === 'connected' && address !== null;
  const ready = connected && isCorrectNetwork;

  const loadClaims = (signal: AbortSignal) =>
    address ? fetchClaims(address, signal) : Promise.reject(new Error('No wallet is connected.'));
  const claims = usePoll(loadClaims, {
    key: `claims:${address ?? ''}`,
    intervalMs: REFRESH_MS,
    enabled: connected,
  });
  const data = claims.data;
  const claimable = data?.claimable ?? 0n;
  const quotes = useClaimQuotes(ready && wallet ? wallet.provider : null, claimable);
  const busy = ['checking', 'confirming', 'pending'].includes(transaction.state.phase);

  if (!DEPLOYMENT) {
    return (
      <div className="shell">
        <PageHead kicker="Claim" title="Claim your rewards.">
          The Burn Pool is not deployed on {ACTIVE_CHAIN.name} yet, so there is nothing to claim.
        </PageHead>
      </div>
    );
  }
  const { burnPool, pairZap } = DEPLOYMENT;

  const claimEth = () => {
    if (!data?.settlement || !address) return;
    setActive('eth');
    setRequoteFailed(false);
    const call = encodeFunctionData({
      abi: burnPoolAbi,
      functionName: 'claim',
      args: [BigInt(data.settlement.index), address, data.cumulative, data.proof],
    });
    void transaction.send({ to: burnPool, data: call }).then(claims.retry);
  };

  const claimStock = async (asset: PairAsset) => {
    if (!data?.settlement || !wallet || !PAIR_LISTING.quoter) return;
    setActive(asset.address);
    setRequoteFailed(false);
    let minOut: bigint;
    try {
      // The quote shown may be minutes old; the swap's floor comes from a fresh one.
      ({ minOut } = await quoteClaim(wallet.provider, { pairZap, quoter: PAIR_LISTING.quoter }, asset.address, claimable));
    } catch {
      setRequoteFailed(true);
      setActive(null);
      return;
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
    const terms = encodeAbiParameters(zapTermsAbi, [asset.address, minOut, deadline]);
    const call = encodeFunctionData({
      abi: burnPoolAbi,
      functionName: 'claimVia',
      args: [BigInt(data.settlement.index), data.cumulative, data.proof, pairZap, terms],
    });
    await transaction.send({ to: burnPool, data: call });
    claims.retry();
  };

  return (
    <div className="shell">
      <PageHead kicker="Claim" title="Claim your rewards.">
        Rewards become claimable once a settlement that includes your wallet has passed its challenge delay. Take
        them in ETH, or have the ETH swapped into a listed stock token on the way out.
      </PageHead>
      <div className="page-body claim-grid">
        <section className="panel claim-panel" aria-labelledby="claim-balance-title">
          <div className="panel__head">
            <h2 className="panel__title" id="claim-balance-title">
              Your rewards
            </h2>
          </div>
          {!ready ? (
            <WalletPrompt reason="Connect your wallet to see the rewards it has earned." />
          ) : claims.status === 'error' && claims.error ? (
            <LoadError message={claims.error.message} onRetry={claims.retry} />
          ) : (
            <>
              <Figures claims={data} />
              {data && <Settlements claims={data} />}
            </>
          )}
        </section>

        <section className="claim-choose" aria-labelledby="claim-options-title">
          <h2 className="claim-choose__title" id="claim-options-title">
            Choose how to receive them
          </h2>
          <ClaimOptions
            claimable={ready && data ? data.claimable : null}
            walletReady={ready}
            quotes={quotes}
            disabled={!ready || !data?.settlement || busy}
            active={busy ? active : null}
            onClaimEth={claimEth}
            onClaimStock={(asset) => void claimStock(asset)}
          />
          {requoteFailed && (
            <p className="field-status field-status--error" role="alert">
              {NO_QUOTE}
            </p>
          )}
          <TxStatus
            state={transaction.state}
            confirmed={<p>Claimed. The figures update once the network indexes the claim.</p>}
          />
          <div className="claim-notes">
            <p>
              A stock claim fails, and nothing is paid, if the stock token blocks your wallet as a recipient or its
              market is paused. Claiming in ETH always works.
            </p>
            <p className="eligibility">Tokenized stocks are not available to US persons.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
