import { Controller, Get, Headers } from '@nestjs/common';
import { SpotifyApiService } from '../services/spotify-api.service';

@Controller('spotify')
export class SpotifyApiController {
  constructor(private readonly spotifyApiService: SpotifyApiService) {}

  @Get('currently-playing')
  getCurrentlyPlaying(@Headers('authorization') authorization: string) {
    const accessToken = authorization?.replace('Bearer ', '');
    return this.spotifyApiService.getCurrentlyPlaying(accessToken);
  }
}
