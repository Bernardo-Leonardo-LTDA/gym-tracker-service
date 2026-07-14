import { Controller, Post, Body } from '@nestjs/common';
import { SpotifyPlaybackService } from '../services/spotify-playback.service';

@Controller('spotify/mobile')
export class SpotifyMobileApiController {
  constructor(private readonly spotifyPlayback: SpotifyPlaybackService) {}

  @Post('track-changed')
  mobileUpdate(
    @Body() body: { trackName: string; artist: string; isPlaying: boolean }
  ): any {
    return this.spotifyPlayback.updatePlaybackFromMobile('user123', body);
  }
}
