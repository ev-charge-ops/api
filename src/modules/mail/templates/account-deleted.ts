import { formatSaoPauloDateTime } from './format-date-time.js';
import { renderLayout } from './layout.js';
import type { RenderedEmail } from './rendered-email.js';

export interface AccountDeletedParams {
  name: string;
  deletedAt: Date;
}

export function accountDeleted(params: AccountDeletedParams): RenderedEmail {
  return {
    subject: 'Sua conta foi excluída',
    ...renderLayout({
      title: 'Conta excluída',
      preheader: 'A sua conta no EV ChargeOps foi excluída.',
      greeting: `Olá, ${params.name}!`,
      paragraphs: [
        `A sua conta no EV ChargeOps foi excluída em ${formatSaoPauloDateTime(params.deletedAt)} (horário de Brasília), como você pediu.`,
        'Removemos seus dados de acesso, os logins com Google e Apple, os dispositivos de notificação e os cartões salvos.',
        'O histórico de recargas continua no rateio do condomínio, sem o seu nome e e-mail, porque faz parte da prestação de contas da organização.',
      ],
      notes: [
        'Se você não pediu a exclusão, procure o gestor do seu condomínio.',
      ],
    }),
  };
}
