const find = (suffix) => {
  const key = Object.keys(process.env).find((name) => name === suffix || name.endsWith(`_${suffix}`));
  return key ? process.env[key]?.trim().replace(/^"|"$/g, "") : undefined;
};

export function dbCredentials() {
  return {
    url: find("TURSO_DATABASE_URL") || "file:local.db",
    authToken: find("TURSO_AUTH_TOKEN") || undefined,
  };
}
