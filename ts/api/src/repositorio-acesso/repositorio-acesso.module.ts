import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RepositorioAcessoService } from './repositorio-acesso.service';
import { RepositorioAcessoInterceptor } from './repositorio-acesso.interceptor';

@Global()
@Module({
  providers: [
    RepositorioAcessoService,
    { provide: APP_INTERCEPTOR, useClass: RepositorioAcessoInterceptor },
  ],
  exports: [RepositorioAcessoService],
})
export class RepositorioAcessoModule {}
