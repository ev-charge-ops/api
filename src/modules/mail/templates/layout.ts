import { escapeHtml } from './escape-html.js';

export const BRAND_DARK = '#0B0B0D';
export const BRAND_RED = '#E8121F';

const FONT_STACK =
  "Nunito, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const CODE_FONT_STACK = "'Courier New', Courier, monospace";
const TEXT_COLOR = '#1F1F23';
const MUTED_COLOR = '#5C5C66';
const PAGE_BACKGROUND = '#F2F2F4';
const AUTOMATED_NOTICE = 'Este é um e-mail automático, por favor não responda.';

export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailContent {
  title: string;
  preheader: string;
  greeting: string;
  paragraphs: string[];
  code?: string;
  action?: EmailAction;
  notes?: string[];
}

export interface RenderedLayout {
  html: string;
  text: string;
}

export function renderLayout(content: EmailContent): RenderedLayout {
  return { html: renderHtml(content), text: renderText(content) };
}

function paragraph(value: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:16px;line-height:24px;color:${TEXT_COLOR};">${escapeHtml(value)}</p>`;
}

function note(value: string): string {
  return `<p style="margin:0 0 12px;font-family:${FONT_STACK};font-size:14px;line-height:20px;color:${MUTED_COLOR};">${escapeHtml(value)}</p>`;
}

function codeBlock(code: string): string {
  const spokenCode = escapeHtml(code.split('').join(' '));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td aria-label="${spokenCode}" style="padding:16px 24px;background-color:${PAGE_BACKGROUND};border:1px solid #DCDCE0;border-radius:8px;font-family:${CODE_FONT_STACK};font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:${TEXT_COLOR};">${escapeHtml(code)}</td></tr></table>`;
}

function actionBlock(action: EmailAction): string {
  const url = escapeHtml(action.url);
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td align="center" bgcolor="${BRAND_RED}" style="background-color:${BRAND_RED};border-radius:8px;"><a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-size:16px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(action.label)}</a></td></tr></table>`,
    `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:14px;line-height:20px;color:${MUTED_COLOR};">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="${url}" target="_blank" style="color:${BRAND_RED};word-break:break-all;">${url}</a></p>`,
  ].join('');
}

function renderHtml(content: EmailContent): string {
  const blocks = [
    `<h1 style="margin:0 0 16px;font-family:${FONT_STACK};font-size:24px;line-height:32px;font-weight:800;color:${TEXT_COLOR};">${escapeHtml(content.title)}</h1>`,
    paragraph(content.greeting),
    ...content.paragraphs.map(paragraph),
  ];
  if (content.code) {
    blocks.push(codeBlock(content.code));
  }
  if (content.action) {
    blocks.push(actionBlock(content.action));
  }
  blocks.push(...(content.notes ?? []).map(note));

  return [
    '<!DOCTYPE html>',
    '<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(content.title)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background-color:${PAGE_BACKGROUND};">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(content.preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BACKGROUND};"><tr><td align="center" style="padding:24px 12px;">`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">',
    `<tr><td bgcolor="${BRAND_DARK}" style="padding:24px 32px;background-color:${BRAND_DARK};border-bottom:4px solid ${BRAND_RED};border-radius:12px 12px 0 0;font-family:${FONT_STACK};font-size:22px;line-height:28px;font-weight:800;color:#FFFFFF;">EV <span style="color:${BRAND_RED};">Charge</span>Ops</td></tr>`,
    `<tr><td bgcolor="#FFFFFF" style="padding:32px;background-color:#FFFFFF;">${blocks.join('')}</td></tr>`,
    `<tr><td bgcolor="#FFFFFF" style="padding:20px 32px;background-color:#FFFFFF;border-top:1px solid #E6E6EA;border-radius:0 0 12px 12px;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${MUTED_COLOR};">EV ChargeOps — gestão e rateio de recargas de veículos elétricos em condomínios.<br>${AUTOMATED_NOTICE}</td></tr>`,
    '</table>',
    '</td></tr></table>',
    '</body>',
    '</html>',
  ].join('\n');
}

function renderText(content: EmailContent): string {
  const sections = [content.title, content.greeting, ...content.paragraphs];
  if (content.code) {
    sections.push(content.code);
  }
  if (content.action) {
    sections.push(`${content.action.label}: ${content.action.url}`);
  }
  sections.push(...(content.notes ?? []));
  sections.push(`—\nEV ChargeOps\n${AUTOMATED_NOTICE}`);
  return `${sections.join('\n\n')}\n`;
}
