interface ImportMetaEnv {
  /** `testnet` or `mainnet`. Anything else, or nothing, targets testnet. */
  readonly VITE_NETWORK?: string;
  /** The coordinator's base URL, for example `https://coordinator.example`. */
  readonly VITE_API_BASE?: string;
}
