import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PasswordPolicyService } from './password-policy.service';
import { PinHasherService } from './pin-hasher.service';
import { TotpService } from './totp.service';
import { TokenService } from './token.service';
import { RateLimiterService } from './rate-limiter.service';
import { AuditSecurityService } from './audit-security.service';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    PasswordPolicyService,
    PinHasherService,
    TotpService,
    TokenService,
    RateLimiterService,
    AuditSecurityService,
  ],
  exports: [
    PasswordPolicyService,
    PinHasherService,
    TotpService,
    TokenService,
    RateLimiterService,
    AuditSecurityService,
  ],
})
export class SecurityModule {}

