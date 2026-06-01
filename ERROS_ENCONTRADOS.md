# 📋 RELATÓRIO COMPLETO DE ERROS - GESTÃO DE AGENDA E HORÁRIOS

**Data da Análise:** 2026-06-01  
**Branch:** `verificacao`  
**Crítico/Total:** 8/22 erros encontrados

---

## 🔴 ERROS CRÍTICOS (8)

### 1. Lógica de `isAgendaAberta` invertida
**Arquivo:** `src/pages/Agendamento.tsx:14-22`  
**Severidade:** CRÍTICA  
**Impacto:** Agenda pode estar aberta quando deveria estar fechada e vice-versa

**Problema:**
```javascript
return !isBefore(hoje, d0) && !isAfter(hoje, d1);
```
A lógica está confusa. Deveria usar `isSameOrAfter` e `isSameOrBefore` do date-fns ou operadores mais claros.

**Solução:** Refatorar com função clara
```javascript
return !isBefore(hoje, d0) && !isAfter(hoje, d1);
// Melhor:
return !isBefore(hoje, d0) && isSameOrBefore(hoje, d1);
```

---

### 2. `hora_fim` ignorado no Admin
**Arquivo:** `src/pages/AdminHorarios.tsx:40-109`  
**Severidade:** CRÍTICA  
**Impacto:** Admin vê horários que cliente não vê; confusão de sincronização

**Problema:** AdminHorarios não valida `configuracoes_agenda.hora_fim`. Cliente valida em `supabase-helpers.ts:160-165`.

**Solução:** Adicionar mesma validação ao buscar slots no Admin.

---

### 3. Inconsistência de formato de hora (5 vs 8 caracteres)
**Arquivo:** Múltiplos arquivos  
**Severidade:** CRÍTICA  
**Impacto:** Horários duplicados, não aparecem, ou conflitos errados

**Problema:** Banco armazena TIME (`HH:MM:SS`), mas código manipula como `HH:MM`.
```javascript
const timeStr = horario.length === 5 ? `${horario}:00` : horario;
```
Comparações `.slice(0, 5)` são espalhadas por todo o código.

**Solução:** Criar função `formatTime()` centralizada e usar em todo lugar.

---

### 4. Falta de validação: dias "ativos" sem horários
**Arquivo:** `src/components/WeekPicker.tsx:45-51`  
**Severidade:** CRÍTICA  
**Impacto:** Cliente seleciona dia "ativo" mas vê "Nenhum horário disponível"

**Problema:** Verifica apenas `configuracoes_agenda.ativo`, não se há horários em `horarios_customizados` ou `horarios_data`.

**Solução:** Validar também existência de horários ao desabilitar dias.

---

### 5. Bloqueios ocultos na visão Admin
**Arquivo:** `src/pages/AdminHorarios.tsx:547`  
**Severidade:** CRÍTICA  
**Impacto:** Admin não consegue ver/gerenciar bloqueios da data

**Problema:**
```javascript
{slots.filter((s) => s.status !== "bloqueado").map((s) => (
```

**Solução:** Mostrar bloqueios na lista com status visual diferente.

---

### 6. Agendamento sem serviços causa fallback arbitrário
**Arquivo:** `src/lib/supabase-helpers.ts:63-64`  
**Severidade:** CRÍTICA  
**Impacto:** Lógica de conflito inconsistente, double-booking possível

**Problema:**
```javascript
if (totalDuration === 0) totalDuration = 15; // ❌ Arbitrário!
```

**Solução:** Exigir sempre serviços ao criar agendamento.

---

### 7. Timezone: `new Date(date + "T12:00:00").getDay()` não é confiável
**Arquivo:** `src/lib/supabase-helpers.ts:106, 120` e outros  
**Severidade:** CRÍTICA  
**Impacto:** Em timezones negativos (ex: PST), `.getDay()` retorna dia anterior

**Problema:** Concatenação de string com "T12:00:00" assume UTC, mas navegador pode interpretar local.

**Solução:** Usar `parseISO()` do date-fns ou UTC-safe parsing.

---

### 8. AdminAgenda não trata erros ao buscar configs iniciais
**Arquivo:** `src/pages/AdminAgenda.tsx:34-36`  
**Severidade:** CRÍTICA  
**Impacto:** Se query falhar, UI fica vazia sem feedback

**Problema:**
```javascript
useEffect(() => {
  supabase.from("configuracoes_agenda").select("*").order("dia_semana").then(({ data }) => {
    if (data) setConfigs(data as any);
  });
}, []);
```

**Solução:** Usar `useQuery` com tratamento de erro.

---

## 🟡 ERROS ALTOS (8)

### 9. Múltiplas chamadas `.slice(0, 5)` sem validação null
**Arquivo:** 30+ locais  
**Severidade:** ALTA  
**Impacto:** Potencial crash se valor for null/undefined

**Solução:** Centralizar `formatTime()` + usar optional chaining.

---

### 10. Horário em tempo de execução manipulado como string
**Arquivo:** Vários  
**Severidade:** ALTA  
**Impacto:** Difícil manutenção, bugs com comparação

**Solução:** Criar classe/type `Time` com parsing/formatting.

---

### 11. Falta validação: `hora_fim` < `hora_inicio`
**Arquivo:** `src/pages/AdminAgenda.tsx` (campo hora_fim)  
**Severidade:** ALTA  
**Impacto:** Admin pode configurar horário inválido (fim antes de início)

**Solução:** Validar na UI e no backend antes de salvar.

---

### 12. Cliente vê agendamentos "expirados" que Admin criou
**Arquivo:** `src/lib/supabase-helpers.ts:231`  
**Severidade:** ALTA  
**Impacto:** Confusão no rastreamento de agendamentos

**Problema:** Expira em 30 minutos, mas se Admin cria "manualmente", pode estar já expirado.

**Solução:** Exigir confirmação imediata de agendamentos do Admin ou não setar expiração.

---

### 13. `expira_em` não é consultado em `AdminAgenda`
**Arquivo:** `src/pages/AdminAgenda.tsx:42-54`  
**Severidade:** ALTA  
**Impacto:** Admin não vê quando agendamento vai expirar

**Solução:** Mostrar countdown visual.

---

### 14. Cache de React Query não atualizado automaticamente para cliente
**Arquivo:** Admin invalida cache, mas cliente faz query independente  
**Severidade:** ALTA  
**Impacto:** Admin cria agendamento, cliente vê stale slots

**Solução:** Usar Supabase realtime subscriptions.

---

### 15. Formato de telefone não padronizado
**Arquivo:** `src/pages/AgendamentoDados.tsx:50` vs `src/lib/supabase-helpers.ts:229`  
**Severidade:** ALTA  
**Impacto:** Duplicação de clientes por variação de formato

**Solução:** Normalizar sempre ao mesmo formato.

---

### 16. Ordem de cards inconsistente entre admin e cliente
**Arquivo:** Várias pages  
**Severidade:** MÉDIA-ALTA  
**Impacto:** UX confusa

**Solução:** Padronizar ordem de renderização.

---

## 🟢 PROBLEMAS MÉDIOS (6)

### 17. Sem validação de intervalo mínimo entre agendamentos
**Severidade:** MÉDIA  
**Impacto:** Admin pode agendar 08:00-08:05 e 08:05-08:15 (conflito potencial)

---

### 18. Bloqueios podem conflitar com agendamentos (race condition)
**Severidade:** MÉDIA  
**Impacto:** Simultâneamente bloqueado e agendado possível

---

### 19. Sem limite de quantidade de serviços por agendamento
**Severidade:** MÉDIA  
**Impacto:** Cliente pode agendar 20 serviços de 60 min = 1200 min (20h!)

---

### 20. Mensagens de erro genéricas ("Erro ao X")
**Severidade:** MÉDIA  
**Impacto:** Difícil debug para suporte

---

### 21. Sem auditoria: quem criou/modificou agendamento
**Severidade:** MÉDIA  
**Impacto:** Rastreabilidade perdida

---

### 22. Componente `TimeSlotGrid` não mostra motivo por que está indisponível
**Severidade:** MÉDIA  
**Impacto:** Cliente não sabe se é bloqueio, agendamento, ou fora do expediente

---

## 📊 RESUMO

| Severidade | Quantidade | % |
|-----------|-----------|-----|
| 🔴 Crítica | 8 | 36% |
| 🟡 Alta | 8 | 36% |
| 🟢 Média | 6 | 28% |
| **TOTAL** | **22** | **100%** |

---

## 🔧 PLANO DE AÇÃO

### Fase 1: Correções Críticas (Esta branch)
- [ ] Corrigir `isAgendaAberta` 
- [ ] Validar `hora_fim` no Admin
- [ ] Centralizar `formatTime()`
- [ ] Validar horários antes de mostrar picker
- [ ] Mostrar bloqueios no Admin
- [ ] Exigir serviços em agendamentos
- [ ] Corrigir timezone parsing
- [ ] Adicionar `useQuery` para configs no Admin

### Fase 2: Melhorias Altas (PR separada)
- [ ] Criar tipo `Time` com parsing seguro
- [ ] Validação `hora_fim > hora_inicio`
- [ ] Revisar lógica de expiração
- [ ] Implementar Supabase realtime
- [ ] Normalizar telefone

### Fase 3: Melhorias Médias (PR separada)
- [ ] Adicionar validação de intervalo mínimo
- [ ] Implementar auditoria
- [ ] Melhorar mensagens de erro
- [ ] Adicionar limite de serviços
- [ ] Explicar motivo de indisponibilidade em TimeSlotGrid

---
