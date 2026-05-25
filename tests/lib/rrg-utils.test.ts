import { describe, it, expect } from 'vitest';
import { classifyQuadrant } from '@/lib/rrg-utils';

describe('classifyQuadrant', () => {
  it('returns Leading when both ratio and momentum are above 100', () => {
    expect(classifyQuadrant(101, 101)).toBe('Leading');
  });

  it('returns Weakening when ratio > 100 and momentum < 100', () => {
    expect(classifyQuadrant(101, 99)).toBe('Weakening');
  });

  it('returns Improving when ratio < 100 and momentum > 100', () => {
    expect(classifyQuadrant(99, 101)).toBe('Improving');
  });

  it('returns Lagging when both ratio and momentum are below 100', () => {
    expect(classifyQuadrant(99, 99)).toBe('Lagging');
  });

  it('returns Lagging for exact boundary (100, 100) — treated as not above', () => {
    expect(classifyQuadrant(100, 100)).toBe('Lagging');
  });

  it('returns Lagging when ratio is exactly 100 and momentum is below', () => {
    expect(classifyQuadrant(100, 99)).toBe('Lagging');
  });

  it('returns Improving when ratio is exactly 100 and momentum is above', () => {
    expect(classifyQuadrant(100, 101)).toBe('Improving');
  });

  it('returns Weakening when ratio is above and momentum is exactly 100', () => {
    expect(classifyQuadrant(101, 100)).toBe('Weakening');
  });
});
