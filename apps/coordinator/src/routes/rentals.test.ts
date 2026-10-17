import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { RENTAL_ROUTES, type Hex } from '@minera/shared';
import { createTestApp, type TestApp } from '../testing/testApp.ts';
import { RENTAL_ENV, RENTAL_OPERATOR, RENTAL_PAY_TO, rentalDeps } from '../testing/rentals.ts';

let harness: TestApp | null = null;

afterEach(async () => {
  await harness?.app.close();
  harness = null;
});

async function rentingApp() {
  let payments: ReturnType<typeof rentalDeps>['payments'] | null = null;
  harness = await createTestApp(RENTAL_ENV, {
    rentals: (store) => {
      const built = rentalDeps(store);
      payments = built.payments;
      return built.service;
    },
  });
  assert.ok(payments);
  return { app: harness.app, payments: payments as ReturnType<typeof rentalDeps>['payments'] };
}

describe('rental routes', () => {
  it('answers rentals_off where machines are not rented', async () => {
    const plain = await createTestApp();
    harness = plain;
    for (const url of [RENTAL_ROUTES.offer, RENTAL_ROUTES.view('a'.repeat(32)), RENTAL_ROUTES.list(RENTAL_OPERATOR)]) {
      const response = await plain.app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 404, url);
      assert.equal(response.json().error.code, 'rentals_off');
    }
  });

  it('quotes, takes a payment and shows the rental to its operator', async () => {
    const { app, payments } = await rentingApp();
    const offer = (await app.inject({ method: 'GET', url: RENTAL_ROUTES.offer })).json();
    assert.equal(offer.available, true);
    assert.equal(offer.payTo, RENTAL_PAY_TO);

    const created = await app.inject({ method: 'POST', url: RENTAL_ROUTES.create, payload: { operator: RENTAL_OPERATOR, units: 1 } });
    assert.equal(created.statusCode, 201);
    const rental = created.json();
    assert.equal(rental.status, 'quoted');
    assert.deepEqual(rental.payment.to, RENTAL_PAY_TO);
    assert.equal(rental.payment.data, `0x${rental.id}`);
    assert.equal(rental.pairingCode, null);

    const txHash = `0x${'ab'.repeat(32)}` as Hex;
    payments.pay(txHash, rental.id, BigInt(rental.priceWei), null);
    const pending = await app.inject({ method: 'POST', url: RENTAL_ROUTES.payment(rental.id), payload: { txHash } });
    assert.equal(pending.statusCode, 202);
    assert.equal(pending.json().payTx, txHash);

    payments.receipts.set(txHash, { success: true, at: harness?.clock.now ?? new Date() });
    const paid = await app.inject({ method: 'POST', url: RENTAL_ROUTES.payment(rental.id), payload: { txHash } });
    assert.equal(paid.statusCode, 200);
    assert.equal(paid.json().status, 'paid');
    assert.equal(paid.json().payment, null);

    const list = (await app.inject({ method: 'GET', url: RENTAL_ROUTES.list(RENTAL_OPERATOR) })).json();
    assert.deepEqual(list.rentals.map((entry: { id: string }) => entry.id), [rental.id]);
  });

  it('validates the requests', async () => {
    const { app } = await rentingApp();
    const bad = [
      { operator: '0x12', units: 1 },
      { operator: RENTAL_OPERATOR, units: 0 },
      { operator: RENTAL_OPERATOR, units: 1, extra: true },
    ];
    for (const payload of bad) {
      const response = await app.inject({ method: 'POST', url: RENTAL_ROUTES.create, payload });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
    }
    const odd = await app.inject({ method: 'POST', url: RENTAL_ROUTES.create, payload: { operator: RENTAL_OPERATOR, units: 2 } });
    assert.equal(odd.json().error.code, 'invalid_package');
    assert.equal((await app.inject({ method: 'GET', url: RENTAL_ROUTES.view('nope') })).statusCode, 400);
    assert.equal((await app.inject({ method: 'GET', url: RENTAL_ROUTES.view('0'.repeat(32)) })).statusCode, 404);
    const payment = await app.inject({ method: 'POST', url: RENTAL_ROUTES.payment('0'.repeat(32)), payload: { txHash: '0x12' } });
    assert.equal(payment.statusCode, 400);
  });
});
