import {
  Controller,
  Headers,
  ParseUUIDPipe,
  Query,
  Sse,
} from '@nestjs/common';
import { GymsEventsService } from './gyms-events.service';

@Controller('gyms')
export class GymsEventsController {
  constructor(private readonly events: GymsEventsService) {}

  @Sse('events')
  stream(
    @Query('userId', ParseUUIDPipe) userId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.events.open(userId, authorization);
  }
}
