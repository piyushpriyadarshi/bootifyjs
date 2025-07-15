import { BaseEvent, DeadLetterEvent } from '../types/event.types';
import { Event } from '../decorators/event.decorators';

@Event('system.event.dead_letter')
export class SystemDeadLetterEvent implements DeadLetterEvent {
  id!: string;
  type = 'system.event.dead_letter';
  timestamp!: Date;
  version = 1;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, any>;
  
  // Dead letter specific properties
  originalEvent!: BaseEvent;
  failedEventData!: string;
  error!: string;
  subscriptionId!: string;

  constructor(data?: Partial<SystemDeadLetterEvent>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}