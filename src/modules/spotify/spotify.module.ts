import { Module } from '@nestjs/common';
import { SpotifyApiService } from './services/spotify-api.service';
import { SpotifyController } from './spotify.controller';
import { PlaybackManagerService } from './services/playback-manager.service';
import { SpotifyAuthService } from './services/spotify-auth.service';

@Module({
  providers: [SpotifyApiService, SpotifyAuthService, PlaybackManagerService],
  controllers: [SpotifyController],
})
export class SpotifyModule {}
