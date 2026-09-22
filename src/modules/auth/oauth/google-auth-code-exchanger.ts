export class InvalidGoogleAuthCodeError extends Error {
  override readonly name = 'InvalidGoogleAuthCodeError';
}

export class GoogleCodeFlowNotConfiguredError extends Error {
  override readonly name = 'GoogleCodeFlowNotConfiguredError';
}

export abstract class GoogleAuthCodeExchanger {
  abstract exchange(code: string): Promise<string>;
}
