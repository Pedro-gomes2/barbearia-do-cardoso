import { supabase } from "@/integrations/supabase/client";

export class AssinaturaExistenteError extends Error {
  constructor() {
    super("Já existe uma solicitação de plano em andamento para esse telefone.");
    this.name = "AssinaturaExistenteError";
  }
}

export interface PlanoPublico {
  id: string;
  nome: string;
  preco: number;
  servico_ids: string[];
}

export async function listPlanosPublicos(): Promise<PlanoPublico[]> {
  const { data: planos, error } = await supabase
    .from("planos")
    .select("id, nome, preco")
    .eq("ativo", true)
    .order("preco", { ascending: false });
  if (error) throw error;
  if (!planos || planos.length === 0) return [];

  const { data: vinculos, error: vinculosError } = await supabase
    .from("plano_servicos")
    .select("plano_id, servico_id")
    .in("plano_id", planos.map((p: any) => p.id));
  if (vinculosError) throw vinculosError;

  return planos.map((p: any) => ({
    id: p.id,
    nome: p.nome,
    preco: Number(p.preco),
    servico_ids: (vinculos || [])
      .filter((v: any) => v.plano_id === p.id)
      .map((v: any) => v.servico_id),
  }));
}

export async function solicitarPlano(
  nome: string,
  telefone: string,
  planoId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("solicitar_plano", {
    _nome: nome,
    _telefone: telefone,
    _plano_id: planoId,
  });
  if (error) {
    if (error.message?.includes("ASSINATURA_EXISTENTE")) {
      throw new AssinaturaExistenteError();
    }
    throw error;
  }
  return data as string;
}

export interface PlanoAtivoInfo {
  assinaturaId: string;
  planoNome: string;
  creditosRestantes: number;
  expiraEm: string;
  servicoIds: string[];
}

export async function getPlanoAtivoPorTelefone(telefone: string): Promise<PlanoAtivoInfo | null> {
  const { data, error } = await supabase.rpc("get_plano_ativo_por_telefone", {
    _telefone: telefone,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    assinaturaId: row.assinatura_id,
    planoNome: row.plano_nome,
    creditosRestantes: row.creditos_restantes,
    expiraEm: row.expira_em,
    servicoIds: row.servico_ids || [],
  };
}
