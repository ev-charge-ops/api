export function buildAppLink(
  appUrl: string,
  path: string,
  token: string,
): string {
  return `${appUrl}${path}?token=${encodeURIComponent(token)}`;
}
