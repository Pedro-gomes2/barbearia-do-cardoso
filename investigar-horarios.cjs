const fs = require('fs');
const path = require('path');

// Ler .env
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};

envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    const value = valueParts.join('=').trim();
    env[key.trim()] = value;
  }
});

const SUPABASE_URL = env['VITE_SUPABASE_URL'];
const SUPABASE_KEY = env['VITE_SUPABASE_ANON_KEY'];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variáveis não encontradas');
  process.exit(1);
}

console.log('\n🔍 INVESTIGAÇÃO DE HORÁRIOS');
console.log('='.repeat(60) + '\n');

// Helper para requisições
async function query(table, filters = '') {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  if (filters) url += filters;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return null;
    }

    return await response.json();
  } catch (e) {
    return null;
  }
}

async function main() {
  let horariosData = null;
  let templateSemanal = null;
  let configAgenda = null;
  let servicos = null;
  let bloqueios = null;
  let agendamentos = null;
  let configApp = null;

  // 1. Horários por data
  console.log('1️⃣ VERIFICANDO: Horários para 10/06/2026...');
  horariosData = await query('horarios_data', '&data=eq.2026-06-10&ativo=eq.true&order=horario');

  if (!horariosData) {
    console.log('   ❌ Não foi possível buscar (tabela vazia ou erro)');
  } else if (horariosData.length === 0) {
    console.log('   ❌ NENHUM HORÁRIO encontrado em horarios_data');
  } else {
    console.log(`   ✅ ${horariosData.length} horário(s) encontrado(s):`);
    horariosData.forEach(h => console.log(`      - ${h.horario}`));
  }

  // 2. Template semanal
  console.log('\n2️⃣ VERIFICANDO: Template para quarta-feira (dia 3)...');
  templateSemanal = await query('horarios_customizados', '&dia_semana=eq.3&ativo=eq.true&order=horario');

  if (!templateSemanal) {
    console.log('   ❌ Não foi possível buscar (tabela vazia ou erro)');
  } else if (templateSemanal.length === 0) {
    console.log('   ❌ NENHUM HORÁRIO no template para quarta-feira');
  } else {
    console.log(`   ✅ ${templateSemanal.length} horário(s) no template:`);
    templateSemanal.forEach(h => console.log(`      - ${h.horario}`));
  }

  // 3. Configuração agenda
  console.log('\n3️⃣ VERIFICANDO: Configuração de quarta-feira...');
  configAgenda = await query('configuracoes_agenda', '&dia_semana=eq.3');

  if (!configAgenda || configAgenda.length === 0) {
    console.log('   ❌ NENHUMA CONFIGURAÇÃO para quarta-feira');
  } else {
    const cfg = configAgenda[0];
    const ativo = cfg.ativo ? '✅' : '❌';
    console.log(`   ${ativo} Ativo: ${cfg.ativo}`);
    console.log(`      Hora: ${cfg.hora_inicio} até ${cfg.hora_fim}`);
  }

  // 4. Serviços
  console.log('\n4️⃣ VERIFICANDO: Serviços cadastrados...');
  servicos = await query('servicos', '&ativo=eq.true&order=nome');

  if (!servicos) {
    console.log('   ❌ Não foi possível buscar serviços');
  } else if (servicos.length === 0) {
    console.log('   ❌ NENHUM SERVIÇO ATIVO');
  } else {
    console.log(`   ✅ ${servicos.length} serviço(s):`);
    servicos.forEach(s => {
      const duracao = s.duracao_minutos > 0 ? '✅' : '❌';
      console.log(`      ${duracao} ${s.nome}: ${s.duracao_minutos}min (R$ ${s.preco})`);
    });
  }

  // 5. Bloqueios
  console.log('\n5️⃣ VERIFICANDO: Bloqueios para 10/06/2026...');
  bloqueios = await query('bloqueios', '&data=eq.2026-06-10');

  if (!bloqueios) {
    console.log('   ❌ Não foi possível buscar bloqueios');
  } else if (bloqueios.length === 0) {
    console.log('   ✅ Nenhum bloqueio para esta data');
  } else {
    console.log(`   ⚠️ ${bloqueios.length} bloqueio(s):`);
    bloqueios.forEach(b => console.log(`      - ${b.horario}: ${b.motivo || 'N/A'}`));
  }

  // 6. Agendamentos
  console.log('\n6️⃣ VERIFICANDO: Agendamentos para 10/06/2026...');
  agendamentos = await query('agendamentos', '&data=eq.2026-06-10');

  if (!agendamentos) {
    console.log('   ❌ Não foi possível buscar agendamentos');
  } else if (agendamentos.length === 0) {
    console.log('   ✅ Nenhum agendamento para esta data');
  } else {
    console.log(`   ⚠️ ${agendamentos.length} agendamento(s):`);
    agendamentos.forEach(a => console.log(`      - ${a.horario}: ${a.status}`));
  }

  // 7. Configurações gerais
  console.log('\n7️⃣ VERIFICANDO: Configurações gerais da app...');
  configApp = await query('configuracoes_app');

  if (!configApp || configApp.length === 0) {
    console.log('   ❌ Nenhuma configuração geral');
  } else {
    const cfg = configApp[0];
    const agendaAberta = cfg.agenda_aberta_manual ? '✅' : '❌';
    console.log(`   ${agendaAberta} Agenda aberta manual: ${cfg.agenda_aberta_manual}`);
    console.log(`      Período: ${cfg.agenda_abertura_inicio} até ${cfg.agenda_abertura_fim}`);
  }

  // Diagnóstico
  console.log('\n' + '='.repeat(60));
  console.log('📋 DIAGNÓSTICO:');
  console.log('='.repeat(60) + '\n');

  const problemas = [];

  if (!horariosData || horariosData.length === 0) {
    if (!templateSemanal || templateSemanal.length === 0) {
      problemas.push('❌ CRÍTICO: Nenhum horário configurado!');
      problemas.push('   Solução: Adicionar horários manualmente no admin');
    }
  }

  if (configAgenda && configAgenda.length > 0) {
    if (!configAgenda[0].ativo) {
      problemas.push('❌ CRÍTICO: Quarta-feira está desativada!');
      problemas.push('   Solução: Ativar em Configurações > Calendário');
    }
  } else {
    problemas.push('⚠️ Aviso: Sem configuração para quarta-feira');
  }

  if (!servicos || servicos.length === 0) {
    problemas.push('❌ CRÍTICO: Nenhum serviço cadastrado!');
    problemas.push('   Solução: Adicionar serviços em admin/servicos');
  }

  if (servicos && servicos.some(s => !s.duracao_minutos || s.duracao_minutos === 0)) {
    problemas.push('⚠️ Aviso: Serviços sem duração definida');
    problemas.push('   Solução: Definir duracao_minutos > 0');
  }

  if (configApp && configApp.length > 0) {
    if (!configApp[0].agenda_aberta_manual) {
      const inicio = configApp[0].agenda_abertura_inicio;
      const fim = configApp[0].agenda_abertura_fim;
      const hoje = new Date().toISOString().split('T')[0];

      if (hoje < inicio || hoje > fim) {
        problemas.push('⚠️ Aviso: Agenda fora do período de abertura');
        problemas.push(`   Período atual: ${inicio} até ${fim}`);
      }
    }
  }

  if (problemas.length === 0) {
    console.log('✅ TUDO PARECE ESTAR BEM CONFIGURADO!');
    console.log('\nO problema pode estar em:');
    console.log('  - Cache do navegador (limpe e recarregue)');
    console.log('  - Duração total do serviço > hora_fim');
    console.log('  - Agendamentos que conflitam com horários');
  } else {
    console.log('PROBLEMAS ENCONTRADOS:\n');
    problemas.forEach(p => console.log(p));
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

main().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
