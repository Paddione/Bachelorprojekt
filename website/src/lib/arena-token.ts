// The website OIDC client carries an `oidc-audience-mapper` for the arena
// audience (see realm-workspace-*.json → website.protocolMappers), so the
// user's existing session access_token already has `aud: arena` and is
// directly accepted by arena-server's verifyArenaJwt. No token-exchange
// roundtrip needed.

export interface ArenaToken {
  token: string;
}

export function mintArenaToken(userAccessToken: string): ArenaToken {
  return { token: userAccessToken };
}
