import {
  FetchGoogleAuthCodeExchanger,
  GOOGLE_TOKEN_URL,
} from './fetch-google-auth-code-exchanger.js';
import {
  GoogleCodeFlowNotConfiguredError,
  InvalidGoogleAuthCodeError,
} from './google-auth-code-exchanger.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('FetchGoogleAuthCodeExchanger', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let exchanger: FetchGoogleAuthCodeExchanger;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    exchanger = new FetchGoogleAuthCodeExchanger({
      clientId: 'web.apps.googleusercontent.com',
      clientSecret: 'client-secret',
      fetch: fetchMock,
    });
  });

  it('exchanges the code at the Google token endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { access_token: 'access', id_token: 'id-token' }),
    );

    await expect(exchanger.exchange('auth-code')).resolves.toBe('id-token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(GOOGLE_TOKEN_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      code: 'auth-code',
      client_id: 'web.apps.googleusercontent.com',
      client_secret: 'client-secret',
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    });
  });

  it('rejects codes refused by Google', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: 'invalid_grant',
        error_description: 'Bad Request',
      }),
    );

    await expect(exchanger.exchange('bogus')).rejects.toBeInstanceOf(
      InvalidGoogleAuthCodeError,
    );
  });

  it('rejects responses without an ID token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'access' }));

    await expect(exchanger.exchange('auth-code')).rejects.toBeInstanceOf(
      InvalidGoogleAuthCodeError,
    );
  });

  it('rejects responses that are not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('oops', { status: 200 }));

    await expect(exchanger.exchange('auth-code')).rejects.toBeInstanceOf(
      InvalidGoogleAuthCodeError,
    );
  });

  it.each([
    { clientId: '', clientSecret: 'client-secret' },
    { clientId: 'web.apps.googleusercontent.com', clientSecret: '' },
  ])(
    'refuses to exchange when the flow is not configured (%o)',
    async (settings) => {
      const unconfigured = new FetchGoogleAuthCodeExchanger({
        ...settings,
        fetch: fetchMock,
      });

      await expect(unconfigured.exchange('auth-code')).rejects.toBeInstanceOf(
        GoogleCodeFlowNotConfiguredError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
