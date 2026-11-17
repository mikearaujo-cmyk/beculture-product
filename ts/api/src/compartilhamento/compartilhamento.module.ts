import { Global, Module } from '@nestjs/common';
import { AcessoModule } from '@/acesso/acesso.module';
import { CompartilhamentoController } from './compartilhamento.controller';
import { CompartilhamentoService } from './compartilhamento.service';
import { AcessoConteudoService } from './acesso-conteudo.service';
import { CapacidadesOrgService } from './capacidades-org.service';

/**
 * Global porque o vault, o RAG (/ai/prompt, planilha) e o Repositório da
 * organização consultam `AcessoConteudoService` e `CapacidadesOrgService` —
 * a autorização tem de ser a MESMA em todos eles.
 */
@Global()
@Module({
  imports: [AcessoModule],
  controllers: [CompartilhamentoController],
  providers: [
    CompartilhamentoService,
    AcessoConteudoService,
    CapacidadesOrgService,
  ],
  exports: [AcessoConteudoService, CapacidadesOrgService, CompartilhamentoService],
})
export class CompartilhamentoModule {}
