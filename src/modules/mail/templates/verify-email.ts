import { formatDuration } from './format-duration.js';
import { renderLayout } from './layout.js';
import type { RenderedEmail } from './rendered-email.js';

export interface VerifyEmailParams {
  name: string;
  url: string;
  expiresInMinutes: number;
}

export function verifyEmail(params: VerifyEmailParams): RenderedEmail {
  return {
    subject: 'Confirme seu e-mail no EV ChargeOps',
    ...renderLayout({
      title: 'Confirme seu e-mail',
      preheader: 'Falta pouco para concluir seu cadastro no EV ChargeOps.',
      greeting: `Olá, ${params.name}!`,
      paragraphs: [
        'Para concluir seu cadastro no EV ChargeOps, confirme que este endereço de e-mail é seu.',
      ],
      action: { label: 'Confirmar e-mail', url: params.url },
      notes: [
        `Este link expira em ${formatDuration(params.expiresInMinutes)}.`,
        'Se você não criou uma conta no EV ChargeOps, ignore este e-mail.',
      ],
    }),
  };
}
