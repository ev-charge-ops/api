const formatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatBrl(cents: number): string {
  return formatter.format(cents / 100).replace(/\s/g, ' ');
}
