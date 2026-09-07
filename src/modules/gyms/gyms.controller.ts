import {
  Body,
  Controller,
  Get,
  HttpCode,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { GymsService } from './gyms.service';
import { PlaceData } from '@googlemaps/google-maps-services-js';
import { User } from '../../core/database/schema';

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

  @Post('checked-users/counts')
  async countCheckedInUsers(
    @Body('gymIds') gymIds: string[]
  ): Promise<Record<string, number>> {
    return this.gymsService.countCheckedInUsers(gymIds);
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
}
