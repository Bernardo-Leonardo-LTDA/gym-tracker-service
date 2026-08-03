import {
  Body,
  Controller,
  Get,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { GymsService } from './gyms.service';
import { PlaceData } from '@googlemaps/google-maps-services-js';
import { User } from 'src/core/database/schema';

@Controller('gyms')
export class GymsController {
  constructor(private gymsService: GymsService) {}

  @Get('search')
  async searchGymsNearby(
    @Query('address') address: string,
    @Query('radius') radius?: number
  ): Promise<Partial<PlaceData>[]> {
    const response = await this.gymsService.searchGymsNearby(address, radius);
    return response;
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
    @Body('userId', ParseUUIDPipe) userId: string
  ): Promise<void> {
    await this.gymsService.checkIn(gymId, userId);
  }

  @Post('check-out')
  async checkOut(
    @Body('checkInId', ParseUUIDPipe) checkInId: string
  ): Promise<void> {
    await this.gymsService.checkOut(checkInId);
  }
}
