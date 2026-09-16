import { formatDuration } from './format-duration.js';
import { renderLayout } from './layout.js';
import type { RenderedEmail } from './rendered-email.js';

export interface EmailLoginCodeParams {
  name: string;
  code: string;
  url: string;
  expiresInMinutes: number;
}

export function emailLoginCode(params: EmailLoginCodeParams): RenderedEmail {
  return {
    subject: 'Seu código de acesso ao EV ChargeOps',
    ...renderLayout({
      title: 'Seu código de acesso',
      preheader: 'Use este código para entrar no EV ChargeOps.',
      greeting: `Olá, ${params.name}!`,
      paragraphs: ['Use o código abaixo para entrar no EV ChargeOps:'],
      code: params.code,
      action: { label: 'Entrar no EV ChargeOps', url: params.url },
      notes: [
        `O código e o link expiram em ${formatDuration(params.expiresInMinutes)} e só podem ser usados uma vez.`,
        'Nunca compartilhe este código. Se você não tentou entrar, ignore este e-mail.',
      ],
    }),
  };
}
