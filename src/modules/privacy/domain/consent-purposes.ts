import { ConsentPurpose } from '../../../generated/prisma/enums.js';

export const CURRENT_TERMS_VERSION = '2026-10-07';

export interface ConsentPurposeDefinition {
  purpose: ConsentPurpose;
  required: boolean;
  title: string;
  description: string;
}

export const CONSENT_PURPOSES: ConsentPurposeDefinition[] = [
  {
    purpose: ConsentPurpose.ESSENTIAL_SERVICE,
    required: true,
    title: 'Prestação do serviço',
    description:
      'Usar seus dados de cadastro, de vínculo com o condomínio e das recargas para liberar os carregadores, cobrar e manter sua conta.',
  },
  {
    purpose: ConsentPurpose.BILLING_SHARING,
    required: true,
    title: 'Rateio com o condomínio',
    description:
      'Compartilhar com a gestão do seu condomínio a energia, o horário e o valor de cada recarga para o rateio na taxa condominial.',
  },
  {
    purpose: ConsentPurpose.USAGE_ANALYTICS,
    required: false,
    title: 'Análise de uso',
    description:
      'Usar seu histórico de recargas, sem identificação pessoal, para melhorar a previsão de demanda e a detecção de anomalias.',
  },
  {
    purpose: ConsentPurpose.MARKETING_COMMUNICATIONS,
    required: false,
    title: 'Comunicações e novidades',
    description:
      'Receber por e-mail e notificação novidades, dicas de recarga e ofertas da EV ChargeOps.',
  },
];

export interface ConsentEntry {
  purpose: ConsentPurpose;
  granted: boolean;
  termsVersion: string;
  recordedAt: Date;
}

export interface ConsentChoice {
  purpose: ConsentPurpose;
  granted: boolean;
}

export interface PurposeState extends ConsentPurposeDefinition {
  granted: boolean;
  termsVersion: string | null;
  recordedAt: Date | null;
}

export interface ConsentState {
  termsVersion: string;
  acceptedTermsVersion: string | null;
  mustAccept: boolean;
  purposes: PurposeState[];
}

export class RequiredConsentError extends Error {
  override readonly name = 'RequiredConsentError';

  constructor(readonly purposes: ConsentPurpose[]) {
    super(`Required purposes cannot be revoked: ${purposes.join(', ')}`);
  }
}

function latestByPurpose(
  entries: ConsentEntry[],
): Map<ConsentPurpose, ConsentEntry> {
  const latest = new Map<ConsentPurpose, ConsentEntry>();
  for (const entry of entries) {
    const current = latest.get(entry.purpose);
    if (
      !current ||
      entry.recordedAt.getTime() >= current.recordedAt.getTime()
    ) {
      latest.set(entry.purpose, entry);
    }
  }
  return latest;
}

function isAccepted(
  entry: ConsentEntry | undefined,
  termsVersion: string,
): boolean {
  return entry?.granted === true && entry.termsVersion === termsVersion;
}

export function consentState(
  entries: ConsentEntry[],
  termsVersion: string = CURRENT_TERMS_VERSION,
): ConsentState {
  const latest = latestByPurpose(entries);
  const required = CONSENT_PURPOSES.filter((item) => item.required);
  const grantedVersions = required.flatMap((item) => {
    const entry = latest.get(item.purpose);
    return entry?.granted ? [entry.termsVersion] : [];
  });
  return {
    termsVersion,
    acceptedTermsVersion:
      grantedVersions.length === required.length
        ? (grantedVersions.sort().at(0) ?? null)
        : null,
    mustAccept: required.some(
      (item) => !isAccepted(latest.get(item.purpose), termsVersion),
    ),
    purposes: CONSENT_PURPOSES.map((definition) => {
      const entry = latest.get(definition.purpose);
      return {
        ...definition,
        granted: entry?.granted ?? false,
        termsVersion: entry?.termsVersion ?? null,
        recordedAt: entry?.recordedAt ?? null,
      };
    }),
  };
}

export function consentChanges(
  entries: ConsentEntry[],
  choices: ConsentChoice[],
  termsVersion: string = CURRENT_TERMS_VERSION,
): ConsentChoice[] {
  const requested = new Map(
    choices.map((choice) => [choice.purpose, choice.granted]),
  );
  const revoked = CONSENT_PURPOSES.filter(
    (item) => item.required && requested.get(item.purpose) === false,
  ).map((item) => item.purpose);
  if (revoked.length > 0) {
    throw new RequiredConsentError(revoked);
  }
  const latest = latestByPurpose(entries);
  return CONSENT_PURPOSES.flatMap(({ purpose, required }) => {
    const granted = required ? true : requested.get(purpose);
    if (granted === undefined) {
      return [];
    }
    const entry = latest.get(purpose);
    const unchanged =
      entry?.granted === granted && entry.termsVersion === termsVersion;
    return unchanged ? [] : [{ purpose, granted }];
  });
}
