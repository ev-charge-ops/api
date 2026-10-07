import {
  CONSENT_PURPOSES,
  type ConsentEntry,
  consentChanges,
  consentState,
  RequiredConsentError,
} from './consent-purposes.js';

const VERSION = '2026-10-07';
const PREVIOUS = '2026-01-01';

function entry(
  purpose: ConsentEntry['purpose'],
  granted: boolean,
  termsVersion: string,
  minute: number,
): ConsentEntry {
  return {
    purpose,
    granted,
    termsVersion,
    recordedAt: new Date(Date.UTC(2026, 9, 7, 12, minute)),
  };
}

const ACCEPTED: ConsentEntry[] = [
  entry('ESSENTIAL_SERVICE', true, VERSION, 0),
  entry('BILLING_SHARING', true, VERSION, 0),
];

describe('consentState', () => {
  it('asks a new user to accept the terms with nothing granted', () => {
    const state = consentState([], VERSION);

    expect(state).toMatchObject({
      termsVersion: VERSION,
      acceptedTermsVersion: null,
      mustAccept: true,
    });
    expect(state.purposes.map((item) => item.purpose)).toEqual(
      CONSENT_PURPOSES.map((item) => item.purpose),
    );
    expect(state.purposes.every((item) => !item.granted)).toBe(true);
  });

  it('marks the required purposes and keeps the latest choice per purpose', () => {
    const state = consentState(
      [
        ...ACCEPTED,
        entry('MARKETING_COMMUNICATIONS', true, VERSION, 1),
        entry('MARKETING_COMMUNICATIONS', false, VERSION, 2),
        entry('USAGE_ANALYTICS', true, VERSION, 3),
      ],
      VERSION,
    );

    expect(state.mustAccept).toBe(false);
    expect(state.acceptedTermsVersion).toBe(VERSION);
    expect(
      state.purposes.map(({ purpose, required, granted }) => ({
        purpose,
        required,
        granted,
      })),
    ).toEqual([
      { purpose: 'ESSENTIAL_SERVICE', required: true, granted: true },
      { purpose: 'BILLING_SHARING', required: true, granted: true },
      { purpose: 'USAGE_ANALYTICS', required: false, granted: true },
      { purpose: 'MARKETING_COMMUNICATIONS', required: false, granted: false },
    ]);
  });

  it('asks again when the terms version changes', () => {
    const state = consentState(
      [
        entry('ESSENTIAL_SERVICE', true, PREVIOUS, 0),
        entry('BILLING_SHARING', true, PREVIOUS, 0),
      ],
      VERSION,
    );

    expect(state).toMatchObject({
      acceptedTermsVersion: PREVIOUS,
      mustAccept: true,
    });
  });
});

describe('consentChanges', () => {
  it('grants the required purposes when the terms are accepted', () => {
    expect(
      consentChanges(
        [],
        [{ purpose: 'USAGE_ANALYTICS', granted: true }],
        VERSION,
      ),
    ).toEqual([
      { purpose: 'ESSENTIAL_SERVICE', granted: true },
      { purpose: 'BILLING_SHARING', granted: true },
      { purpose: 'USAGE_ANALYTICS', granted: true },
    ]);
  });

  it('records only what changed', () => {
    const history = [...ACCEPTED, entry('USAGE_ANALYTICS', true, VERSION, 1)];

    expect(
      consentChanges(
        history,
        [
          { purpose: 'USAGE_ANALYTICS', granted: true },
          { purpose: 'MARKETING_COMMUNICATIONS', granted: false },
        ],
        VERSION,
      ),
    ).toEqual([{ purpose: 'MARKETING_COMMUNICATIONS', granted: false }]);
    expect(
      consentChanges(
        history,
        [{ purpose: 'USAGE_ANALYTICS', granted: false }],
        VERSION,
      ),
    ).toEqual([{ purpose: 'USAGE_ANALYTICS', granted: false }]);
  });

  it('records the optional choices again under new terms only when sent', () => {
    const history = [
      entry('ESSENTIAL_SERVICE', true, PREVIOUS, 0),
      entry('BILLING_SHARING', true, PREVIOUS, 0),
      entry('USAGE_ANALYTICS', true, PREVIOUS, 0),
    ];

    expect(consentChanges(history, [], VERSION)).toEqual([
      { purpose: 'ESSENTIAL_SERVICE', granted: true },
      { purpose: 'BILLING_SHARING', granted: true },
    ]);
  });

  it('refuses to revoke a required purpose', () => {
    expect(() =>
      consentChanges(
        ACCEPTED,
        [{ purpose: 'BILLING_SHARING', granted: false }],
        VERSION,
      ),
    ).toThrow(RequiredConsentError);
  });
});
