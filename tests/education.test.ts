import { describe, expect, it } from 'vitest';
import {
  EDUCATION_LESSONS,
  OFFICIAL_XRPL_LINKS,
  XRPL_GLOSSARY,
} from '../src/shared/educationContent';

describe('XRPL Academy & Education Hub content integrity', () => {
  it('provides comprehensive built-in lessons covering XRPL fundamentals, DeFi, security, node ops, and Command Center', () => {
    expect(EDUCATION_LESSONS.length).toBeGreaterThanOrEqual(10);
    const categories = new Set(EDUCATION_LESSONS.map((l) => l.category));
    expect(categories.has('fundamentals')).toBe(true);
    expect(categories.has('defi')).toBe(true);
    expect(categories.has('security')).toBe(true);
    expect(categories.has('nodeops')).toBe(true);
    expect(categories.has('command-center')).toBe(true);

    for (const lesson of EDUCATION_LESSONS) {
      expect(lesson.title.length).toBeGreaterThan(8);
      expect(lesson.keyTakeaways.length).toBeGreaterThanOrEqual(3);
      expect(lesson.sections.length).toBeGreaterThanOrEqual(2);
      for (const lnk of lesson.links) {
        expect(lnk.url.startsWith('https://')).toBe(true);
      }
    }
  });

  it('includes a 20+ term searchable XRPL glossary', () => {
    expect(XRPL_GLOSSARY.length).toBeGreaterThanOrEqual(20);
    for (const item of XRPL_GLOSSARY) {
      expect(item.term.trim().length).toBeGreaterThan(1);
      expect(item.definition.trim().length).toBeGreaterThan(20);
    }
  });

  it('uses only HTTPS URLs for all curated official external links', () => {
    expect(OFFICIAL_XRPL_LINKS.length).toBeGreaterThanOrEqual(10);
    for (const link of OFFICIAL_XRPL_LINKS) {
      expect(link.url.startsWith('https://')).toBe(true);
    }
  });
});
