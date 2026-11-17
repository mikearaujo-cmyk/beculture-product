import { Global, Module } from '@nestjs/common';
import { AcessoModule } from '@/acesso/acesso.module';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaController } from './auditoria.controller';

@Global()
@Module({
  imports: [AcessoModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
