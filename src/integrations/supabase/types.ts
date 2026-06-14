export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamento_servicos: {
        Row: {
          agendamento_id: string
          criado_em: string
          id: string
          servico_id: string
        }
        Insert: {
          agendamento_id: string
          criado_em?: string
          id?: string
          servico_id: string
        }
        Update: {
          agendamento_id?: string
          criado_em?: string
          id?: string
          servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_servicos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_servicos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          cancel_token: string
          cliente_id: string
          criado_em: string
          data: string
          horario: string
          id: string
          servico_id: string | null
          status: Database["public"]["Enums"]["agendamento_status"]
          telefone_cliente: string | null
        }
        Insert: {
          cancel_token?: string
          cliente_id: string
          criado_em?: string
          data: string
          horario: string
          id?: string
          servico_id?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          telefone_cliente?: string | null
        }
        Update: {
          cancel_token?: string
          cliente_id?: string
          criado_em?: string
          data?: string
          horario?: string
          id?: string
          servico_id?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          telefone_cliente?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      bloqueios: {
        Row: {
          criado_em: string
          data: string
          horario: string
          id: string
          motivo: string | null
        }
        Insert: {
          criado_em?: string
          data: string
          horario: string
          id?: string
          motivo?: string | null
        }
        Update: {
          criado_em?: string
          data?: string
          horario?: string
          id?: string
          motivo?: string | null
        }
        Relationships: []
      }
      configuracoes_agenda: {
        Row: {
          ativo: boolean
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          intervalo_minutos: number
        }
        Insert: {
          ativo?: boolean
          dia_semana: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_minutos?: number
        }
        Update: {
          ativo?: boolean
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_minutos?: number
        }
        Relationships: []
      }
      configuracoes_app: {
        Row: {
          agenda_abertura_fim: string | null
          agenda_abertura_hora: string | null
          agenda_abertura_inicio: string | null
          agenda_aberta_manual: boolean
          agenda_fechamento_hora: string | null
          atualizado_em: string
          data_agenda_aberta: string | null
          id: string
          pix_chave: string | null
          pix_cidade: string | null
          pix_nome_titular: string | null
          whatsapp_admin: string | null
        }
        Insert: {
          agenda_abertura_fim?: string | null
          agenda_abertura_hora?: string | null
          agenda_abertura_inicio?: string | null
          agenda_aberta_manual?: boolean
          agenda_fechamento_hora?: string | null
          atualizado_em?: string
          data_agenda_aberta?: string | null
          id?: string
          pix_chave?: string | null
          pix_cidade?: string | null
          pix_nome_titular?: string | null
          whatsapp_admin?: string | null
        }
        Update: {
          agenda_abertura_fim?: string | null
          agenda_abertura_hora?: string | null
          agenda_abertura_inicio?: string | null
          agenda_aberta_manual?: boolean
          agenda_fechamento_hora?: string | null
          atualizado_em?: string
          data_agenda_aberta?: string | null
          id?: string
          pix_chave?: string | null
          pix_cidade?: string | null
          pix_nome_titular?: string | null
          whatsapp_admin?: string | null
        }
        Relationships: []
      }
      fila_atendimento: {
        Row: {
          atualizado_em: string
          cliente_id: string
          criado_em: string
          data: string
          id: string
          posicao: number
          servico_id: string | null
          status: Database["public"]["Enums"]["fila_status"]
        }
        Insert: {
          atualizado_em?: string
          cliente_id: string
          criado_em?: string
          data: string
          id?: string
          posicao: number
          servico_id?: string | null
          status?: Database["public"]["Enums"]["fila_status"]
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string
          criado_em?: string
          data?: string
          id?: string
          posicao?: number
          servico_id?: string | null
          status?: Database["public"]["Enums"]["fila_status"]
        }
        Relationships: []
      }
      fila_config: {
        Row: {
          aberta: boolean
          criado_em: string
          data: string
          hora_abertura: string
          hora_fechamento: string
          id: string
        }
        Insert: {
          aberta?: boolean
          criado_em?: string
          data: string
          hora_abertura?: string
          hora_fechamento?: string
          id?: string
        }
        Update: {
          aberta?: boolean
          criado_em?: string
          data?: string
          hora_abertura?: string
          hora_fechamento?: string
          id?: string
        }
        Relationships: []
      }
      horarios_customizados: {
        Row: {
          ativo: boolean
          criado_em: string
          dia_semana: number
          horario: string
          id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          dia_semana: number
          horario: string
          id?: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          dia_semana?: number
          horario?: string
          id?: string
        }
        Relationships: []
      }
      horarios_data: {
        Row: {
          ativo: boolean
          criado_em: string
          data: string
          horario: string
          id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          data: string
          horario: string
          id?: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          data?: string
          horario?: string
          id?: string
        }
        Relationships: []
      }
      servicos: {
        Row: {
          ativo: boolean
          criado_em: string
          duracao_minutos: number
          id: string
          nome: string
          ordem: number
          preco: number
          tipo: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          duracao_minutos?: number
          id?: string
          nome: string
          ordem?: number
          preco?: number
          tipo?: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          duracao_minutos?: number
          id?: string
          nome?: string
          ordem?: number
          preco?: number
          tipo?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          criado_em: string
          id: string
          nome: string
          telefone: string
          tipo: Database["public"]["Enums"]["user_tipo"]
        }
        Insert: {
          criado_em?: string
          id?: string
          nome: string
          telefone: string
          tipo?: Database["public"]["Enums"]["user_tipo"]
        }
        Update: {
          criado_em?: string
          id?: string
          nome?: string
          telefone?: string
          tipo?: Database["public"]["Enums"]["user_tipo"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancelar_agendamento_por_telefone: {
        Args: { _agendamento_id: string; _telefone: string }
        Returns: boolean
      }
    }
    Enums: {
      agendamento_status: "ativo" | "cancelado" | "finalizado"
      fila_status: "aguardando" | "atendendo" | "finalizado" | "cancelado"
      user_tipo: "cliente" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agendamento_status: ["ativo", "cancelado", "finalizado"],
      fila_status: ["aguardando", "atendendo", "finalizado", "cancelado"],
      user_tipo: ["cliente", "admin"],
    },
  },
} as const
