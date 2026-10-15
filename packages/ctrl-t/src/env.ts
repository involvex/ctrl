export function baseUrl(): string {
  return (process.env['BASE_URL'] ?? 'http://127.0.0.1:7331').replace(
    /\/$/,
    ''
  );
}
