# 🧪 GUIA DE TESTES - BRANCH `verificacao`

**Objetivo:** Validar as correções de erros críticos na gestão de agenda

---

## ✅ CHECKLIST DE TESTES

### 1. 🕐 Função `isAgendaAberta` - Validar período correto

**Localização:** `src/pages/Agendamento.tsx`

**Teste 1a: Agenda aberta dentro do período**
- Admin configura: Agenda abre 2026-06-01, fecha 2026-06-30
- Data atual: 2026-06-15 (dentro do período)
- ✅ Esperado: Cliente vê "AGENDE SEU HORÁRIO"

**Teste 1b: Agenda fechada (antes do período)**
- Admin configura: Agenda abre 2026-06-20, fecha 2026-06-30
- Data atual: 2026-06-15 (antes de abrir)
- ✅ Esperado: Cliente vê "AGENDA FECHADA"

**Teste 1c: Agenda fechada (depois do período)**
- Admin configura: Agenda abre 2026-05-01, fecha 2026-05-30
- Data atual: 2026-06-15 (depois de fechar)
- ✅ Esperado: Cliente vê "AGENDA FECHADA"

---

### 2. ⏰ Validação `hora_fim > hora_inicio` em AdminAgenda

**Localização:** `src/pages/AdminAgenda.tsx` > Configurações

**Teste 2a: Horário válido**
- Admin tenta salvar: Abertura 08:00, Fechamento 18:00
- ✅ Esperado: Salva com sucesso, toast "Configurações salvas!"

**Teste 2b: Horário inválido (fim = início)**
- Admin tenta salvar: Abertura 08:00, Fechamento 08:00
- ✅ Esperado: Toast de erro "Hora de fechamento deve ser posterior"

**Teste 2c: Horário inválido (fim < início)**
- Admin tenta salvar: Abertura 18:00, Fechamento 08:00
- ✅ Esperado: Toast de erro "Hora de fechamento deve ser posterior"

---

### 3. 🗓️ WeekPicker valida dias sem horários

**Localização:** `src/pages/Agendamento.tsx` > WeekPicker

**Teste 3a: Dia ativo COM horários configurados**
- Admin configura: Segunda-feira ativa com horários (08:00, 09:00, 10:00)
- Cliente tenta agendar
- ✅ Esperado: Segunda-feira está HABILITADA, mostra horários

**Teste 3b: Dia ativo SEM horários configurados**
- Admin configura: Terça-feira ativa mas sem horários
- Cliente tenta agendar
- ✅ Esperado: Terça-feira está DESABILITADA (cinza)

**Teste 3c: Dia inativo**
- Admin configura: Domingo desativado
- Cliente tenta agendar
- ✅ Esperado: Domingo está DESABILITADO (cinza)

---

### 4. 📅 Timezone-safe: `getDayOfWeek()` funciona em todos os timezones

**Localização:** `src/lib/time-utils.ts`

**Teste 4a: Data em timezone Brasil**
- Browser em timezone America/Sao_Paulo
- Função: `getDayOfWeek("2026-06-01")`
- ✅ Esperado: Retorna 1 (segunda-feira)

**Teste 4b: Data em timezone negativo (PST)**
- Browser em timezone America/Los_Angeles
- Função: `getDayOfWeek("2026-06-01")`
- ✅ Esperado: Retorna 1 (segunda-feira) - NÃO 0 (domingo)

**Teste 4c: Consistência entre cliente e admin**
- Cliente seleciona data 2026-06-15 (segunda)
- Admin vê mesma data como segunda
- ✅ Esperado: Ambos veem o mesmo dia

---

### 5. 🎨 Centralização formatação de hora (time-utils)

**Localização:** `src/lib/time-utils.ts`

**Teste 5a: `formatTimeDisplay()` com HH:MM:SS**
```javascript
formatTimeDisplay("14:30:00")
✅ Esperado: "14:30"
```

**Teste 5b: `formatTimeDisplay()` com HH:MM**
```javascript
formatTimeDisplay("14:30")
✅ Esperado: "14:30"
```

**Teste 5c: `formatTimeDisplay()` com null**
```javascript
formatTimeDisplay(null)
✅ Esperado: ""
```

**Teste 5d: `normalizeTimeInput()` com entrada válida**
```javascript
normalizeTimeInput("14:30")
✅ Esperado: "14:30:00"
```

**Teste 5e: `normalizeTimeInput()` com entrada inválida**
```javascript
normalizeTimeInput("25:00")
✅ Esperado: null
```

---

### 6. 🔄 AdminAgenda com tratamento de erro

**Localização:** `src/pages/AdminAgenda.tsx`

**Teste 6a: Carregamento bem-sucedido**
- Admin acessa /admin/agenda
- ✅ Esperado: Lista dias com configurações carrega, mostra "ATIVO/INATIVO"

**Teste 6b: Erro na query (simular)**
- Supabase temporariamente indisponível
- ✅ Esperado: "Carregando configurações..." aparece, sem crash

---

### 7. 🎯 AdminHorarios valida `hora_fim` (sync com cliente)

**Localização:** `src/pages/AdminHorarios.tsx`

**Teste 7a: Admin vê horários dentro do expediente**
- Configuração: Segunda, 08:00-18:00
- Admin seleciona segunda
- Horários 08:00 a 17:30 aparecem
- ✅ Esperado: Todos os horários aparecem

**Teste 7b: Admin NÃO vê horários fora do expediente**
- Configuração: Segunda, 08:00-18:00
- Horário configurado 19:00 existe no BD
- ✅ Esperado: 19:00 NÃO aparece para admin

**Teste 7c: Cliente vê mesmos horários que Admin**
- Cliente seleciona mesma data/serviço
- ✅ Esperado: Cliente vê exatamente mesmos horários que admin

---

### 8. 📊 Formato de horário consistente

**Localização:** Múltiplos arquivos

**Teste 8a: AdminGerenciarHorarios salva e exibe corretamente**
- Admin adiciona horário "14:30"
- Admin vê "14:30" em chip
- ✅ Esperado: Sem `.slice()` erros ou horários duplicados

**Teste 8b: HorariosDiaSemana exibe horários corretamente**
- Horários gerados (08:00-18:00, intervalo 30min)
- ✅ Esperado: Exibição "08:00", "08:30", "09:00"... sem duplicatas

**Teste 8c: TimeSlotGrid exibe horários corretamente**
- Cliente seleciona data com 5 horários
- ✅ Esperado: Grid mostra 5 botões sem duplicação

---

## 🔗 FLUXO DE TESTE COMPLETO

### Cenário: Agendar um corte na Segunda-feira

1. **Admin**
   - Acessa `/admin/agenda`
   - Verifica Segunda-feira está ATIVA ✅
   - Vê campo Abertura 08:00 ✅
   - Vê campo Fechamento 18:00 ✅
   - Tenta 19:00 (fora do horário) → SALVA não deveria funcionar ❌ (se funcionar, bug)
   - Acessa `/admin/gerenciar-horarios`
   - Vê horários de segunda: 08:00, 09:00, 10:00...

2. **Cliente**
   - Acessa `/agendamento`
   - Seleciona próxima segunda (se dentro do período)
   - ✅ Esperado: Segunda está HABILITADA
   - Seleciona serviço "Corte" (30 minutos)
   - Clica "Horários"
   - ✅ Esperado: Vê mesmos horários que admin viu (08:00 até 17:30, não 18:00 ou 19:00)

3. **Sincronização**
   - Admin cria encaixe em 10:00
   - ✅ Esperado: Cliente vê 10:00 indisponível

---

## 📋 TESTES AUTOMATIZADOS RECOMENDADOS

```typescript
// src/lib/time-utils.test.ts
describe('time-utils', () => {
  describe('getDayOfWeek', () => {
    it('should return correct day for given date', () => {
      expect(getDayOfWeek('2026-06-01')).toBe(1); // Monday
    });
  });

  describe('normalizeTimeInput', () => {
    it('should accept HH:MM format', () => {
      expect(normalizeTimeInput('14:30')).toBe('14:30:00');
    });
    it('should reject invalid times', () => {
      expect(normalizeTimeInput('25:00')).toBe(null);
    });
  });

  describe('formatTimeDisplay', () => {
    it('should format TIME to HH:MM', () => {
      expect(formatTimeDisplay('14:30:00')).toBe('14:30');
    });
  });
});
```

---

## 🐛 CHECKLIST DE BUGS A EVITAR

- [ ] Horários duplicados após salvar
- [ ] Horários fora do expediente aparecendo
- [ ] Crash ao tentar salvar horário inválido
- [ ] Cliente vendo horários diferentes do admin
- [ ] Dias desabilitados sem motivo
- [ ] Timezone causing wrong day selection
- [ ] `.slice()` errors em null values

---

## ✨ RESULTADO ESPERADO

Após passar todos os testes:
- ✅ Sem erros de console
- ✅ Build passa
- ✅ Cliente e Admin sincronizados
- ✅ Validações funcionam
- ✅ Tratamento de erro em AdminAgenda

---

**Status:** Pronto para QA
