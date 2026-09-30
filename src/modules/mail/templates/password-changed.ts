import { toSaoPauloTime } from '../../../common/time/sao-paulo-time.js';
import { renderLayout } from './layout.js';
import type { RenderedEmail } from './rendered-email.js';

export interface PasswordChangedParams {
  name: string;
  changedAt: Date;
  forgotPasswordUrl: string;
}

export function passwordChanged(params: PasswordChangedParams): RenderedEmail {
  return {
    subject: 'Sua senha foi alterada',
    ...renderLayout({
      title: 'Senha alterada',
      preheader: 'A senha da sua conta no EV ChargeOps acabou de ser alterada.',
      greeting: `Olá, ${params.name}!`,
      paragraphs: [
        `A senha da sua conta no EV ChargeOps foi alterada em ${formatSaoPauloDateTime(params.changedAt)} (horário de Brasília).`,
        'Por segurança, encerramos as sessões abertas nos outros dispositivos.',
      ],
      action: { label: 'Redefinir senha', url: params.forgotPasswordUrl },
      notes: [
        'Se foi você, nenhuma ação é necessária.',
        'Se você não reconhece esta alteração, redefina sua senha imediatamente pelo botão acima.',
      ],
    }),
  };
}

function formatSaoPauloDateTime(date: Date): string {
  const time = toSaoPauloTime(date);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(time.day)}/${pad(time.month)}/${time.year} às ${pad(time.hour)}:${pad(time.minute)}`;
}
