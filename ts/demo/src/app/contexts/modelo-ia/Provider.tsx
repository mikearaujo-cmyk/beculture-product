/**
 * Modelo escolhido nos seletores das ações de IA — estado ÚNICO por conta.
 *
 * Estilo Adapta: o último modelo escolhido em qualquer ação passa a vir
 * selecionado em todas as outras (por modalidade: texto, imagem, vídeo), até o
 * usuário trocar de novo. A escolha é gravada no servidor
 * (`PUT /conta/modelos/ultimo`), então vale também em outra sessão.
 *
 * Sem servidor ou sem opções, `modelo` fica `undefined` e as ações seguem sem
 * enviar modelo (o backend usa a ordem da fila).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getModelosConta,
  salvarUltimoModelo,
  type KindModelo,
  type ModelosConta,
} from "@/services/api/modalidade";
import { publicarModeloAtual } from "@/utils/modeloAtual";
import { ModeloIaContext } from "./context";

export function ModeloIaProvider({ children }: { children: ReactNode }) {
  const [modelos, setModelos] = useState<ModelosConta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    getModelosConta()
      .then((m) => vivo && setModelos(m))
      .catch(() => vivo && setModelos(null))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  // As opções mudam fora desta tela (catálogo do Backoffice, fila da conta,
  // migração de plano): relê ao voltar para a janela. O seletor também relê
  // ao abrir o menu (ver SeletorModelo).
  useEffect(() => {
    const aoFocar = () => setTentativa((n) => n + 1);
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, []);

  // Publica a seleção para quem está fora do React (interceptor do axios e
  // streaming do chat), que anexam o modelo às requisições de ação de IA.
  useEffect(() => {
    for (const kind of ["text", "image", "video"] as const) {
      publicarModeloAtual(kind, modelos?.[kind]?.selecionado);
    }
  }, [modelos]);

  const escolher = useCallback((kind: KindModelo, id: string) => {
    // Otimista: todas as ações já passam a mostrar o novo modelo.
    setModelos((prev) =>
      prev ? { ...prev, [kind]: { ...prev[kind], selecionado: id } } : prev,
    );
    salvarUltimoModelo(kind, id)
      .then(setModelos)
      .catch(() => {
        /* fica a escolha local; o servidor valida a cada chamada */
      });
  }, []);

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  const value = useMemo(
    () => ({ modelos, carregando, escolher, recarregar }),
    [modelos, carregando, escolher, recarregar],
  );
  return (
    <ModeloIaContext.Provider value={value}>
      {children}
    </ModeloIaContext.Provider>
  );
}
