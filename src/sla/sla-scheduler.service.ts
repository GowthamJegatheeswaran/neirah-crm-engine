import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SlaProcessorService } from './sla-processor.service';

/**
 * Runs the SLA processor on a timer. A plain setInterval is enough here (no extra dependency):
 * the processor already protects itself against overlapping runs and against other app instances.
 *
 * Off when SCHEDULER_ENABLED=false, and always off under tests (NODE_ENV=test), where tests
 * call POST /sla/run themselves so that demo data is never touched behind their back.
 */
@Injectable()
export class SlaSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaSchedulerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly processor: SlaProcessorService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const enabled = this.config.get<string>('SCHEDULER_ENABLED', 'true') === 'true';
    if (!enabled || this.config.get<string>('NODE_ENV') === 'test') {
      this.logger.log('SLA scheduler is off');
      return;
    }
    const seconds = this.config.get<number>('SLA_CHECK_INTERVAL_SECONDS', 60);
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref(); // never keeps the process alive on its own
    this.logger.log(`SLA scheduler started: every ${seconds}s`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      await this.processor.run();
    } catch (err) {
      // A failed pass must never kill the timer: the next tick simply tries again.
      this.logger.error('SLA run failed', err instanceof Error ? err.stack : String(err));
    }
  }
}
