import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { Hex } from '@minera/shared';
import { ConfigError, loadConfig } from '../config.ts';
import type { RentalRecord } from '../store/records.ts';
import { createMemoryStore } from '../store/memory/index.ts';
import type { Store } from '../store/store.ts';
import {
  ETH_USD_MICROS,
  RENTAL_ENV,
  RENTAL_OPERATOR,
  RENTAL_PAYER,
  fakeWallet,
  quietLog,
  rentalConfig,
  rentalDeps,
} from '../testing/rentals.ts';
import { formatUsd, parseUsdMicros, readEthUsd, rentalUsdMicros, usdToWei } from './price.ts';
import { processRefunds } from './refunds.ts';
import { RentalError } from './service.ts';
import { DOWN_GRACE_MS, LABEL_PREFIX, MAX_LAUNCHES, createRentalWorker, onstartScript } from './worker.ts';

const T0 = new Date('2026-10-17T08:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const DAY_MS = 86_400_000;

/** $0.10 an hour for a day is $2.40, plus $0.05 of transfer, plus 20%: $2.94, or 0.000735 ETH at $4,000. */
const ONE_DAY_WEI = 735_000_000_000_000n;

function setup() {
  const store = createMemoryStore();
  const harness = rentalDeps(store);
  const wallet = fakeWallet();
  const worker = createRentalWorker({ ...harness.deps, service: harness.service, wallet: wallet.wallet });
  return { store, ...harness, wallet, worker };
}

async function paidRental(rig: ReturnType<typeof setup>, units = 1): Promise<RentalRecord> {
  const quote = await rig.service.create({ operator: RENTAL_OPERATOR, units, parentId: null }, T0);
  rig.payments.pay(hash(1), quote.id, quote.priceWei, at(1));
  const paid = await rig.service.pay(quote, hash(1), at(2));
  assert.equal(paid?.status, 'paid');
  return paid;
}

async function get(store: Store, id: string): Promise<RentalRecord> {
  const rental = await store.rentals.get(id);
  assert.ok(rental);
  return rental;
}

describe('rental prices', () => {
  it('prices the hours, the transfer allowance and the margin, rounding up', () => {
    assert.equal(rentalUsdMicros(100_000n, 1, 86_400, 2_000), 2_940_000n);
    assert.equal(rentalUsdMicros(100_000n, 7, 86_400, 2_000), 20_220_000n);
    assert.equal(rentalUsdMicros(100_000n, 1, 3_600, 0), 150_000n);
    assert.equal(usdToWei(2_940_000n, ETH_USD_MICROS), ONE_DAY_WEI);
    assert.equal(usdToWei(1n, 3n), 333_333_333_333_333_334n);
    assert.equal(formatUsd(2_940_000n), '2.94');
    assert.equal(formatUsd(2_940_001n), '2.95');
  });

  it('reads dollar amounts from text or numbers', () => {
    assert.equal(parseUsdMicros('3987.1234567'), 3_987_123_456n);
    assert.equal(parseUsdMicros(4000), 4_000_000_000n);
    assert.equal(parseUsdMicros('-1'), null);
    assert.equal(parseUsdMicros('1e3'), null);
    assert.equal(parseUsdMicros(null), null);
  });

  it('takes the median ETH price, and refuses sources that disagree or are broken', async () => {
    const sources = [
      { url: 'https://a.example', path: 'data.amount' },
      { url: 'https://b.example', path: 'result.0.c' },
      { url: 'https://c.example', path: 'price' },
    ];
    const answers: Record<string, unknown> = {
      'https://a.example': { data: { amount: '4000.00' } },
      'https://b.example': { result: [{ c: '4010' }] },
      'https://c.example': { price: 4005 },
    };
    const fetcher = async (url: string) => answers[url];
    assert.equal(await readEthUsd(sources, fetcher), 4_005_000_000n);
    answers['https://c.example'] = { price: 'oops' };
    assert.equal(await readEthUsd(sources, fetcher), 4_005_000_000n);
    answers['https://b.example'] = { result: [{ c: '4400' }] };
    await assert.rejects(readEthUsd(sources, fetcher), /disagree/);
    await assert.rejects(readEthUsd(sources, async () => ({ data: { amount: '5' } })), /no ETH price/);
  });
});

describe('rental configuration', () => {
  it('stays off unless asked, and needs every setting when on', () => {
    assert.equal(loadConfig({ DATABASE_URL: 'postgres://x@y/z' }).rentals, null);
    const { RENTAL_PAY_TO: _missing, ...partial } = RENTAL_ENV;
    assert.throws(() => loadConfig({ DATABASE_URL: 'postgres://x@y/z', ...partial }), /RENTALS=on needs RENTAL_PAY_TO/);
    const config = rentalConfig();
    assert.equal(config.unitSeconds, 86_400);
    assert.equal(config.marginBps, 2_000);
    assert.equal(config.market.maxUsdPerHourMicros, 250_000n);
  });

  it('allows hourly units on testnet only', () => {
    const base = { DATABASE_URL: 'postgres://x@y/z', ...RENTAL_ENV, RENTAL_UNIT_SECONDS: '3600' };
    assert.equal(loadConfig({ ...base, NETWORK: 'testnet' }).rentals?.unitSeconds, 3_600);
    assert.throws(() => loadConfig({ ...base, NETWORK: 'mainnet' }), ConfigError);
  });
});

describe('rental quotes and payments', () => {
  it('quotes each package in ETH while a machine is on offer', async () => {
    const rig = setup();
    const offer = await rig.service.offer(T0);
    assert.equal(offer.available, true);
    assert.deepEqual(offer.gpu, { model: 'Example GPU', vramMb: 8192 });
    assert.deepEqual(
      offer.packages.map((entry) => [entry.units, entry.usd, entry.wei]),
      [
        [1, '2.94', ONE_DAY_WEI.toString()],
        [7, '20.22', '5055000000000000'],
        [30, '86.46', '21615000000000000'],
      ],
    );
    rig.market.offers.length = 0;
    const none = await rig.service.offer(at(2));
    assert.equal(none.available, false);
    assert.deepEqual(none.packages, []);
  });

  it('refuses a package not on offer and too many open quotes', async () => {
    const rig = setup();
    await assert.rejects(rig.service.create({ operator: RENTAL_OPERATOR, units: 2, parentId: null }, T0), /1, 7, 30/);
    for (let i = 0; i < 3; i += 1) await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    await assert.rejects(
      rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0),
      (error: unknown) => error instanceof RentalError && error.code === 'too_many_quotes',
    );
  });

  it('keeps an unmined payment for the worker, which accepts it once mined and launches a machine', async () => {
    const rig = setup();
    const quote = await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    assert.equal(quote.priceWei, ONE_DAY_WEI);
    rig.payments.pay(hash(1), quote.id, ONE_DAY_WEI, null);
    assert.equal(await rig.service.pay(quote, hash(1), at(1)), null);
    assert.equal((await get(rig.store, quote.id)).payTx, hash(1));

    rig.payments.receipts.set(hash(1), { success: true, at: at(3) });
    await rig.worker.step(at(4));
    const paid = await get(rig.store, quote.id);
    assert.deepEqual([paid.status, paid.payer, paid.paidWei], ['starting', RENTAL_PAYER, ONE_DAY_WEI]);
  });

  it('refunds the excess of an overpayment, and all of a short or late one', async () => {
    const rig = setup();
    const over = await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    rig.payments.pay(hash(1), over.id, ONE_DAY_WEI + 5n, at(1));
    assert.equal((await rig.service.pay(over, hash(1), at(1)))?.status, 'paid');
    assert.deepEqual(
      (await rig.store.rentals.refundsFor(over.id)).map((refund) => [refund.reason, refund.wei]),
      [['excess', 5n]],
    );

    const short = await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    rig.payments.pay(hash(2), short.id, ONE_DAY_WEI - 1n, at(1));
    assert.equal((await rig.service.pay(short, hash(2), at(1)))?.status, 'expired');
    assert.deepEqual(
      (await rig.store.rentals.refundsFor(short.id)).map((refund) => [refund.reason, refund.wei]),
      [['short', ONE_DAY_WEI - 1n]],
    );

    const late = await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    rig.payments.pay(hash(3), late.id, ONE_DAY_WEI, at(26));
    assert.equal((await rig.service.pay(late, hash(3), at(30)))?.status, 'expired');
    assert.equal((await rig.store.rentals.refundsFor(late.id))[0]?.reason, 'late');
  });

  it('refuses a transaction to another address, with other data, or already used', async () => {
    const rig = setup();
    const quote = await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    rig.payments.pay(hash(1), quote.id, ONE_DAY_WEI, at(1), '0x00000000000000000000000000000000000000ee');
    await assert.rejects(rig.service.pay(quote, hash(1), at(1)), /not sent to the rental address/);
    rig.payments.pay(hash(2), 'f'.repeat(32), ONE_DAY_WEI, at(1));
    await assert.rejects(rig.service.pay(quote, hash(2), at(1)), /data is not this rental/);
    rig.payments.pay(hash(3), quote.id, ONE_DAY_WEI, at(1));
    await rig.service.pay(quote, hash(3), at(1));
    const other = await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    await assert.rejects(rig.service.pay(other, hash(3), at(1)), /already paid for another rental/);
  });

  it('lets an unpaid quote expire', async () => {
    const rig = setup();
    const quote = await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    await rig.worker.step(at(20));
    assert.equal((await get(rig.store, quote.id)).status, 'quoted');
    await rig.worker.step(at(26));
    assert.equal((await get(rig.store, quote.id)).status, 'expired');
  });
});

describe('the rental worker', () => {
  it('launches a machine, starts the clock when it pairs, and shuts it down when time is up', async () => {
    const rig = setup();
    const rental = await paidRental(rig);
    await rig.worker.step(at(3));
    const starting = await get(rig.store, rental.id);
    assert.equal(starting.status, 'starting');
    assert.equal(starting.gpu, 'Example GPU');
    const machine = rig.market.launched[0];
    assert.ok(machine);
    assert.equal(machine.label, `${LABEL_PREFIX}${rental.id}`);
    assert.match(machine.onstart, new RegExp(`OPERATOR=${RENTAL_OPERATOR} PAIR=${starting.pairingCode} NETWORK=mainnet bash rig.sh`));

    await rig.store.pairings.put({
      code: starting.pairingCode,
      nodeKey: '0x0000000000000000000000000000000000000f01',
      operator: RENTAL_OPERATOR,
      deployCode: `0x${'11'.repeat(65)}`,
      gpu: null,
      clientVersion: '1.2.0',
      pairedAt: at(10),
      expiresAt: at(400),
    });
    rig.market.machines.set(machine.instanceId, 'running');
    await rig.worker.step(at(11));
    const running = await get(rig.store, rental.id);
    assert.equal(running.status, 'running');
    assert.deepEqual(running.endsAt, new Date(at(11).getTime() + DAY_MS));

    await rig.worker.step(new Date(at(11).getTime() + DAY_MS));
    assert.equal((await get(rig.store, rental.id)).status, 'ended');
    assert.deepEqual(rig.market.destroyed, [machine.instanceId]);
  });

  it('replaces a machine that does not start, and refunds after the last try', async () => {
    const rig = setup();
    const rental = await paidRental(rig);
    let minute = 3;
    for (let launch = 1; launch <= MAX_LAUNCHES; launch += 1) {
      await rig.worker.step(at(minute));
      const machine = rig.market.launched[launch - 1];
      assert.ok(machine);
      rig.market.machines.set(machine.instanceId, 'failed');
      minute += 1;
      await rig.worker.step(at(minute));
      assert.equal((await get(rig.store, rental.id)).status, 'paid');
      minute += 1;
    }
    await rig.worker.step(at(minute));
    const failed = await get(rig.store, rental.id);
    assert.equal(failed.status, 'failed');
    assert.equal(rig.market.destroyed.length, MAX_LAUNCHES);
    assert.deepEqual(
      (await rig.store.rentals.refundsFor(rental.id)).map((refund) => [refund.reason, refund.wei]),
      [['unused', ONE_DAY_WEI]],
    );
  });

  it('refunds the unused time when a running machine stays down', async () => {
    const rig = setup();
    const rental = await paidRental(rig);
    await rig.worker.step(at(3));
    const starting = await get(rig.store, rental.id);
    await rig.store.pairings.put({
      code: starting.pairingCode,
      nodeKey: '0x0000000000000000000000000000000000000f01',
      operator: RENTAL_OPERATOR,
      deployCode: `0x${'11'.repeat(65)}`,
      gpu: null,
      clientVersion: '1.2.0',
      pairedAt: at(4),
      expiresAt: at(400),
    });
    await rig.worker.step(at(4));
    const machine = rig.market.launched[0];
    assert.ok(machine);
    const quarter = DAY_MS / 4 / 60_000;
    rig.market.machines.set(machine.instanceId, 'failed');
    await rig.worker.step(at(4 + quarter));
    assert.equal((await get(rig.store, rental.id)).status, 'running');
    await rig.worker.step(at(4 + quarter + DOWN_GRACE_MS / 60_000));
    assert.equal((await get(rig.store, rental.id)).status, 'failed');
    const [refund] = await rig.store.rentals.refundsFor(rental.id);
    const unused = (ONE_DAY_WEI * BigInt(DAY_MS - DAY_MS / 4 - DOWN_GRACE_MS)) / BigInt(DAY_MS);
    assert.deepEqual([refund?.reason, refund?.wei], ['unused', unused]);
  });

  it('adds a paid extension to a running rental', async () => {
    const rig = setup();
    const rental = await paidRental(rig);
    await rig.worker.step(at(3));
    const starting = await get(rig.store, rental.id);
    await rig.store.pairings.put({
      code: starting.pairingCode,
      nodeKey: '0x0000000000000000000000000000000000000f01',
      operator: RENTAL_OPERATOR,
      deployCode: `0x${'11'.repeat(65)}`,
      gpu: null,
      clientVersion: '1.2.0',
      pairedAt: at(4),
      expiresAt: at(400),
    });
    await rig.worker.step(at(4));
    const endsAt = (await get(rig.store, rental.id)).endsAt;
    assert.ok(endsAt);

    const extension = await rig.service.create({ operator: RENTAL_OPERATOR, units: 7, parentId: rental.id }, at(5));
    rig.payments.pay(hash(9), extension.id, extension.priceWei, at(6));
    await rig.service.pay(extension, hash(9), at(6));
    await rig.worker.step(at(7));
    const extended = await get(rig.store, rental.id);
    assert.equal(extended.units, 8);
    assert.deepEqual(extended.endsAt, new Date(endsAt.getTime() + 7 * DAY_MS));
    assert.equal((await get(rig.store, extension.id)).status, 'applied');
  });

  it('destroys machines no rental holds', async () => {
    const rig = setup();
    const rental = await paidRental(rig);
    await rig.worker.step(at(3));
    const kept = rig.market.launched[0];
    assert.ok(kept);
    const stray = await rig.market.market.launch({ offerId: '101', label: `${LABEL_PREFIX}${'e'.repeat(32)}`, onstart: '' });
    await rig.worker.step(at(14));
    assert.deepEqual(rig.market.destroyed, [stray]);
    assert.equal((await get(rig.store, rental.id)).status, 'starting');
  });
});

describe('rental refunds', () => {
  it('signs and saves a refund before sending it, then confirms it', async () => {
    const rig = setup();
    const quote = await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    rig.payments.pay(hash(1), quote.id, ONE_DAY_WEI + 7n, at(1));
    await rig.service.pay(quote, hash(1), at(1));

    await processRefunds(rig.store, rig.wallet.wallet, at(2), quietLog);
    const [sent] = await rig.store.rentals.refundsFor(quote.id);
    assert.equal(sent?.status, 'sent');
    assert.equal(rig.wallet.sent.length, 1);

    await processRefunds(rig.store, rig.wallet.wallet, at(3), quietLog);
    assert.equal(rig.wallet.sent.length, 2, 'an unmined refund is sent again, as the same transaction');
    assert.equal(rig.wallet.sent[0], rig.wallet.sent[1]);

    assert.ok(sent?.txHash);
    rig.wallet.outcomes.set(sent.txHash, true);
    await processRefunds(rig.store, rig.wallet.wallet, at(4), quietLog);
    assert.equal((await rig.store.rentals.refundsFor(quote.id))[0]?.status, 'done');
  });

  it('waits when the refund wallet is too low', async () => {
    const rig = setup();
    const quote = await rig.service.create({ operator: RENTAL_OPERATOR, units: 1, parentId: null }, T0);
    rig.payments.pay(hash(1), quote.id, ONE_DAY_WEI + 7n, at(1));
    await rig.service.pay(quote, hash(1), at(1));
    rig.wallet.state.balance = 0n;
    await processRefunds(rig.store, rig.wallet.wallet, at(2), quietLog);
    assert.equal((await rig.store.rentals.refundsFor(quote.id))[0]?.status, 'pending');
    assert.equal(rig.wallet.sent.length, 0);
  });
});

describe('the onstart script', () => {
  it('runs the rig script with the rental operator, pairing code and network', () => {
    const script = onstartScript({ id: 'a'.repeat(32), operator: RENTAL_OPERATOR, pairingCode: 'b'.repeat(32) }, 'testnet');
    assert.match(script, /^#!\/bin\/bash\n/);
    assert.match(script, /curl -fsSL https:\/\/mineragpu\.tech\/rig\.sh -o rig\.sh/);
    assert.match(script, new RegExp(`OPERATOR=${RENTAL_OPERATOR} PAIR=${'b'.repeat(32)} NETWORK=testnet bash rig.sh`));
    assert.ok(script.length < 4_000);
  });
});
