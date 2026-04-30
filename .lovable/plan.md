
## Plano de Melhorias — Barbearia Cardoso

### 1. Favicon de tesoura de barbeiro
- Gerar um ícone SVG de tesoura de barbeiro no estilo dourado/gold do tema
- Adicionar como favicon no `index.html`

### 2. Domingos permanecem na agenda
- Nenhuma alteração necessária — os domingos já estão configurados na agenda admin e podem ser ativados/desativados pelo Switch. Vou garantir que continuem funcionando normalmente.

### 3. Dashboard Admin — Exibir todos os serviços do agendamento
- Atualizar `AdminDashboard.tsx` para buscar e exibir os serviços da tabela `agendamento_servicos` (não só o `servico_id` direto)
- Layout lado a lado (calendário + lista) em desktop

### 4. Landing Page — Seção de serviços e preços
- Adicionar seção na `Index.tsx` que puxa os serviços ativos do banco e mostra nome + preço
- Adicionar informações de contato/endereço

### 5. WhatsApp — Fallback copiar mensagem
- Adicionar botão secundário "Copiar mensagem" na tela de sucesso, caso o `wa.me` não funcione no navegador

### 6. Meta tags e SEO
- Atualizar Open Graph image para algo personalizado da barbearia
- Ajustar meta tags existentes

### Arquivos afetados
- `index.html` — favicon
- `public/favicon.svg` — novo arquivo
- `src/pages/Index.tsx` — seção de serviços
- `src/pages/AdminDashboard.tsx` — layout e multi-serviço
- `src/pages/AgendamentoSucesso.tsx` — botão copiar mensagem
