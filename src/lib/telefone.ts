export function normalizarTelefone(telefone: string | null | undefined): string {
  if (!telefone) return "";
  const digits = telefone.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits;
}
