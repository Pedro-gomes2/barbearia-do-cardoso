export interface Produto {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  imagem_url: string | null;
  ativo: boolean;
  criado_em: string;
}
