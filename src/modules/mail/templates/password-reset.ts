import { formatDuration } from './format-duration.js';
import { renderLayout } from './layout.js';
import type { RenderedEmail } from './rendered-email.js';

export interface PasswordResetParams {
  name: string;
  url: string;
  expiresInMinutes: number;
}

export function passwordReset(params: PasswordResetParams): RenderedEmail {
  return {
    subject: 'Redefina sua senha do EV ChargeOps',
    ...renderLayout({
      title: 'Redefinição de senha',
      preheader: 'Use o link para criar uma nova senha no EV ChargeOps.',
      greeting: `Olá, ${params.name}!`,
      paragraphs: [
        'Recebemos uma solicitação para redefinir a senha da sua conta no EV ChargeOps.',
        'Clique no botão abaixo para criar uma nova senha. Por segurança, todas as sessões abertas serão encerradas.',
      ],
      action: { label: 'Redefinir senha', url: params.url },
      notes: [
        `Este link expira em ${formatDuration(params.expiresInMinutes)} e só pode ser usado uma vez.`,
        'Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.',
      ],
    }),
  };
}
