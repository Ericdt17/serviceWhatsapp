'use strict';

const { parseStatusUpdate, isStatusUpdate } = require('../../statusParser');

// ---------------------------------------------------------------------------
// parseStatusUpdate
// ---------------------------------------------------------------------------
describe('parseStatusUpdate', () => {
  describe('delivered / payment', () => {
    // The parser maps "Livré" to type "payment" (collected amount);
    // the delivery route then transitions the status to "delivered".
    it('"Livré <phone>" → type payment', () => {
      const result = parseStatusUpdate('Livré 612345678');
      expect(result).not.toBeNull();
      expect(result.type).toBe('payment');
      expect(result.phone).toBe('612345678');
    });
  });

  describe('failed', () => {
    it('"Échec <phone>" → type failed', () => {
      const result = parseStatusUpdate('Échec 699999999');
      expect(result.type).toBe('failed');
      expect(result.phone).toBe('699999999');
    });

    it('"Numéro ne passe pas <phone>" → type failed', () => {
      const result = parseStatusUpdate('Numéro ne passe pas 699999999');
      expect(result.type).toBe('failed');
    });
  });

  describe('client_absent', () => {
    it('"client absent" → type client_absent', () => {
      const result = parseStatusUpdate('client absent 690000001');
      expect(result).not.toBeNull();
      expect(result.type).toBe('client_absent');
    });
  });

  describe('pickup', () => {
    it('"Vient chercher <phone>" → type pickup', () => {
      const result = parseStatusUpdate('Vient chercher 655555555');
      expect(result).not.toBeNull();
      expect(result.type).toBe('pickup');
    });
  });

  describe('payment (Collecté)', () => {
    it('parses amount from "Collecté 10k <phone>"', () => {
      const result = parseStatusUpdate('Collecté 10k 688888888');
      expect(result).not.toBeNull();
      expect(result.amount).toBe(10000);
      expect(result.phone).toBe('688888888');
    });

    it('parses amount from "Collecté 15k <phone>"', () => {
      const result = parseStatusUpdate('Collecté 15k 688888888');
      expect(result.amount).toBe(15000);
    });

    it('parses amount from "Collecté 5k <phone>"', () => {
      const result = parseStatusUpdate('Collecté 5k 688888888');
      expect(result.amount).toBe(5000);
    });
  });

  describe('phone validation', () => {
    it('ignores phone numbers not starting with 6', () => {
      const result = parseStatusUpdate('Livré 123456789');
      expect(!result || result.phone === null).toBe(true);
    });

    it('strips spaced +237 on Livré messages', () => {
      const result = parseStatusUpdate('Livré +237 6 98 09 75 33');
      expect(result.phone).toBe('698097533');
    });

    it('handles missing phone gracefully', () => {
      const result = parseStatusUpdate('Collecté 5k');
      expect(!result || result.phone === null || result.phone === undefined).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// isStatusUpdate
// ---------------------------------------------------------------------------
describe('isStatusUpdate', () => {
  it('returns true for "Livré <phone>"', () => {
    expect(isStatusUpdate('Livré 612345678')).toBe(true);
  });

  it('returns true for "Échec <phone>"', () => {
    expect(isStatusUpdate('Échec 699999999')).toBe(true);
  });

  it('returns false for a delivery message', () => {
    const deliveryMsg = '612345678\n2 robes\n15k\nBonapriso';
    expect(isStatusUpdate(deliveryMsg)).toBe(false);
  });

  it('returns false for a plain greeting', () => {
    expect(isStatusUpdate('bonjour')).toBe(false);
  });
});
