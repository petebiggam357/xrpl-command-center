import { describe, expect, it } from 'vitest';
import {
  buildGlobeNodeItems,
  FALLBACK_HUBS,
  latLonToEquirectangularUV,
  latLonToGlobeCoords,
  WORLD_CONTINENT_POLYGONS,
} from '../src/shared/worldContinents';
import type { TopologyNode, ValidatorRecord } from '../src/shared/types';

describe('3D Globe Continents, Projection & Node Inspector Data', () => {
  it('provides valid geographic coordinates for all major continents', () => {
    const names = WORLD_CONTINENT_POLYGONS.map((p) => p.name);
    expect(names).toContain('North America');
    expect(names).toContain('South America');
    expect(names).toContain('Europe');
    expect(names).toContain('Africa');
    expect(names).toContain('Asia');
    expect(names).toContain('Australia');
    expect(names).toContain('Antarctica');

    for (const poly of WORLD_CONTINENT_POLYGONS) {
      expect(poly.coords.length).toBeGreaterThanOrEqual(3);
      for (const [lon, lat] of poly.coords) {
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
      }
    }
  });

  it('aligns latLonToGlobeCoords and equirectangular UV with Three.js SphereGeometry', () => {
    const northPole = latLonToGlobeCoords(90, 0, 1);
    expect(northPole.y).toBeCloseTo(1, 5);
    expect(Math.hypot(northPole.x, northPole.z)).toBeCloseTo(0, 5);

    const southPole = latLonToGlobeCoords(-90, 0, 1);
    expect(southPole.y).toBeCloseTo(-1, 5);

    const primeEquator = latLonToGlobeCoords(0, 0, 1);
    expect(primeEquator.x).toBeCloseTo(1, 5);
    expect(primeEquator.y).toBeCloseTo(0, 5);
    expect(primeEquator.z).toBeCloseTo(0, 5);

    const uvPrime = latLonToEquirectangularUV(0, 0);
    expect(uvPrime.u).toBeCloseTo(0.5, 5);
    expect(uvPrime.v).toBeCloseTo(0.5, 5);

    const uvNorthWest = latLonToEquirectangularUV(90, -180);
    expect(uvNorthWest.u).toBeCloseTo(0, 5);
    expect(uvNorthWest.v).toBeCloseTo(0, 5);
  });

  it('falls back to regional hubs when topologyNodes is empty', () => {
    const items = buildGlobeNodeItems([], []);
    expect(items.length).toBe(FALLBACK_HUBS.length);
    expect(items[0].isFallbackHub).toBe(true);
    expect(items[0].label).toBe('San Francisco');
    expect(items[0].country).toBe('United States');
  });

  it('enriches live topology nodes with matching validator records', () => {
    const topology: TopologyNode[] = [
      {
        pubkey: 'n9Val1',
        lat: 51.5,
        lon: -0.12,
        country: 'GB',
        version: 'rippled-2.3.0',
        inbound: 24,
        outbound: 12,
        uptime: 90000,
      },
      {
        pubkey: 'n9Peer2',
        lat: 35.67,
        lon: 139.65,
        country: 'JP',
      },
    ];
    const validators: ValidatorRecord[] = [
      {
        publicKey: 'n9Val1',
        domain: 'xrpl.london.example',
        domainVerified: true,
        unl: true,
        agreement1h: 1.0,
        agreement24h: 0.999,
        agreement30d: 0.998,
        serverVersion: '2.3.0',
      },
    ];

    const items = buildGlobeNodeItems(topology, validators);
    expect(items).toHaveLength(2);
    expect(items[0].isUnl).toBe(true);
    expect(items[0].isValidator).toBe(true);
    expect(items[0].domain).toBe('xrpl.london.example');
    expect(items[0].domainVerified).toBe(true);
    expect(items[0].agreement24h).toBe(0.999);
    expect(items[0].inbound).toBe(24);
    expect(items[1].isUnl).toBe(false);
    expect(items[1].isFallbackHub).toBe(false);
    expect(items[1].label).toBe('JP');
  });

  it('filters out topology nodes with non-finite coordinates and falls back if none are valid', () => {
    const malformed: TopologyNode[] = [
      { pubkey: 'n9Bad1', lat: Number.NaN, lon: 10 },
      { pubkey: 'n9Bad2', lat: 20, lon: Number.POSITIVE_INFINITY },
    ];
    const fallback = buildGlobeNodeItems(malformed, []);
    expect(fallback.length).toBe(FALLBACK_HUBS.length);
    expect(fallback[0].isFallbackHub).toBe(true);

    const mixed: TopologyNode[] = [
      ...malformed,
      { pubkey: 'n9Good', lat: 40.71, lon: -74.0, country: 'US' },
    ];
    const filtered = buildGlobeNodeItems(mixed, []);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('n9Good');
  });
});
