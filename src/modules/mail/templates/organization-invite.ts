import { renderLayout } from './layout.js';
import type { RenderedEmail } from './rendered-email.js';

export interface OrganizationInviteParams {
  managerName: string;
  organizationName: string;
  unitLabel?: string | null;
  url: string;
  expiresInDays: number;
}

export function organizationInvite(
  params: OrganizationInviteParams,
): RenderedEmail {
  const headline = `${params.managerName} convidou você para o ${params.organizationName}`;
  const paragraphs = [
    `${headline} no EV ChargeOps, a plataforma que organiza as recargas de veículos elétricos e o rateio dos custos de energia.`,
  ];
  if (params.unitLabel) {
    paragraphs.push(`Sua unidade: ${params.unitLabel}.`);
  }
  paragraphs.push(
    'Aceite o convite para criar seu acesso. Depois, use o app EV ChargeOps no celular ou a versão web para acompanhar suas recargas.',
  );

  return {
    subject: headline,
    ...renderLayout({
      title: 'Você foi convidado',
      preheader: `${headline} no EV ChargeOps.`,
      greeting: 'Olá!',
      paragraphs,
      action: { label: 'Aceitar convite', url: params.url },
      notes: [
        `Este convite expira em ${formatDays(params.expiresInDays)}.`,
        'Se você não esperava este convite, ignore este e-mail.',
      ],
    }),
  };
}

function formatDays(days: number): string {
  return days === 1 ? '1 dia' : `${days} dias`;
}
