import { Module } from '@nestjs/common';
import { SpotifyApiService } from './services/spotify-api.service';
import { SpotifyAuthService } from './services/spotify-auth.service';
import { SpotifyAuthController } from './controllers/spotify-auth.controller';
import { SpotifyMusicProvider } from './services/spotify-music.provider';
import { MusicSharingService } from './services/music-sharing.service';

@Module({
  providers: [
    SpotifyApiService,
    SpotifyAuthService,
    SpotifyMusicProvider,
    MusicSharingService,
  ],
  controllers: [SpotifyAuthController],
  exports: [MusicSharingService],
})
export class SpotifyModule {}
