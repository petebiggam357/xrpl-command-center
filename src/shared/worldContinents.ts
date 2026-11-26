import type { TopologyNode, ValidatorRecord } from './types';

export interface ContinentPolygon {
  name: string;
  /** Array of [longitude, latitude] pairs in degrees */
  coords: Array<[number, number]>;
}

/**
 * Simplified, geographically accurate continental & major island outlines
 * in [longitude, latitude] degrees for offline equirectangular globe rendering.
 */
export const WORLD_CONTINENT_POLYGONS: ContinentPolygon[] = [
  {
    name: 'North America',
    coords: [
      [-168, 66], [-162, 70], [-156, 71], [-141, 70], [-130, 70], [-122, 69],
      [-110, 68], [-95, 69], [-82, 66], [-78, 62], [-80, 56], [-78, 52],
      [-68, 59], [-64, 60], [-56, 52], [-53, 47], [-60, 46], [-66, 44],
      [-70, 42], [-74, 40], [-76, 35], [-81, 31], [-80, 25], [-82, 25],
      [-83, 29], [-89, 30], [-95, 29], [-97, 26], [-97, 22], [-95, 18],
      [-90, 21], [-87, 21], [-88, 16], [-83, 15], [-83, 10], [-79, 9],
      [-77, 8], [-80, 7], [-84, 9], [-88, 13], [-93, 15], [-100, 17],
      [-105, 20], [-109, 25], [-112, 29], [-115, 31], [-110, 23], [-114, 27],
      [-117, 32], [-121, 35], [-124, 40], [-124, 48], [-128, 51], [-133, 55],
      [-138, 59], [-147, 61], [-152, 58], [-160, 56], [-166, 60], [-165, 64],
    ],
  },
  {
    name: 'Greenland',
    coords: [
      [-52, 60], [-44, 60], [-36, 65], [-24, 70], [-18, 76], [-20, 82],
      [-36, 83], [-52, 82], [-66, 78], [-60, 74], [-54, 68], [-52, 63],
    ],
  },
  {
    name: 'Cuba',
    coords: [
      [-85, 22], [-82, 23], [-78, 22], [-74, 20], [-77, 20], [-81, 22],
    ],
  },
  {
    name: 'South America',
    coords: [
      [-78, 9], [-75, 11], [-71, 12], [-66, 10], [-61, 10], [-56, 6],
      [-50, 2], [-44, -2], [-38, -4], [-35, -6], [-35, -10], [-39, -15],
      [-41, -22], [-48, -26], [-52, -33], [-58, -35], [-62, -39], [-65, -43],
      [-67, -48], [-68, -54], [-71, -55], [-74, -52], [-74, -45], [-72, -37],
      [-71, -30], [-70, -20], [-76, -14], [-81, -5], [-80, 1], [-78, 5],
    ],
  },
  {
    name: 'Europe',
    coords: [
      [-9, 37], [-9, 43], [-2, 43], [-5, 48], [2, 51], [8, 54], [9, 57],
      [11, 56], [10, 54], [14, 54], [20, 55], [24, 57], [24, 60], [21, 63],
      [25, 65], [20, 69], [28, 71], [32, 69], [40, 67], [44, 67], [58, 69],
      [60, 64], [55, 55], [48, 46], [40, 45], [35, 46], [30, 46], [28, 41],
      [25, 40], [23, 37], [20, 39], [16, 43], [13, 45], [16, 40], [18, 40],
      [16, 38], [13, 41], [9, 44], [5, 43], [3, 42], [-1, 37], [-5, 36],
    ],
  },
  {
    name: 'Scandinavia',
    coords: [
      [5, 59], [5, 62], [10, 64], [15, 68], [21, 70], [28, 71], [29, 69],
      [24, 66], [21, 63], [18, 59], [15, 56], [11, 58], [8, 58],
    ],
  },
  {
    name: 'Great Britain',
    coords: [
      [-5, 50], [-4, 53], [-5, 56], [-3, 58], [-1, 57], [1, 53], [1, 51],
      [-2, 50],
    ],
  },
  {
    name: 'Ireland',
    coords: [
      [-10, 52], [-9, 54], [-6, 55], [-6, 52],
    ],
  },
  {
    name: 'Iceland',
    coords: [
      [-24, 64], [-22, 66], [-15, 66], [-14, 64], [-19, 63],
    ],
  },
  {
    name: 'Africa',
    coords: [
      [-17, 15], [-16, 21], [-13, 28], [-6, 36], [3, 37], [10, 37], [12, 33],
      [20, 32], [25, 32], [32, 31], [35, 27], [38, 21], [43, 12], [51, 11],
      [49, 5], [41, -2], [40, -10], [35, -18], [33, -26], [28, -33],
      [20, -35], [18, -33], [15, -26], [12, -16], [12, -6], [9, 0],
      [9, 4], [2, 6], [-5, 5], [-11, 6], [-15, 11],
    ],
  },
  {
    name: 'Madagascar',
    coords: [
      [44, -25], [44, -19], [48, -13], [50, -15], [49, -20], [47, -25],
    ],
  },
  {
    name: 'Asia',
    coords: [
      [27, 40], [35, 42], [42, 42], [48, 46], [55, 55], [60, 64], [66, 70],
      [78, 72], [95, 74], [112, 73], [130, 72], [150, 70], [170, 68],
      [178, 66], [168, 60], [160, 55], [156, 51], [142, 54], [136, 45],
      [130, 42], [128, 35], [126, 37], [122, 40], [119, 38], [122, 31],
      [120, 24], [114, 22], [108, 21], [109, 13], [105, 9], [101, 13],
      [100, 7], [103, 1], [100, 5], [98, 12], [94, 17], [90, 22], [85, 20],
      [80, 12], [77, 8], [73, 18], [68, 24], [61, 25], [56, 26], [51, 29],
      [56, 23], [59, 22], [53, 16], [44, 13], [40, 20], [35, 28], [34, 32],
      [36, 36], [30, 36],
    ],
  },
  {
    name: 'Sri Lanka',
    coords: [
      [80, 9], [82, 8], [81, 6], [79, 7],
    ],
  },
  {
    name: 'Japan',
    coords: [
      [130, 31], [131, 34], [135, 35], [140, 36], [141, 41], [145, 44],
      [142, 45], [140, 42], [139, 38], [136, 36], [131, 34],
    ],
  },
  {
    name: 'Taiwan',
    coords: [
      [120, 22], [121, 25], [122, 24], [121, 22],
    ],
  },
  {
    name: 'Philippines',
    coords: [
      [120, 14], [121, 18], [123, 15], [125, 11], [126, 7], [123, 7], [121, 11],
    ],
  },
  {
    name: 'Sumatra',
    coords: [
      [95, 5], [99, 2], [104, -2], [105, -6], [102, -4], [98, 0],
    ],
  },
  {
    name: 'Borneo',
    coords: [
      [109, 1], [114, 4], [118, 6], [119, 1], [116, -3], [111, -3],
    ],
  },
  {
    name: 'Java',
    coords: [
      [105, -6], [110, -7], [115, -8], [114, -9], [108, -8], [105, -7],
    ],
  },
  {
    name: 'New Guinea',
    coords: [
      [131, -2], [138, -3], [146, -6], [150, -10], [145, -9], [138, -6], [132, -4],
    ],
  },
  {
    name: 'Australia',
    coords: [
      [114, -22], [122, -18], [130, -12], [136, -12], [141, -16], [143, -11],
      [146, -18], [153, -27], [151, -34], [147, -38], [140, -37], [135, -34],
      [128, -32], [118, -35], [115, -33], [113, -26],
    ],
  },
  {
    name: 'Tasmania',
    coords: [
      [145, -41], [148, -41], [147, -43], [145, -43],
    ],
  },
  {
    name: 'New Zealand North',
    coords: [
      [173, -35], [176, -37], [178, -38], [175, -41], [174, -39],
    ],
  },
  {
    name: 'New Zealand South',
    coords: [
      [172, -41], [174, -42], [170, -46], [167, -46], [169, -43],
    ],
  },
  {
    name: 'Antarctica',
    coords: [
      [-180, -78], [-150, -76], [-110, -73], [-75, -72], [-60, -64], [-45, -72],
      [-15, -71], [20, -70], [60, -68], [100, -66], [140, -67], [170, -72],
      [180, -78], [180, -89], [-180, -89],
    ],
  },
];

/**
 * Converts geographic latitude/longitude (degrees) to 3D Cartesian coordinates
 * aligned with Three.js SphereGeometry equirectangular UV mapping.
 */
export function latLonToGlobeCoords(
  lat: number,
  lon: number,
  radius: number,
): { x: number; y: number; z: number } {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return { x, y, z };
}

/**
 * Converts geographic latitude/longitude (degrees) to equirectangular canvas UV
 * coordinates in [0, 1] where u=0 is lon=-180, u=1 is lon=+180, v=0 is lat=+90 (top), v=1 is lat=-90 (bottom).
 */
export function latLonToEquirectangularUV(lat: number, lon: number): { u: number; v: number } {
  return {
    u: (lon + 180) / 360,
    v: (90 - lat) / 180,
  };
}

export interface FallbackHub {
  lat: number;
  lon: number;
  label: string;
  country: string;
  region: string;
}

export const FALLBACK_HUBS: FallbackHub[] = [
  { lat: 37.77, lon: -122.41, label: 'San Francisco', country: 'United States', region: 'North America' },
  { lat: 40.71, lon: -74.0, label: 'New York', country: 'United States', region: 'North America' },
  { lat: 51.5, lon: -0.12, label: 'London', country: 'United Kingdom', region: 'Europe' },
  { lat: 50.11, lon: 8.68, label: 'Frankfurt', country: 'Germany', region: 'Europe' },
  { lat: 47.37, lon: 8.54, label: 'Zurich', country: 'Switzerland', region: 'Europe' },
  { lat: 35.67, lon: 139.65, label: 'Tokyo', country: 'Japan', region: 'Asia-Pacific' },
  { lat: 1.35, lon: 103.81, label: 'Singapore', country: 'Singapore', region: 'Asia-Pacific' },
  { lat: -33.86, lon: 151.2, label: 'Sydney', country: 'Australia', region: 'Oceania' },
  { lat: 37.56, lon: 126.97, label: 'Seoul', country: 'South Korea', region: 'Asia-Pacific' },
  { lat: 43.65, lon: -79.38, label: 'Toronto', country: 'Canada', region: 'North America' },
  { lat: 52.36, lon: 4.9, label: 'Amsterdam', country: 'Netherlands', region: 'Europe' },
  { lat: 48.85, lon: 2.35, label: 'Paris', country: 'France', region: 'Europe' },
  { lat: -23.55, lon: -46.63, label: 'Sao Paulo', country: 'Brazil', region: 'South America' },
  { lat: 19.07, lon: 72.87, label: 'Mumbai', country: 'India', region: 'Asia-Pacific' },
  { lat: 39.04, lon: -77.48, label: 'Ashburn', country: 'United States', region: 'North America' },
  { lat: 47.6, lon: -122.33, label: 'Seattle', country: 'United States', region: 'North America' },
];

export interface GlobeNodeItem {
  id: string;
  label: string;
  pubkey?: string;
  lat: number;
  lon: number;
  country?: string;
  region?: string;
  version?: string;
  inbound?: number;
  outbound?: number;
  uptime?: number;
  isUnl: boolean;
  isValidator: boolean;
  isFallbackHub: boolean;
  domain?: string;
  domainVerified?: boolean;
  agreement1h?: number | null;
  agreement24h?: number | null;
  agreement30d?: number | null;
  lastValidatedLedger?: number;
}

/**
 * Builds enriched globe node items by joining live VHS topology nodes with
 * ValidatorRecord metadata, or falling back to regional XRPL hubs when topology
 * has not yet loaded.
 */
export function buildGlobeNodeItems(
  topologyNodes: TopologyNode[],
  validators: ValidatorRecord[],
  fallbackHubs: FallbackHub[] = FALLBACK_HUBS,
): GlobeNodeItem[] {
  const validTopology = topologyNodes.filter(
    (n) => Number.isFinite(n.lat) && Number.isFinite(n.lon),
  );

  if (validTopology.length === 0) {
    return fallbackHubs.map((hub, idx) => ({
      id: `hub-${hub.label.toLowerCase().replace(/\s+/g, '-')}`,
      label: hub.label,
      lat: hub.lat,
      lon: hub.lon,
      country: hub.country,
      region: hub.region,
      isUnl: idx < 12,
      isValidator: idx < 12,
      isFallbackHub: true,
    }));
  }

  const validatorByKey = new Map<string, ValidatorRecord>();
  for (const v of validators) {
    if (v.publicKey) validatorByKey.set(v.publicKey, v);
    if (v.masterKey) validatorByKey.set(v.masterKey, v);
  }

  return validTopology.slice(0, 320).map((n) => {
    const matched = validatorByKey.get(n.pubkey);
    const isUnl = matched ? matched.unl : false;
    const isValidator = Boolean(matched || n.isValidator);
    const label = matched?.domain || n.country || n.pubkey.slice(0, 12);

    return {
      id: n.pubkey,
      label,
      pubkey: n.pubkey,
      lat: n.lat,
      lon: n.lon,
      country: n.country || matched?.country,
      version: n.version || matched?.serverVersion,
      inbound: n.inbound,
      outbound: n.outbound,
      uptime: n.uptime,
      isUnl,
      isValidator,
      isFallbackHub: false,
      domain: matched?.domain,
      domainVerified: matched?.domainVerified,
      agreement1h: matched?.agreement1h ?? null,
      agreement24h: matched?.agreement24h ?? null,
      agreement30d: matched?.agreement30d ?? null,
      lastValidatedLedger: matched?.lastValidatedLedger,
    };
  });
}
