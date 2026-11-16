import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PublicController } from './public.controller';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, PublicController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
