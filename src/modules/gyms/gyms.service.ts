import { PlaceData } from '@googlemaps/google-maps-services-js';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from 'src/core/database/schema';
import { DRIZZLE_PROVIDER } from 'src/core/database/database.provider';
import { MapsService } from 'src/shared/services/maps/maps.service';
import { eq, and, gt } from 'drizzle-orm';

@Injectable()
export class GymsService {
  constructor(
    @Inject(DRIZZLE_PROVIDER) private db: PostgresJsDatabase<typeof schema>,
    private mapsService: MapsService
  ) {}

  async searchGymsNearby(
    address: string,
    radius = 1500
  ): Promise<Partial<PlaceData>[]> {
    const { lat, lng } = await this.mapsService.geocodeAddress(address);
    if (!lat || !lng) {
      throw new NotFoundException('Failed to geocode address');
    }

    const gyms = await this.mapsService.nearbySearch(lat, lng, radius, 'gym');
    return gyms;
  }

  async checkIn(gymId: string, userId: string): Promise<void> {
    const userExists = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!userExists) {
      throw new NotFoundException('User not found');
    }

    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

    const recentCheckin = await this.db
      .select()
      .from(schema.checkins)
      .where(
        and(
          eq(schema.checkins.userId, userId),
          gt(schema.checkins.createdAt, oneHourAgo)
        )
      );

    if (recentCheckin.length > 0) {
      throw new BadRequestException(
        'User has already checked in within the last hour'
      );
    }

    await this.db
      .insert(schema.checkins)
      .values({ externalPlaceId: gymId, userId });

    console.log(`User ${userId} checked in to gym ${gymId}`);
  }
}
