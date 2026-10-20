-- Bind browser MCP access to the destination actually approved at consent.
-- Earlier grants remain valid for native/same-origin clients; reconnect them to enable cross-origin browser access.
ALTER TABLE clients ADD COLUMN oauth_origin text;
