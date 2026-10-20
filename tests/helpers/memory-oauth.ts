import { randomUUID } from "node:crypto";
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
/** Test client storage only: this models the MCP application's credential store. */
export class MemoryOAuthClient implements OAuthClientProvider {
  info: OAuthClientInformationMixed | undefined;
  savedTokens: OAuthTokens | undefined;
  authorizationUrl: URL | undefined;
  verifier = "";
  readonly expectedState = randomUUID();
  discovery: OAuthDiscoveryState | undefined;
  constructor(
    readonly redirectUrl: string,
    readonly name: string,
  ) {}
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.name,
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "one:mcp",
    };
  }
  clientInformation() {
    return this.info;
  }
  saveClientInformation(v: OAuthClientInformationMixed) {
    this.info = v;
  }
  tokens() {
    return this.savedTokens;
  }
  saveTokens(v: OAuthTokens) {
    this.savedTokens = v;
  }
  state() {
    return this.expectedState;
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(v: string) {
    this.verifier = v;
  }
  codeVerifier() {
    return this.verifier;
  }
  saveDiscoveryState(v: OAuthDiscoveryState) {
    this.discovery = v;
  }
  discoveryState() {
    return this.discovery;
  }
  invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ) {
    if (scope === "all" || scope === "client") this.info = undefined;
    if (scope === "all" || scope === "tokens") this.savedTokens = undefined;
    if (scope === "all" || scope === "verifier") this.verifier = "";
    if (scope === "all" || scope === "discovery") this.discovery = undefined;
  }
}
