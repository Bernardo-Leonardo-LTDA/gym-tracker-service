import type { Response } from 'express';
import { SpotifyAuthController } from './spotify-auth.controller';
import { SpotifyAuthService } from '../services/spotify-auth.service';

describe('Spotify authorization return', () => {
  const auth = {
    getFrontendUrl: () => 'http://localhost:5173',
    exchangeCodeWeb: jest.fn(),
  };
  const controller = new SpotifyAuthController(
    auth as unknown as SpotifyAuthService
  );
  let response: {
    redirect: jest.Mock<void, [string]>;
    setHeader: jest.Mock;
  };
  beforeEach(() => {
    jest.clearAllMocks();
    response = { redirect: jest.fn<void, [string]>(), setHeader: jest.fn() };
  });

  it('returns token exchange failures to the app without leaking provider credentials', async () => {
    auth.exchangeCodeWeb.mockRejectedValue({
      config: { headers: { Authorization: 'secret' } },
      message: 'expired-code',
    });
    await controller.spotifyCallbackWeb(
      'code',
      'state',
      undefined,
      response as unknown as Response
    );
    const url = new URL(response.redirect.mock.calls[0][0]);
    expect(url.pathname).toBe('/active');
    expect(new URLSearchParams(url.hash.slice(1)).get('spotify_error')).toBe(
      'token_exchange_failed'
    );
    expect(url.hash).toContain('state=state');
    expect(url.toString()).not.toContain('secret');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store'
    );
  });

  it('returns denied consent without attempting a token exchange', async () => {
    await controller.spotifyCallbackWeb(
      undefined,
      'state',
      'access_denied',
      response as unknown as Response
    );
    expect(auth.exchangeCodeWeb).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/active#spotify_error=access_denied&state=state'
    );
  });
});
