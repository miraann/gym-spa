export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          branch_id: string | null;
          changed_columns: string[] | null;
          device_id: string | null;
          id: string;
          ip: unknown;
          new_values: Json | null;
          occurred_at: string;
          old_values: Json | null;
          row_id: string;
          table_name: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          branch_id?: string | null;
          changed_columns?: string[] | null;
          device_id?: string | null;
          id?: string;
          ip?: unknown;
          new_values?: Json | null;
          occurred_at?: string;
          old_values?: Json | null;
          row_id: string;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          branch_id?: string | null;
          changed_columns?: string[] | null;
          device_id?: string | null;
          id?: string;
          ip?: unknown;
          new_values?: Json | null;
          occurred_at?: string;
          old_values?: Json | null;
          row_id?: string;
          table_name?: string;
        };
        Relationships: [];
      };
      branches: {
        Row: {
          address: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          id: string;
          is_active: boolean;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          phone: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          address?: string | null;
          code: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          phone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          address?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          phone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      device_status: {
        Row: {
          app_version: string | null;
          device_id: string;
          last_seen_at: string;
          last_seen_by: string | null;
          pending_changes: number;
          pending_since: string | null;
        };
        Insert: {
          app_version?: string | null;
          device_id: string;
          last_seen_at: string;
          last_seen_by?: string | null;
          pending_changes?: number;
          pending_since?: string | null;
        };
        Update: {
          app_version?: string | null;
          device_id?: string;
          last_seen_at?: string;
          last_seen_by?: string | null;
          pending_changes?: number;
          pending_since?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'device_status_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: true;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
        ];
      };
      devices: {
        Row: {
          branch_id: string;
          code: string;
          created_at: string;
          created_by: string | null;
          default_language: Database['public']['Enums']['language_code'] | null;
          deleted_at: string | null;
          id: string;
          is_active: boolean;
          name: string;
          platform: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          branch_id: string;
          code: string;
          created_at?: string;
          created_by?: string | null;
          default_language?: Database['public']['Enums']['language_code'] | null;
          deleted_at?: string | null;
          id: string;
          is_active?: boolean;
          name: string;
          platform: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          default_language?: Database['public']['Enums']['language_code'] | null;
          deleted_at?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          platform?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions: {
        Row: {
          created_at: string;
          key: string;
          module: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          key: string;
          module: string;
          sort_order: number;
        };
        Update: {
          created_at?: string;
          key?: string;
          module?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          permission_key: string;
          role_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          permission_key: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          permission_key?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_permission_key_fkey';
            columns: ['permission_key'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['key'];
          },
          {
            foreignKeyName: 'role_permissions_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          id: string;
          is_system: boolean;
          key: string | null;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          is_system?: boolean;
          key?: string | null;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          is_system?: boolean;
          key?: string | null;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          branch_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: NonNullable<Json>;
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: NonNullable<Json>;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'settings_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_branches: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          staff_id: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          staff_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_branches_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_branches_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_pins: {
        Row: {
          algorithm: string;
          created_at: string;
          created_by: string | null;
          hash: string;
          iterations: number;
          salt: string;
          staff_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          algorithm: string;
          created_at?: string;
          created_by?: string | null;
          hash: string;
          iterations: number;
          salt: string;
          staff_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          algorithm?: string;
          created_at?: string;
          created_by?: string | null;
          hash?: string;
          iterations?: number;
          salt?: string;
          staff_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_pins_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: true;
            referencedRelation: 'staff_users';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_users: {
        Row: {
          all_branches: boolean;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          must_change_password: boolean;
          phone: string | null;
          preferred_language: Database['public']['Enums']['language_code'] | null;
          role_id: string;
          updated_at: string;
          updated_by: string | null;
          username: string;
        };
        Insert: {
          all_branches?: boolean;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          full_name: string;
          id: string;
          is_active?: boolean;
          must_change_password?: boolean;
          phone?: string | null;
          preferred_language?: Database['public']['Enums']['language_code'] | null;
          role_id: string;
          updated_at?: string;
          updated_by?: string | null;
          username: string;
        };
        Update: {
          all_branches?: boolean;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          must_change_password?: boolean;
          phone?: string | null;
          preferred_language?: Database['public']['Enums']['language_code'] | null;
          role_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_users_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      device_heartbeat: {
        Args: {
          p_app_version: string;
          p_device_id: string;
          p_pending_changes: number;
          p_pending_since: string;
        };
        Returns: undefined;
      };
      register_device: {
        Args: {
          p_branch_id: string;
          p_default_language?: Database['public']['Enums']['language_code'];
          p_device_id: string;
          p_name: string;
          p_platform: string;
        };
        Returns: {
          branch_id: string;
          code: string;
          created_at: string;
          created_by: string | null;
          default_language: Database['public']['Enums']['language_code'] | null;
          deleted_at: string | null;
          id: string;
          is_active: boolean;
          name: string;
          platform: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'devices';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reset_staff_pin: { Args: { p_staff_id: string }; Returns: undefined };
    };
    Enums: {
      language_code: 'ckb' | 'en' | 'ar';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      language_code: ['ckb', 'en', 'ar'],
    },
  },
} as const;
