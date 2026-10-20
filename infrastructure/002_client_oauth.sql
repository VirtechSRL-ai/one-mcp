CREATE TABLE oauth_applications (
 id text PRIMARY KEY,
 metadata jsonb NOT NULL,
 secret text,
 source text NOT NULL CHECK(source IN ('dcr','cimd')),
 metadata_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE clients ADD COLUMN auth_mode text NOT NULL DEFAULT 'manual' CHECK(auth_mode IN ('manual','oauth'));
ALTER TABLE clients ADD COLUMN oauth_application_id text REFERENCES oauth_applications(id);
CREATE TABLE oauth_authorization_requests (
 id uuid PRIMARY KEY,
 application_id text NOT NULL REFERENCES oauth_applications(id),
 binding_hash text NOT NULL,
 owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
 session_hash text,
 params text NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE oauth_codes (
 hash text PRIMARY KEY,
 application_id text NOT NULL REFERENCES oauth_applications(id),
 client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 redirect_uri text NOT NULL,
 challenge text NOT NULL,
 resource text NOT NULL,
 scopes text[] NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE TABLE oauth_tokens (
 hash text PRIMARY KEY,
 application_id text NOT NULL REFERENCES oauth_applications(id),
 client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 family_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('access','refresh')),
 resource text NOT NULL,
 scopes text[] NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_token_family ON oauth_tokens(family_id);
CREATE INDEX oauth_request_expiry ON oauth_authorization_requests(expires_at);
CREATE INDEX oauth_tokens_client ON oauth_tokens(client_id);
