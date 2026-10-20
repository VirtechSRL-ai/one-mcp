const base = new URL(process.env.PUBLIC_URL || "http://localhost:3000").origin;
console.table(
  ["google", "github"].map((provider) => ({
    provider,
    configured: !!(
      process.env[provider.toUpperCase() + "_CLIENT_ID"] &&
      process.env[provider.toUpperCase() + "_CLIENT_SECRET"]
    ),
    callback: base + "/api/oauth/" + provider + "/callback",
  })),
);
console.log(
  "Set missing credentials in .env locally, then recreate the API container. Values are never printed.",
);
