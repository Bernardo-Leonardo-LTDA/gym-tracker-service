import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SpotifyAuthService } from '../services/spotify-auth.service';

@Controller('auth/spotify')
export class SpotifyAuthController {
  constructor(private readonly authService: SpotifyAuthService) {}

  @Get('login')
  spotifyLogin(@Res() res: Response) {
    res.redirect(this.authService.getSpotifyAuthUrl());
  }

  @Get('callback')
  async spotifyCallbackWeb(@Query('code') code: string, @Res() res: Response) {
    const accessToken = await this.authService.exchangeCodeWeb(code);
    res.redirect(`http://localhost:5173?accessToken=${accessToken}`);
  }

  @Post('callback')
  async spotifyCallbackMobile(
    @Body() body: { code: string; codeVerifier: string }
  ) {
    return this.authService.exchangeCodeMobile(body.code, body.codeVerifier);
  }
}
