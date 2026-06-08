#!/usr/bin/env node

// Script para investigar horários no banco Supabase
// Use: node investigar-horarios.mjs

import fs from 'fs';
import path from 'path';

// Ler variáveis de ambiente do .env
const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};

envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    env[key.trim()] = value.trim();
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente não encontradas no .env');
  process.exit(1);
}

console.log('\n🔍 INVESTIGAÇÃO DE HORÁRIOS\n');
console.log('='.repeat(60));

// Helper para fazer requisições ao Supabase
async function querySupabase(table, filters = []) {
  let url = `${supabaseUrl}/rest/v1/${table}?select=*`;

  filters.forEach(filter => {
    url += `&${filter.key}=${filter.op}.${filter.value}`;
  });

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar ${table}: ${response.statusText}`);
  }

  return response.json();
}

async function investigarHorarios() {
  try {
    // 1. Horários por data
    console.log('\n1️⃣ HORÁRIOS POR DATA (10/06/2026):\n');
    try {
      const horariosPorData = await querySupabase('horarios_data', [
        { key: 'data', op: 'eq', value: '2026-06-10' }
      ]);

      if (horariosPorData.length === 0) {
        console.log('❌ NENHUM HORÁRIO em horarios_data para 2026-06-10');
      } else {
        console.log(`✅ ${horariosPorData.length} horário(s):`);
        horariosPorData.forEach(h => {
          console.log(`   ${h.horario} - Ativo: ${h.ativo}`);
        });
      }
    } catch (e) {
      console.log('⚠️ Não foi possível consultar horarios_data');
    }

    // 2. Template semanal
    console.log('\n2️⃣ TEMPLATE SEMANAL (QUARTA = dia_semana 3):\n');
    try {
      const templateSemanal = await querySupabase('horarios_customizados', [
        { key: 'dia_semana', op: 'eq', value: '3' },
        { key: 'ativo', op: 'eq', value: 'true' }
      ]);

      if (templateSemanal.length === 0) {
        console.log('❌ NENHUM HORÁRIO no template para quarta-feira');
      } else {
        console.log(`✅ ${templateSemanal.length} horário(s):`);
        templateSemanal.forEach(h => {
          console.log(`   ${h.horario}`);
        });
      }
    } catch (e) {
      console.log('⚠️ Não foi possível consultar horarios_customizados');
    }

    // 3. Configuração agenda
    console.log('\n3️⃣ CONFIGURAÇÃO DO CALENDÁRIO (QUARTA-FEIRA):\n');
    try {
      const configAgenda = await querySupabase('configuracoes_agenda', [
        { key: 'dia_semana', op: 'eq', value: '3' }
      ]);

      if (configAgenda.length === 0) {
        console.log('❌ NENHUMA CONFIGURAÇÃO para quarta-feira');
      } else {
        const cfg = configAgenda[0];
        console.log('✅ Configuração encontrada:');
        console.log(`   Ativo: ${cfg.ativo}`);
        console.log(`   Hora início: ${cfg.hora_inicio}`);
        console.log(`   Hora fim: ${cfg.hora_fim}`);
      }
    } catch (e) {
      console.log('⚠️ Não foi possível consultar configuracoes_agenda');
    }

    // 4. Serviços
    console.log('\n4️⃣ SERVIÇOS CADASTRADOS:\n');
    try {
      const servicos = await querySupabase('servicos', [
        { key: 'ativo', op: 'eq', value: 'true' }
      ]);

      if (servicos.length === 0) {
        console.log('❌ NENHUM SERVIÇO ATIVO');
      } else {
        console.log(`✅ ${servicos.length} serviço(s):`);
        servicos.forEach(s => {
          console.log(`   - ${s.nome}: ${s.duracao_minutos}min (R$ ${s.preco})`);
        });
      }
    } catch (e) {
      console.log('⚠️ Não foi possível consultar servicos');
    }

    // 5. Bloqueios
    console.log('\n5️⃣ BLOQUEIOS PARA 10/06/2026:\n');
    try {
      const bloqueios = await querySupabase('bloqueios', [
        { key: 'data', op: 'eq', value: '2026-06-10' }
      ]);

      if (bloqueios.length === 0) {
        console.log('✅ Nenhum bloqueio para esta data');
      } else {
        console.log(`⚠️ ${bloqueios.length} bloqueio(s):`);
        bloqueios.forEach(b => {
          console.log(`   ${b.horario} - ${b.motivo || 'Sem motivo'}`);
        });
      }
    } catch (e) {
      console.log('⚠️ Não foi possível consultar bloqueios');
    }

    // 6. Agendamentos
    console.log('\n6️⃣ AGENDAMENTOS PARA 10/06/2026:\n');
    try {
      const agendamentos = await querySupabase('agendamentos', [
        { key: 'data', op: 'eq', value: '2026-06-10' }
      ]);

      if (agendamentos.length === 0) {
        console.log('✅ Nenhum agendamento para esta data');
      } else {
        console.log(`⚠️ ${agendamentos.length} agendamento(s):`);
        agendamentos.forEach(a => {
          console.log(`   ${a.horario} - Status: ${a.status}`);
        });
      }
    } catch (e) {
      console.log('⚠️ Não foi possível consultar agendamentos');
    }

    // 7. Configurações gerais
    console.log('\n7️⃣ CONFIGURAÇÕES GERAIS:\n');
    try {
      const config = await querySupabase('configuracoes_app');

      if (config.length > 0) {
        const cfg = config[0];
        console.log('✅ Configurações encontradas:');
        console.log(`   Agenda aberta manual: ${cfg.agenda_aberta_manual}`);
        console.log(`   Período: ${cfg.agenda_abertura_inicio} até ${cfg.agenda_abertura_fim}`);
      } else {
        console.log('❌ Nenhuma configuração geral');
      }
    } catch (e) {
      console.log('⚠️ Não foi possível consultar configuracoes_app');
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📋 CHECKLIST DE PROBLEMAS:');
    console.log('='.repeat(60) + '\n');

    console.log('✓ Se todos os itens abaixo estão verdes, o problema está resolvido!');
    console.log('✓ Se algum está vermelho, siga as instruções de solução.\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

investigarHorarios();
