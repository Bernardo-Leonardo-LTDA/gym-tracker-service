import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Headers,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { GymsService } from './gyms.service';
import type { MusicProviderId } from '../spotify/interfaces/music-sharing.interface';
import {
  Coordinates,
  PlaceSearchResult,
} from '../../shared/services/maps/maps.interface';

@Controller('gyms')
export class GymsController {
  constructor(private gymsService: GymsService) {}

  @Get('search')
  async searchGymsByAddress(
    @Query('address') address?: string,
    @Query('radius') radius?: string
  ): Promise<PlaceSearchResult[]> {
    const searchAddress = address?.trim();
    if (!searchAddress) {
      throw new BadRequestException('Address is required');
    }

    const searchRadius = this.parseRadius(radius, 5000);

    return this.gymsService.searchGymsByAddress(searchAddress, searchRadius);
  }

  @Get('nearby')
  async searchGymsNearby(
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('radius') radius?: string
  ): Promise<PlaceSearchResult[]> {
    const origin = this.parseRequiredCoordinates(latitude, longitude);
    const searchRadius = this.parseRadius(radius, 5000);

    return this.gymsService.searchGymsByCoordinates(
      origin.latitude,
      origin.longitude,
      searchRadius
    );
  }

  @Get('checked-users')
  async fetchCheckedUsersInMyGym(
    @Query('gymId') gymId: string,
    @Query('userId', ParseUUIDPipe) userId: string,
    @Headers('authorization') authorization?: string
  ) {
    const response = await this.gymsService.fetchCheckedUsersInMyGym(
      gymId,
      userId,
      authorization
    );
    return response;
  }

  @Get('active')
  async getActiveCheckIn(
    @Query('userId', ParseUUIDPipe) userId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.gymsService.getActiveCheckIn(userId, authorization);
  }

  @Post('checked-users/counts')
  async countCheckedInUsers(
    @Body('gymIds') gymIds: string[]
  ): Promise<Record<string, number>> {
    return this.gymsService.countCheckedInUsers(gymIds);
  }

  @Post('check-in')
  async checkIn(
    @Body('gymId') gymId: string,
    @Body('userId') userId: string | null | undefined,
    @Body('userName') name?: string
  ) {
    if (userId !== undefined && userId !== null) {
      await new ParseUUIDPipe().transform(userId, { type: 'body' });
    }
    const userInfo = { userId: userId ?? null, name: name?.trim() };
    return this.gymsService.checkIn(gymId, userInfo);
  }

  @Post('check-out')
  @HttpCode(204)
  async checkOut(
    @Body('userId', ParseUUIDPipe) userId: string,
    @Headers('authorization') authorization?: string
  ): Promise<void> {
    await this.gymsService.checkOut(userId, authorization);
  }

  @Get('music/status')
  musicStatus(
    @Query('userId', ParseUUIDPipe) userId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.gymsService.musicStatus(userId, authorization);
  }

  @Post('music/connect')
  connectMusic(
    @Body('userId', ParseUUIDPipe) userId: string,
    @Body('provider') provider: MusicProviderId,
    @Body('accessToken') accessToken: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.gymsService.connectMusic(
      userId,
      provider,
      accessToken,
      authorization
    );
  }

  @Post('music/resume')
  resumeMusic(
    @Body('userId', ParseUUIDPipe) userId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.gymsService.resumeMusic(userId, authorization);
  }

  @Post('music/disable')
  disableMusic(
    @Body('userId', ParseUUIDPipe) userId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.gymsService.disableMusic(userId, authorization);
  }

  @Post('music/disconnect')
  disconnectMusic(
    @Body('userId', ParseUUIDPipe) userId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.gymsService.disconnectMusic(userId, authorization);
  }

  private parseRequiredCoordinates(
    latitude?: string,
    longitude?: string
  ): Coordinates {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);

    if (
      latitude === undefined ||
      longitude === undefined ||
      !Number.isFinite(parsedLatitude) ||
      !Number.isFinite(parsedLongitude) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90 ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      throw new BadRequestException(
        'Valid latitude and longitude are required'
      );
    }

    return {
      latitude: parsedLatitude,
      longitude: parsedLongitude,
    };
  }

  private parseRadius(radius: string | undefined, fallback: number): number {
    if (radius === undefined) {
      return fallback;
    }

    const parsedRadius = Number(radius);
    if (
      !Number.isFinite(parsedRadius) ||
      parsedRadius <= 0 ||
      parsedRadius > 50_000
    ) {
      throw new BadRequestException(
        'Radius must be between 1 and 50000 meters'
      );
    }

    return parsedRadius;
  }
}
