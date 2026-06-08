#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigarHorarios() {
  console.log('\n🔍 INVESTIGAÇÃO DE HORÁRIOS\n');
  console.log('=' .repeat(60));

  try {
    // 1. Verificar horários por data (10/06/2026)
    console.log('\n1️⃣ HORÁRIOS POR DATA (10/06/2026):\n');
    const { data: horariosPorData, error: e1 } = await supabase
      .from('horarios_data')
      .select('*')
      .eq('data', '2026-06-10')
      .order('horario');

    if (e1) console.error('❌ Erro:', e1);
    else if (horariosPorData.length === 0) {
      console.log('❌ NENHUM HORÁRIO ENCONTRADO em horarios_data para 2026-06-10');
    } else {
      console.log(`✅ ${horariosPorData.length} horário(s) encontrado(s):`);
      horariosPorData.forEach(h => {
        console.log(`   ${h.horario} - Ativo: ${h.ativo}`);
      });
    }

    // 2. Verificar template semanal (quarta = dia_semana 3)
    console.log('\n2️⃣ TEMPLATE SEMANAL (QUARTA-FEIRA = dia_semana 3):\n');
    const { data: templateSemanal, error: e2 } = await supabase
      .from('horarios_customizados')
      .select('*')
      .eq('dia_semana', 3)
      .eq('ativo', true)
      .order('horario');

    if (e2) console.error('❌ Erro:', e2);
    else if (templateSemanal.length === 0) {
      console.log('❌ NENHUM HORÁRIO encontrado no template para quarta-feira');
    } else {
      console.log(`✅ ${templateSemanal.length} horário(s) no template:`);
      templateSemanal.forEach(h => {
        console.log(`   ${h.horario}`);
      });
    }

    // 3. Verificar se quarta está ativa no calendário
    console.log('\n3️⃣ CONFIGURAÇÃO DO CALENDÁRIO (QUARTA-FEIRA):\n');
    const { data: configAgenda, error: e3 } = await supabase
      .from('configuracoes_agenda')
      .select('*')
      .eq('dia_semana', 3)
      .single();

    if (e3) {
      if (e3.code === 'PGRST116') {
        console.log('❌ NENHUMA CONFIGURAÇÃO encontrada para quarta-feira');
      } else {
        console.error('❌ Erro:', e3);
      }
    } else {
      console.log('✅ Configuração encontrada:');
      console.log(`   Dia da semana: ${configAgenda.dia_semana} (quarta)`);
      console.log(`   Ativo: ${configAgenda.ativo}`);
      console.log(`   Hora início: ${configAgenda.hora_inicio}`);
      console.log(`   Hora fim: ${configAgenda.hora_fim}`);
    }

    // 4. Verificar serviços
    console.log('\n4️⃣ SERVIÇOS CADASTRADOS:\n');
    const { data: servicos, error: e4 } = await supabase
      .from('servicos')
      .select('*')
      .eq('ativo', true);

    if (e4) console.error('❌ Erro:', e4);
    else if (servicos.length === 0) {
      console.log('❌ NENHUM SERVIÇO ATIVO encontrado');
    } else {
      console.log(`✅ ${servicos.length} serviço(s) ativo(s):`);
      servicos.forEach(s => {
        console.log(`   - ${s.nome}: ${s.duracao_minutos} minutos (R$ ${s.preco})`);
      });
    }

    // 5. Verificar se há bloqueios na data
    console.log('\n5️⃣ BLOQUEIOS PARA 10/06/2026:\n');
    const { data: bloqueios, error: e5 } = await supabase
      .from('bloqueios')
      .select('*')
      .eq('data', '2026-06-10');

    if (e5) console.error('❌ Erro:', e5);
    else if (bloqueios.length === 0) {
      console.log('✅ Nenhum bloqueio para esta data');
    } else {
      console.log(`⚠️ ${bloqueios.length} bloqueio(s) encontrado(s):`);
      bloqueios.forEach(b => {
        console.log(`   ${b.horario} - ${b.motivo || 'Sem motivo'}`);
      });
    }

    // 6. Verificar agendamentos para aquela data
    console.log('\n6️⃣ AGENDAMENTOS PARA 10/06/2026:\n');
    const { data: agendamentos, error: e6 } = await supabase
      .from('agendamentos')
      .select('*')
      .eq('data', '2026-06-10');

    if (e6) console.error('❌ Erro:', e6);
    else if (agendamentos.length === 0) {
      console.log('✅ Nenhum agendamento para esta data');
    } else {
      console.log(`⚠️ ${agendamentos.length} agendamento(s) encontrado(s):`);
      agendamentos.forEach(a => {
        console.log(`   ${a.horario} - Status: ${a.status}`);
      });
    }

    // 7. Diagnosticar o problema
    console.log('\n7️⃣ DIAGNÓSTICO:\n');
    console.log('=' .repeat(60));

    let diagnostico = [];

    if (horariosPorData.length === 0 && templateSemanal.length === 0) {
      diagnostico.push('❌ PROBLEMA CRÍTICO: Nenhum horário configurado!');
      diagnostico.push('   - Não há override em horarios_data');
      diagnostico.push('   - Não há template em horarios_customizados');
      diagnostico.push('\n   SOLUÇÃO: Adicionar horários manualmente ou usar gerar grade');
    }

    if (!configAgenda || !configAgenda.ativo) {
      diagnostico.push('❌ PROBLEMA: Quarta-feira está desativada!');
      diagnostico.push('   - A configuração_agenda para quarta-feira está inativa');
      diagnostico.push('\n   SOLUÇÃO: Ativar quarta-feira em configuracoes_agenda');
    }

    if (servicos.length === 0) {
      diagnostico.push('❌ PROBLEMA: Nenhum serviço cadastrado!');
      diagnostico.push('   - O cliente não pode agendar sem serviços');
      diagnostico.push('\n   SOLUÇÃO: Cadastrar serviços em admin/servicos');
    }

    if (servicos.some(s => !s.duracao_minutos || s.duracao_minutos === 0)) {
      diagnostico.push('⚠️ AVISO: Alguns serviços sem duração definida!');
      servicos.filter(s => !s.duracao_minutos || s.duracao_minutos === 0).forEach(s => {
        diagnostico.push(`   - ${s.nome}: ${s.duracao_minutos || 0} minutos`);
      });
      diagnostico.push('\n   SOLUÇÃO: Definir duracao_minutos > 0 para cada serviço');
    }

    if (diagnostico.length === 0) {
      diagnostico.push('✅ TUDO PARECE ESTAR CONFIGURADO CORRETAMENTE!');
      diagnostico.push('\n   Possíveis causas restantes:');
      diagnostico.push('   - Agenda está fechada (verificar agenda_aberta_manual)');
      diagnostico.push('   - Data está dentro do período de abertura (agenda_abertura_inicio/fim)');
      diagnostico.push('   - Problema no cliente ao fazer a requisição');
    }

    diagnostico.forEach(d => console.log(d));

    // 8. Verificar configurações gerais
    console.log('\n8️⃣ CONFIGURAÇÕES GERAIS:\n');
    const { data: config, error: e7 } = await supabase
      .from('configuracoes_app')
      .select('*')
      .limit(1)
      .single();

    if (e7) {
      console.log('⚠️ Nenhuma configuração geral encontrada');
    } else {
      console.log('✅ Configurações da app:');
      console.log(`   Agenda aberta manual: ${config.agenda_aberta_manual}`);
      console.log(`   Período de abertura: ${config.agenda_abertura_inicio} até ${config.agenda_abertura_fim}`);
      console.log(`   WhatsApp admin: ${config.whatsapp_admin}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Erro durante investigação:', error);
    process.exit(1);
  }
}

investigarHorarios();
