import type { ReactNode } from 'react';
import { BRAND } from '@dayagpu/shared';
import { Kicker } from '../components/Kicker.tsx';
import { PATHS, sectionPath } from '../router/routes.ts';
import './faq.css';

interface Question {
  question: string;
  answer: ReactNode;
}

const QUESTIONS: readonly Question[] = [
  {
    question: 'Do I need a GPU?',
    answer: (
      <>
        <p>
          To mine, yes: a machine with a GPU and its driver, Node.js 22.18 or later, and a local model runtime with at
          least one model downloaded.
        </p>
        <p>
          To try the network, no. The{' '}
          <a className="text-link" href={PATHS.playground}>
            playground
          </a>{' '}
          works in any browser, with no wallet.
        </p>
      </>
    ),
  },
  {
    question: 'What do I earn?',
    answer: (
      <>
        <p>
          A share of each settlement. Its budget is what the pool’s release limit allows since the last settlement, and
          it is split between operators by the verified work units their rigs earned.
        </p>
        <p>
          Rewards are committed in ETH, and you can claim them as ETH or as a listed stock token. On testnet they are
          test ETH, which has no value. No rate is promised.
        </p>
      </>
    ),
  },
  {
    question: 'Why has nothing settled for me yet?',
    answer: (
      <>
        <p>
          Most often, the work was not verified. An answer counts only when a rig run by a different operator returns
          the same output, so while no other operator’s rig is online, answers stay unverified and earn nothing.
        </p>
        <p>
          Otherwise it is timing. A settlement is built after each epoch ends, only once the previous one has passed its
          challenge delay, and it becomes claimable after its own.
        </p>
      </>
    ),
  },
  {
    question: 'What is the Burn Pool?',
    answer: (
      <p>
        The contract that pays rewards. Anyone can deposit ETH into it, and each campaign announces the share the
        project deposits. Deposits are one-way: they stay in the pool until they leave as rewards for verified work.
        Burn means one-way here; nothing is destroyed.
      </p>
    ),
  },
  {
    question: 'Can anyone withdraw it?',
    answer: (
      <p>
        No. The contract has no withdraw, sweep or owner function and no upgrade path. ETH leaves only through claims
        against published settlements, and each settlement is capped by the release limit. The guardian can veto a
        settlement during its challenge delay, but it cannot move funds.
      </p>
    ),
  },
  {
    question: 'What does pairing with a stock do?',
    answer: (
      <>
        <p>
          A rig’s pair records, on the rig registry, the asset you want its rewards in. Rewards are always committed in
          ETH. When you claim, you take ETH, or have the pair zap swap it into a listed stock token and deliver that to
          your wallet, at no less than the minimum your claim sets.
        </p>
        <p>Tokenized stocks are not available to US persons.</p>
      </>
    ),
  },
  {
    question: 'What if my wallet is blocked?',
    answer: (
      <p>
        A stock token’s issuer can block wallets and pause its market. The pair zap checks both before it swaps, so a
        claim to a blocked wallet fails and your rewards stay claimable. Claiming in ETH always works.
      </p>
    ),
  },
  {
    question: 'Is this mainnet?',
    answer: (
      <p>
        No. Everything runs on testnet today, and test ETH has no value. Mainnet is planned. When the network moves
        there it gets new contracts, and testnet balances stay on testnet.
      </p>
    ),
  },
  {
    question: 'Is there a token yet?',
    answer: (
      <p>
        No. A token is planned, and its contract address will be published on this site. Until then, any token presented
        as {BRAND.name}’s is not ours.
      </p>
    ),
  },
  {
    question: 'Is it audited?',
    answer: (
      <p>
        Not yet. The contracts have not had an external audit. Their source is verified as an exact match for the
        deployed code, and what they enforce and what depends on trust is listed under{' '}
        <a className="text-link" href={sectionPath('security')}>
          security and trust
        </a>
        .
      </p>
    ),
  },
];

function PlusMark() {
  return (
    <svg className="faq__mark" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Faq({ index }: { index: string }) {
  return (
    <section className="section shell" id="faq" aria-labelledby="faq-title">
      <div className="faq">
        <div className="faq__head">
          <Kicker index={index}>FAQ</Kicker>
          <h2 className="h2" id="faq-title">
            Questions, answered plainly.
          </h2>
          <p className="lede">If an answer here and the contracts ever disagree, the contracts are right.</p>
        </div>
        <div className="faq__list">
          {QUESTIONS.map(({ question, answer }) => (
            <details key={question} className="faq__item">
              <summary>
                <h3 className="faq__question">{question}</h3>
                <PlusMark />
              </summary>
              <div className="faq__answer">{answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
