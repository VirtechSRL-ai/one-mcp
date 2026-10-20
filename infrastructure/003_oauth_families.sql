CREATE TABLE oauth_token_families (
 id uuid PRIMARY KEY,
 client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO oauth_token_families(id,client_id) SELECT DISTINCT family_id,client_id FROM oauth_tokens;
ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_family_fk FOREIGN KEY(family_id) REFERENCES oauth_token_families(id) ON DELETE CASCADE;
