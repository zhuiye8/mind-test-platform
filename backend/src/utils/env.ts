export function getPrimaryFrontendOrigin(): string {
  const raw = process.env.CORS_ORIGIN || '';
  const origins = raw
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    return origins[0];
  }
  return 'http://localhost:3000';
}

export function getBooleanEnv(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
