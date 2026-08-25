interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

interface GoogleTokenClient {
  requestAccessToken(config?: {
    prompt?: '' | 'none' | 'consent' | 'select_account';
    scope?: string;
    include_granted_scopes?: boolean;
  }): void;
}

interface GoogleOAuth2Api {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback(response: GoogleTokenResponse): void;
    error_callback?(error: {
      type: 'popup_failed_to_open' | 'popup_closed' | 'unknown';
    }): void;
    include_granted_scopes?: boolean;
  }): GoogleTokenClient;
  hasGrantedAllScopes(response: GoogleTokenResponse, ...scopes: string[]): boolean;
  revoke(
    accessToken: string,
    callback: (result: {
      successful: boolean;
      error?: string;
      error_description?: string;
    }) => void,
  ): void;
}

interface Window {
  google?: {
    accounts: {
      oauth2: GoogleOAuth2Api;
    };
  };
}
