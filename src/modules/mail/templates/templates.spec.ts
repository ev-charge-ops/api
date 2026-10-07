import { emailLoginCode } from './email-login-code.js';
import { escapeHtml } from './escape-html.js';
import { formatDuration } from './format-duration.js';
import { BRAND_DARK, BRAND_RED, renderLayout } from './layout.js';
import { organizationInvite } from './organization-invite.js';
import { passwordReset } from './password-reset.js';
import { verifyEmail } from './verify-email.js';

const maliciousName = '<script>alert("x")</script> & Cia';

describe('escapeHtml', () => {
  it('escapes characters with special meaning in HTML', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('formatDuration', () => {
  it.each([
    [1, '1 minuto'],
    [10, '10 minutos'],
    [30, '30 minutos'],
    [60, '1 hora'],
    [90, '90 minutos'],
    [1440, '24 horas'],
  ])('formats %i minutes as %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe('renderLayout', () => {
  const rendered = renderLayout({
    title: 'Título',
    preheader: 'Prévia',
    greeting: 'Olá!',
    paragraphs: ['Primeiro parágrafo'],
    code: '123456',
    action: { label: 'Abrir', url: 'https://app.example.com/a?b=1&c=2' },
    notes: ['Nota final'],
  });

  it('uses a table based layout with brand colors and inline styles', () => {
    expect(rendered.html).toMatch(/^<!DOCTYPE html>/);
    expect(rendered.html).toContain('<html lang="pt-BR"');
    expect(rendered.html).toContain('role="presentation"');
    expect(rendered.html).toContain(BRAND_DARK);
    expect(rendered.html).toContain(BRAND_RED);
    expect(rendered.html).toContain('Nunito');
    expect(rendered.html).not.toContain('<style');
    expect(rendered.html).not.toContain('<script');
  });

  it('escapes the action url inside attributes', () => {
    expect(rendered.html).toContain(
      'href="https://app.example.com/a?b=1&amp;c=2"',
    );
  });

  it('renders every block in the plain text version', () => {
    expect(rendered.text).toBe(
      [
        'Título',
        'Olá!',
        'Primeiro parágrafo',
        '123456',
        'Abrir: https://app.example.com/a?b=1&c=2',
        'Nota final',
        '—\nEV ChargeOps\nEste é um e-mail automático, por favor não responda.',
      ].join('\n\n') + '\n',
    );
  });

  it('omits optional blocks when absent', () => {
    const minimal = renderLayout({
      title: 'Título',
      preheader: 'Prévia',
      greeting: 'Olá!',
      paragraphs: [],
    });
    expect(minimal.html).not.toContain('href=');
    expect(minimal.html).not.toContain('letter-spacing:8px');
  });
});

describe('templates', () => {
  const url = 'https://app.evchargeops.com.br/path?token=abc_DEF-123';
  const cases = [
    {
      name: 'verifyEmail',
      email: verifyEmail({ name: maliciousName, url, expiresInMinutes: 1440 }),
      subject: 'Confirme seu e-mail no EV ChargeOps',
      expiry: '24 horas',
    },
    {
      name: 'passwordReset',
      email: passwordReset({ name: maliciousName, url, expiresInMinutes: 30 }),
      subject: 'Redefina sua senha do EV ChargeOps',
      expiry: '30 minutos',
    },
    {
      name: 'emailLoginCode',
      email: emailLoginCode({
        name: maliciousName,
        code: '042817',
        url,
        expiresInMinutes: 10,
      }),
      subject: 'Seu código de acesso ao EV ChargeOps',
      expiry: '10 minutos',
    },
  ];

  it.each(cases)('$name escapes the user name in html', ({ email }) => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain(
      'Olá, &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Cia!',
    );
    expect(email.text).toContain(`Olá, ${maliciousName}!`);
  });

  it.each(cases)(
    '$name renders the pt-BR subject, link and expiry',
    ({ email, subject, expiry }) => {
      expect(email.subject).toBe(subject);
      expect(email.html).toContain(`href="${url}"`);
      expect(email.text).toContain(url);
      expect(email.text).toContain(expiry);
      expect(email.html).toContain(expiry);
    },
  );

  it('emailLoginCode shows the code in html and text', () => {
    const [, , login] = cases;
    expect(login.email.html).toContain('>042817<');
    expect(login.email.html).toContain('aria-label="0 4 2 8 1 7"');
    expect(login.email.text).toContain('042817');
  });
});

describe('organizationInvite', () => {
  const url = 'https://app.evchargeops.com.br/invite?token=abc_DEF-123';

  it('renders the invitation with manager, organization and unit', () => {
    const email = organizationInvite({
      managerName: 'Gestor Demo',
      organizationName: 'Residencial Aclimação',
      unitLabel: 'B · 42',
      url,
      expiresInDays: 7,
    });

    expect(email.subject).toBe(
      'Gestor Demo convidou você para o Residencial Aclimação',
    );
    expect(email.text).toContain(
      'Gestor Demo convidou você para o Residencial Aclimação',
    );
    expect(email.text).toContain('Sua unidade: B · 42.');
    expect(email.text).toContain('app EV ChargeOps');
    expect(email.text).toContain(`Aceitar convite: ${url}`);
    expect(email.text).toContain('7 dias');
    expect(email.html).toContain(`href="${url}"`);
  });

  it('omits the unit when absent and escapes names in html', () => {
    const email = organizationInvite({
      managerName: maliciousName,
      organizationName: 'Condomínio <b>X</b>',
      url,
      expiresInDays: 1,
    });

    expect(email.text).not.toContain('Sua unidade');
    expect(email.text).toContain('1 dia.');
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>X</b>');
    expect(email.html).toContain('Condomínio &lt;b&gt;X&lt;/b&gt;');
  });
});
