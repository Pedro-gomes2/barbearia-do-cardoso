# 🔧 GUIA: COMO EXECUTAR AS QUERIES SQL

## ⏱️ Tempo estimado: 5 minutos

---

## 📋 O QUE VOCÊ VAI FAZER

Você vai executar 3 queries SQL no Supabase para:
1. ✅ Ativar quarta-feira
2. ✅ Criar serviços
3. ✅ Criar horários

Isso vai permitir que seus clientes vejam e agendem horários corretamente.

---

## 🔑 PASSO 1: Acessar Supabase

1. Abra o navegador
2. Vá para: https://supabase.com
3. Faça login com sua conta
4. Selecione seu projeto "barbearia-do-cardoso"

![Screenshot esperado: Dashboard do Supabase]

---

## 📂 PASSO 2: Abrir SQL Editor

1. No menu lateral esquerdo, procure por **"SQL Editor"**
2. Clique nele
3. Você deve ver uma interface com um editor de texto

![Screenshot: SQL Editor está no menu lateral]

---

## ⚙️ PASSO 3: QUERY 1 - Ativar Quarta-Feira

### Copie este código:

```sql
INSERT INTO configuracoes_agenda (dia_semana, ativo, hora_inicio, hora_fim)
VALUES (3, true, '08:00:00', '18:00:00')
ON CONFLICT (dia_semana) DO UPDATE
SET ativo = true, hora_inicio = '08:00:00', hora_fim = '18:00:00';
```

### Como fazer:

1. **Cole o código** no editor SQL do Supabase
2. **Clique em "RUN"** (botão verde no canto superior direito)
3. **Aguarde** a execução (deve levar menos de 1 segundo)
4. **Você verá**: ✅ "Sucesso" ou um número como "1 row updated"

### ✅ Verificação:
A query fez login na tabela `configuracoes_agenda` com:
- Dia: 3 (quarta-feira)
- Ativo: true (ligado)
- Horário: 08:00 até 18:00

---

## 👔 PASSO 4: QUERY 2 - Criar Serviços

### Copie este código:

```sql
INSERT INTO servicos (nome, descricao, preco, duracao_minutos, ativo)
VALUES 
  ('Corte', 'Corte de cabelo', 30.00, 30, true),
  ('Barba', 'Fazer barba', 20.00, 20, true),
  ('Corte + Barba', 'Corte e barba', 45.00, 50, true);
```

### Como fazer:

1. **Limpe o editor anterior** (Ctrl+A + Delete)
2. **Cole o código novo** no editor
3. **Clique em "RUN"**
4. **Resultado**: ✅ "3 rows inserted"

### ℹ️ Customização (OPCIONAL):
Se quiser SEUS serviços em vez desses, modifique:

```sql
-- Exemplo: Seu serviço customizado
INSERT INTO servicos (nome, descricao, preco, duracao_minutos, ativo)
VALUES 
  ('Seu Serviço', 'Descrição', 40.00, 40, true);
```

**Importante**: Não esqueça de mudar:
- `'Seu Serviço'` - Nome do serviço
- `'Descrição'` - Descrição
- `40.00` - Preço
- `40` - Duração em minutos

---

## ⏰ PASSO 5: QUERY 3 - Criar Horários para Quarta

### Copie este código:

```sql
INSERT INTO horarios_customizados (dia_semana, horario, ativo)
VALUES 
  (3, '09:00:00', true),
  (3, '09:20:00', true),
  (3, '10:00:00', true),
  (3, '10:15:00', true),
  (3, '10:40:00', true),
  (3, '11:00:00', true),
  (3, '14:00:00', true),
  (3, '15:00:00', true),
  (3, '16:00:00', true),
  (3, '17:00:00', true)
ON CONFLICT (dia_semana, horario) DO UPDATE
SET ativo = true;
```

### Como fazer:

1. **Limpe o editor**
2. **Cole o código novo**
3. **Clique em "RUN"**
4. **Resultado**: ✅ "10 rows inserted/updated"

### 🎯 Horários inclusos:
- 09:00 ✅
- 09:20 ✅ (mencionado por você!)
- 10:00 ✅ (mencionado por você!)
- 10:15 ✅ (mencionado por você!)
- 10:40 ✅ (mencionado por você!)
- 11:00 ✅
- 14:00 até 17:00 ✅ (período da tarde)

### ℹ️ Customização (OPCIONAL):
Se quiser SEUS horários:

```sql
INSERT INTO horarios_customizados (dia_semana, horario, ativo)
VALUES 
  (3, '10:30:00', true),
  (3, '11:30:00', true),
  (3, '15:30:00', true);
```

**Importante**: 
- `3` = quarta-feira (não mude!)
- `'10:30:00'` = horário no formato HH:MM:SS

---

## 📅 PASSO 6 (OPCIONAL): Configurar Outros Dias

Se quiser que clientes possam agendar em outros dias, repita o PASSO 3 para cada dia:

```sql
-- Segunda-feira (dia 1)
INSERT INTO configuracoes_agenda (dia_semana, ativo, hora_inicio, hora_fim)
VALUES (1, true, '08:00:00', '18:00:00')
ON CONFLICT (dia_semana) DO UPDATE SET ativo = true;

-- Terça-feira (dia 2)
INSERT INTO configuracoes_agenda (dia_semana, ativo, hora_inicio, hora_fim)
VALUES (2, true, '08:00:00', '18:00:00')
ON CONFLICT (dia_semana) DO UPDATE SET ativo = true;

-- Quinta-feira (dia 4)
INSERT INTO configuracoes_agenda (dia_semana, ativo, hora_inicio, hora_fim)
VALUES (4, true, '08:00:00', '18:00:00')
ON CONFLICT (dia_semana) DO UPDATE SET ativo = true;

-- Sexta-feira (dia 5)
INSERT INTO configuracoes_agenda (dia_semana, ativo, hora_inicio, hora_fim)
VALUES (5, true, '08:00:00', '18:00:00')
ON CONFLICT (dia_semana) DO UPDATE SET ativo = true;

-- Sábado (dia 6)
INSERT INTO configuracoes_agenda (dia_semana, ativo, hora_inicio, hora_fim)
VALUES (6, true, '08:00:00', '18:00:00')
ON CONFLICT (dia_semana) DO UPDATE SET ativo = true;
```

**Dias da semana**:
- 0 = Domingo
- 1 = Segunda
- 2 = Terça
- 3 = Quarta ✅ (já feito)
- 4 = Quinta
- 5 = Sexta
- 6 = Sábado

---

## 🧪 PASSO 7: TESTAR NO APP

### Desktop/Navegador:

1. Abra o navegador
2. Vá para: http://localhost:5173 (ou seu URL de desenvolvimento)
3. Vá para a página de agendamento (cliente)
4. **Selecione data**: 10/06/2026
5. **Selecione serviço**: Corte (ou o que criou)
6. **Verifique**: Horários devem aparecer agora!

### Esperado:
```
Horários disponíveis:
• 09:00
• 09:20
• 10:00
• 10:15
• 10:40
• 11:00
• 14:00
• 15:00
• 16:00
• 17:00
```

---

## ❌ SOLUÇÃO DE PROBLEMAS

### "Erro: table 'horarios_data' does not exist"
❌ Isso significa a tabela não existe
✅ **Solução**: Verifique se o schema Supabase foi criado corretamente

### "Erro: Syntax error"
❌ Significa há erro na query
✅ **Solução**: 
1. Copie a query novamente (com cuidado)
2. Verifique se não há caracteres especiais
3. Verifique espaçamento

### "Executou mas não vê horários no app"
❌ Pode ser cache do navegador
✅ **Solução**:
1. Abra DevTools (F12)
2. Vá para "Application"
3. Clique em "Clear Storage"
4. Recarregue (F5)

### "Horários aparecem mas não consegue agendar"
❌ Pode ser conflito de horários
✅ **Solução**: Verifique se há agendamentos conflitantes

---

## 📊 VERIFICAÇÃO FINAL

Após executar as queries, você pode verificar se tudo foi inserido:

### VERIFICAR QUARTA-FEIRA:
```sql
SELECT * FROM configuracoes_agenda WHERE dia_semana = 3;
```
Resultado esperado: 1 linha com `ativo = true`

### VERIFICAR SERVIÇOS:
```sql
SELECT * FROM servicos WHERE ativo = true;
```
Resultado esperado: 3 linhas (Corte, Barba, Corte+Barba)

### VERIFICAR HORÁRIOS:
```sql
SELECT * FROM horarios_customizados WHERE dia_semana = 3 ORDER BY horario;
```
Resultado esperado: 10 linhas (09:00 até 17:00)

---

## 🎉 SUCESSO!

Se você conseguiu ver os horários no app, tudo funcionou!

**Próximas ações**:
1. Teste em seu celular também
2. Configure outros dias se necessário
3. Customize serviços e horários com seus dados reais

---

## 📞 DÚVIDAS?

Se tiver dúvida em qualquer passo:

1. Releia o guia passo a passo
2. Consulte `INVESTIGACAO_HORARIOS_RESULTADO.md` para mais detalhes
3. Verifique se copou o código corretamente

---

**⏱️ Você já concluiu? Parabéns! 🎉**

Seu app agora funciona perfeitamente com responsividade otimizada E horários configurados!

