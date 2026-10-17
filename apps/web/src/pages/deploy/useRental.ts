import { useEffect, useState } from 'react';
import { fetchRental, fetchRentalOffer } from '../../api/coordinator.ts';
import { ApiError } from '../../api/errors.ts';
import type { RentalOffer, RentalView } from '../../api/schemas.ts';

const BUSY_POLL_MS = 5_000;
const RUNNING_POLL_MS = 30_000;
const OFFER_POLL_MS = 60_000;
const STORAGE_KEY = 'minera.rental-id';

const FINAL = new Set(['expired', 'ended', 'failed', 'applied']);

/** The rental this tab follows, kept for the tab's session so a reload picks it up again. */
export function savedRentalId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveRentalId(id: string | null): void {
  try {
    if (id === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // The rental still shows until the reload.
  }
}

/** Follows one rental: often while it is being paid and started, now and then once it runs. */
export function useRental(id: string | null): RentalView | null {
  const [rental, setRental] = useState<RentalView | null>(null);

  useEffect(() => {
    setRental(null);
    if (id === null) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const load = async (): Promise<void> => {
      let next = BUSY_POLL_MS;
      try {
        const view = await fetchRental(id, controller.signal);
        if (!live) return;
        setRental(view);
        if (FINAL.has(view.status)) return;
        if (view.status === 'running') next = RUNNING_POLL_MS;
      } catch {
        if (!live) return;
        next = RUNNING_POLL_MS;
      }
      timer = setTimeout(() => void load(), next);
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [id]);

  return rental?.id === id ? rental : null;
}

export type OfferState = { state: 'loading' } | { state: 'off' } | { state: 'ready'; offer: RentalOffer };

/** The rental price, refreshed every minute; `off` where the network does not rent machines. */
export function useRentalOffer(): OfferState {
  const [offer, setOffer] = useState<OfferState>({ state: 'loading' });

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const load = async (): Promise<void> => {
      try {
        const view = await fetchRentalOffer(controller.signal);
        if (live) setOffer({ state: 'ready', offer: view });
      } catch (cause) {
        if (!live) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setOffer({ state: 'off' });
          return;
        }
      }
      timer = setTimeout(() => void load(), OFFER_POLL_MS);
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return offer;
}
