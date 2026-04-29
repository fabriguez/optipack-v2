import 'reflect-metadata';
import { container } from 'tsyringe';
import { SSHService, SSH_SERVICE } from './infrastructure/ssh/SSHService';
import { DockerService, DOCKER_SERVICE } from './infrastructure/docker/DockerService';
import { CaddyService, CADDY_SERVICE } from './infrastructure/caddy/CaddyService';
import { ScpService, SCP_SERVICE } from './infrastructure/ssh/ScpService';
import { StripeProvider } from './infrastructure/billing/StripeProvider';
import { MobileMoneyProvider } from './infrastructure/billing/MobileMoneyProvider';
import { GHCRClient } from './infrastructure/ghcr/GHCRClient';
import { NotificationService } from './infrastructure/notifications/NotificationService';
import { MetricsService } from './infrastructure/metrics/MetricsService';

container.register(SSH_SERVICE, { useClass: SSHService });
container.register(DOCKER_SERVICE, { useClass: DockerService });
container.register(CADDY_SERVICE, { useClass: CaddyService });
container.register(SCP_SERVICE, { useClass: ScpService });
// Billing providers (singleton-ish, instancies a la resolution)
container.registerSingleton(StripeProvider);
container.registerSingleton(MobileMoneyProvider);
container.registerSingleton(GHCRClient);
container.registerSingleton(NotificationService);
container.registerSingleton(MetricsService);

export { container };
