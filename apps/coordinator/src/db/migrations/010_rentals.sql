-- GPU machines rented from the Deploy page. A rental is quoted, paid in ETH with its id as the
-- transaction's data, launched on a GPU marketplace, paired with the Deploy page, and destroyed
-- when its time ends. A unit is a day, except on a test network. An extension is a rental row of its
-- own that adds units to its parent.
CREATE TABLE rentals (
  id                  text PRIMARY KEY,
  parent_id           text REFERENCES rentals (id),
  operator            text NOT NULL,
  units               integer NOT NULL,
  price_wei           numeric(78, 0) NOT NULL,
  usd_micros          bigint NOT NULL,
  eth_usd_micros      bigint NOT NULL,
  quote_expires_at    timestamptz NOT NULL,
  status              text NOT NULL,
  pay_tx              text UNIQUE,
  payer               text,
  paid_wei            numeric(78, 0),
  paid_at             timestamptz,
  instance_id         text,
  gpu                 text,
  usd_per_hour_micros bigint,
  launched_at         timestamptz,
  attempts            integer NOT NULL DEFAULT 0,
  pairing_code        text NOT NULL,
  started_at          timestamptz,
  ends_at             timestamptz,
  note                text,
  created_at          timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL
);

CREATE INDEX rentals_operator_idx ON rentals (operator, created_at DESC);
CREATE INDEX rentals_status_idx ON rentals (status);

-- ETH sent back to a payer: the excess of an overpayment, a late or short payment, or the unused
-- time of a rental whose machine failed. The signed transaction is kept before it is broadcast, so
-- a restart sends the same transaction again instead of a second refund.
CREATE TABLE rental_refunds (
  id         text PRIMARY KEY,
  rental_id  text NOT NULL REFERENCES rentals (id),
  recipient  text NOT NULL,
  wei        numeric(78, 0) NOT NULL,
  reason     text NOT NULL,
  raw_tx     text,
  tx_hash    text,
  status     text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX rental_refunds_status_idx ON rental_refunds (status);
CREATE INDEX rental_refunds_rental_idx ON rental_refunds (rental_id);
