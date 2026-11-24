import type { NetworkId, NetworkPreset } from './types';

export const NETWORK_PRESETS: Record<NetworkId, NetworkPreset> = {
  mainnet: {
    id: 'mainnet',
    label: 'XRPL Mainnet',
    badge: 'MAINNET',
    endpoints: [
      'wss://xrplcluster.com/',
      'wss://s1.ripple.com/',
      'wss://s2.ripple.com/',
    ],
    explorerUrl: 'https://livenet.xrpl.org',
    vhsBaseUrl: 'https://data.xrplf.org/v1/network',
    tokenMetaUrl: 'https://s1.xrplmeta.org',
  },
  testnet: {
    id: 'testnet',
    label: 'XRPL Testnet',
    badge: 'TESTNET',
    endpoints: [
      'wss://s.altnet.rippletest.net:51233/',
      'wss://testnet.xrpl-labs.com/',
    ],
    explorerUrl: 'https://testnet.xrpl.org',
    vhsBaseUrl: 'https://data.xrplf.org/v1/network',
  },
  devnet: {
    id: 'devnet',
    label: 'XRPL Devnet',
    badge: 'DEVNET',
    endpoints: ['wss://s.devnet.rippletest.net:51233/'],
    explorerUrl: 'https://devnet.xrpl.org',
  },
  custom: {
    id: 'custom',
    label: 'Custom / Local Node',
    badge: 'CUSTOM',
    endpoints: ['ws://127.0.0.1:6006/'],
    explorerUrl: 'https://livenet.xrpl.org',
  },
};

export const TX_CATEGORY_META = {
  payment: { label: 'XRP Payment', color: '#22d3ee', lane: 0 },
  token: { label: 'IOU / Token', color: '#34d399', lane: 1 },
  dex: { label: 'DEX Orderbook', color: '#fbbf24', lane: 2 },
  amm: { label: 'AMM Pool', color: '#a78bfa', lane: 3 },
  nft: { label: 'NFToken', color: '#f472b6', lane: 4 },
  mpt: { label: 'MPToken', color: '#2dd4bf', lane: 1 },
  trust: { label: 'TrustLine', color: '#60a5fa', lane: 5 },
  escrow: { label: 'Escrow / Check', color: '#fb923c', lane: 5 },
  system: { label: 'Account / Gov', color: '#94a3b8', lane: 5 },
} as const;
