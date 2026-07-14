import { Module } from '@nestjs/common';
import { SpotifyApiService } from './services/spotify-api.service';
import { SpotifyApiController } from './controllers/spotify-api.controller';
import { SpotifyPlaybackService } from './services/spotify-playback.service';
import { SpotifyAuthService } from './services/spotify-auth.service';
import { SpotifyAuthController } from './controllers/spotify-auth.controller';
import { SpotifyMobileApiController } from './controllers/spotify-mobile-api.controller';
import { SpotifyWebApiController } from './controllers/spotify-web-api.controller';

@Module({
  providers: [SpotifyApiService, SpotifyAuthService, SpotifyPlaybackService],
  controllers: [
    SpotifyApiController,
    SpotifyAuthController,
    SpotifyMobileApiController,
    SpotifyWebApiController,
  ],
})
export class SpotifyModule {}
