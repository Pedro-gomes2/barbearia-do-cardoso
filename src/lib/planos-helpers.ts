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

export interface AssinaturaAdmin {
  id: string;
  clienteNome: string;
  clienteTelefone: string;
  planoNome: string;
  criadoEm: string;
  creditosRestantes?: number;
  expiraEm?: string;
}

export async function listAssinaturasPendentes(): Promise<AssinaturaAdmin[]> {
  const { data, error } = await supabase
    .from("assinaturas_planos")
    .select("id, criado_em, usuarios(nome, telefone), planos(nome)")
    .eq("status", "pendente_pagamento")
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data || []).map((a: any) => ({
    id: a.id,
    clienteNome: a.usuarios?.nome || "Cliente",
    clienteTelefone: a.usuarios?.telefone || "",
    planoNome: a.planos?.nome || "",
    criadoEm: a.criado_em,
  }));
}

export async function listAssinaturasAtivas(): Promise<AssinaturaAdmin[]> {
  const { data, error } = await supabase
    .from("assinaturas_planos")
    .select("id, criado_em, expira_em, creditos_restantes, usuarios(nome, telefone), planos(nome)")
    .eq("status", "ativo")
    .order("expira_em", { ascending: true });
  if (error) throw error;
  return (data || []).map((a: any) => ({
    id: a.id,
    clienteNome: a.usuarios?.nome || "Cliente",
    clienteTelefone: a.usuarios?.telefone || "",
    planoNome: a.planos?.nome || "",
    criadoEm: a.criado_em,
    creditosRestantes: a.creditos_restantes,
    expiraEm: a.expira_em,
  }));
}

export async function aprovarPlano(assinaturaId: string): Promise<void> {
  const { error } = await supabase.rpc("aprovar_plano", { _assinatura_id: assinaturaId });
  if (error) throw error;
}

export async function rejeitarPlano(assinaturaId: string): Promise<void> {
  const { error } = await supabase.rpc("rejeitar_plano", { _assinatura_id: assinaturaId });
  if (error) throw error;
}

export interface PlanoAdmin {
  id: string;
  nome: string;
  preco: number;
  ativo: boolean;
  servico_ids: string[];
}

export async function listPlanosAdmin(): Promise<PlanoAdmin[]> {
  const { data: planos, error } = await supabase
    .from("planos")
    .select("id, nome, preco, ativo")
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
    ativo: p.ativo,
    servico_ids: (vinculos || [])
      .filter((v: any) => v.plano_id === p.id)
      .map((v: any) => v.servico_id),
  }));
}

export async function upsertPlano(plano: {
  id?: string;
  nome: string;
  preco: number;
  ativo: boolean;
}): Promise<string> {
  if (plano.id) {
    const { error } = await supabase
      .from("planos")
      .update({ nome: plano.nome, preco: plano.preco, ativo: plano.ativo })
      .eq("id", plano.id);
    if (error) throw error;
    return plano.id;
  }
  const { data, error } = await supabase
    .from("planos")
    .insert({ nome: plano.nome, preco: plano.preco, ativo: plano.ativo })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function setPlanoServicos(planoId: string, servicoIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from("plano_servicos")
    .delete()
    .eq("plano_id", planoId);
  if (deleteError) throw deleteError;

  if (servicoIds.length === 0) return;

  const rows = servicoIds.map((sid) => ({ plano_id: planoId, servico_id: sid }));
  const { error: insertError } = await supabase.from("plano_servicos").insert(rows);
  if (insertError) throw insertError;
}
