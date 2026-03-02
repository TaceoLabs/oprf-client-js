import { describe, it, expect } from 'vitest';
import { greet, VERSION } from '../src/index';

describe('core', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.0.0');
  });

  it('greet returns expected string', () => {
    expect(greet('world')).toBe('Hello, world!');
  });
});
