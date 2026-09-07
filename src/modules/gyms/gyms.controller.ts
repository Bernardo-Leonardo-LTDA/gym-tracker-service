import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { GymsService } from './gyms.service';
import { User } from '../../core/database/schema';
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
    @Query('userId', ParseUUIDPipe) userId: string
  ): Promise<User[]> {
    const response = await this.gymsService.fetchCheckedUsersInMyGym(
      gymId,
      userId
    );
    return response;
  }

  @Post('check-in')
  async checkIn(
    @Body('gymId') gymId: string,
    @Body('userId', ParseUUIDPipe) userId: string | null,
    @Body('userName') name?: string
  ): Promise<User> {
    const userInfo = { userId, name };
    return this.gymsService.checkIn(gymId, userInfo);
  }

  @Post('check-out')
  @HttpCode(204)
  async checkOut(@Body('userId', ParseUUIDPipe) userId: string): Promise<void> {
    await this.gymsService.checkOut(userId);
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
