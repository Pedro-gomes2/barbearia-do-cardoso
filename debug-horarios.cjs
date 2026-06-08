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
      return null;
    }

    return await response.json();
  } catch (e) {
    return null;
  }
}

async function debug() {
  console.log('\n🔍 DEBUG: Verificando dados para 10/06/2026 (Quarta-feira)\n');
  console.log('='.repeat(60) + '\n');

  // 1. Verificar horários cadastrados
  console.log('1️⃣ HORÁRIOS CADASTRADOS:');
  const horarios = await query('horarios_customizados', '&dia_semana=eq.3&order=horario');

  if (!horarios) {
    console.log('   ❌ Erro ao buscar');
  } else if (horarios.length === 0) {
    console.log('   ❌ NENHUM HORÁRIO ENCONTRADO!');
    console.log('   ⚠️ As queries SQL NÃO foram executadas!');
  } else {
    console.log(`   ✅ ${horarios.length} horário(s) encontrado(s):`);
    horarios.forEach(h => {
      console.log(`      - ${h.horario} (Ativo: ${h.ativo})`);
    });
  }

  // 2. Verificar configuração
  console.log('\n2️⃣ CONFIGURAÇÃO DE QUARTA-FEIRA:');
  const config = await query('configuracoes_agenda', '&dia_semana=eq.3');

  if (!config || config.length === 0) {
    console.log('   ❌ NÃO CONFIGURADO');
  } else {
    const cfg = config[0];
    console.log(`   ${cfg.ativo ? '✅' : '❌'} Ativo: ${cfg.ativo}`);
    console.log(`      Horário: ${cfg.hora_inicio} até ${cfg.hora_fim}`);
  }

  // 3. Verificar serviços
  console.log('\n3️⃣ SERVIÇOS:');
  const servicos = await query('servicos', '&ativo=eq.true');

  if (!servicos || servicos.length === 0) {
    console.log('   ❌ NENHUM SERVIÇO ATIVO');
  } else {
    console.log(`   ✅ ${servicos.length} serviço(s):`);
    servicos.forEach(s => {
      console.log(`      - ${s.nome}: ${s.duracao_minutos}min (R$ ${s.preco})`);
    });
  }

  // 4. Debugar a lógica
  console.log('\n' + '='.repeat(60));
  console.log('\n🔍 DIAGNÓSTICO DA LÓGICA:\n');

  if (horarios && horarios.length > 0 && config && config.length > 0) {
    if (!config[0].ativo) {
      console.log('❌ PROBLEMA: Quarta-feira está INATIVA!');
      console.log('   Solução: Ativar em configuracoes_agenda');
    } else if (servicos && servicos.length > 0) {
      const h = horarios[0];
      console.log('✅ TUDO PARECE OK:');
      console.log(`   - Quarta-feira está ATIVA`);
      console.log(`   - ${horarios.length} horário(s) disponível(s)`);
      console.log(`   - ${servicos.length} serviço(s) com duração`);
      console.log('\n   Possíveis causas ainda:');
      console.log('   1. Cache do navegador (limpe com Ctrl+Shift+Delete)');
      console.log('   2. Erro na requisição ao cliente');
      console.log('   3. Duração do serviço > hora_fim');
    }
  } else {
    console.log('❌ FALTAM DADOS:');
    if (!horarios || horarios.length === 0) {
      console.log('   - Horários NÃO foram inseridos');
      console.log('   - EXECUTE AS QUERIES SQL!');
    }
    if (!config || config.length === 0) {
      console.log('   - Quarta-feira NÃO foi configurada');
      console.log('   - EXECUTE A QUERY 1!');
    }
    if (!servicos || servicos.length === 0) {
      console.log('   - Serviços NÃO foram criados');
      console.log('   - EXECUTE A QUERY 2!');
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

debug().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
