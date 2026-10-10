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
          gym_id: string | null;
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
          gym_id?: string | null;
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
          gym_id?: string | null;
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
          gym_id: string;
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
          gym_id?: string;
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
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          phone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'branches_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
      };
      device_status: {
        Row: {
          app_version: string | null;
          device_id: string;
          gym_id: string;
          last_seen_at: string;
          last_seen_by: string | null;
        };
        Insert: {
          app_version?: string | null;
          device_id: string;
          gym_id?: string;
          last_seen_at: string;
          last_seen_by?: string | null;
        };
        Update: {
          app_version?: string | null;
          device_id?: string;
          gym_id?: string;
          last_seen_at?: string;
          last_seen_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'device_status_device_id_gym_id_fkey';
            columns: ['device_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'gym_id'];
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
          gym_id: string;
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
          gym_id?: string;
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
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          platform?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      gyms: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          edition: string;
          id: string;
          locked_at: string | null;
          max_branches: number | null;
          max_devices: number | null;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          paid_until: string | null;
          suspended_at: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          edition?: string;
          id?: string;
          locked_at?: string | null;
          max_branches?: number | null;
          max_devices?: number | null;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          paid_until?: string | null;
          suspended_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          edition?: string;
          id?: string;
          locked_at?: string | null;
          max_branches?: number | null;
          max_devices?: number | null;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          paid_until?: string | null;
          suspended_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
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
          gym_id: string;
          id: string;
          permission_key: string;
          role_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          permission_key: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
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
            foreignKeyName: 'role_permissions_role_id_gym_id_fkey';
            columns: ['role_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
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
          gym_id?: string;
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
          gym_id?: string;
          id?: string;
          is_system?: boolean;
          key?: string | null;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'roles_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
      };
      settings: {
        Row: {
          branch_id: string | null;
          created_at: string;
          created_by: string | null;
          gym_id: string;
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
          gym_id?: string;
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
          gym_id?: string;
          id?: string;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'settings_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'settings_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_branch_access: {
        Row: {
          branch_id: string;
          gym_id: string;
          id: string;
          staff_id: string;
        };
        Insert: {
          branch_id: string;
          gym_id: string;
          id?: string;
          staff_id: string;
        };
        Update: {
          branch_id?: string;
          gym_id?: string;
          id?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_branch_access_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'staff_branch_access_staff_id_gym_id_fkey';
            columns: ['staff_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      staff_branches: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          gym_id: string;
          id: string;
          staff_id: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          staff_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_branches_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'staff_branches_staff_id_gym_id_fkey';
            columns: ['staff_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      staff_pins: {
        Row: {
          created_at: string;
          created_by: string | null;
          failed_attempts: number;
          gym_id: string;
          locked_at: string | null;
          pin_hash: string;
          staff_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          failed_attempts?: number;
          gym_id?: string;
          locked_at?: string | null;
          pin_hash: string;
          staff_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          failed_attempts?: number;
          gym_id?: string;
          locked_at?: string | null;
          pin_hash?: string;
          staff_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_pins_staff_id_gym_id_fkey';
            columns: ['staff_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
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
          gym_id: string;
          id: string;
          is_active: boolean;
          must_change_password: boolean;
          nav_tabs: string[] | null;
          phone: string | null;
          preferred_language: Database['public']['Enums']['language_code'] | null;
          role_id: string;
          text_size: string | null;
          theme_preference: string | null;
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
          gym_id?: string;
          id: string;
          is_active?: boolean;
          must_change_password?: boolean;
          nav_tabs?: string[] | null;
          phone?: string | null;
          preferred_language?: Database['public']['Enums']['language_code'] | null;
          role_id: string;
          text_size?: string | null;
          theme_preference?: string | null;
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
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          must_change_password?: boolean;
          nav_tabs?: string[] | null;
          phone?: string | null;
          preferred_language?: Database['public']['Enums']['language_code'] | null;
          role_id?: string;
          text_size?: string | null;
          theme_preference?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_users_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_users_role_id_gym_id_fkey';
            columns: ['role_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      clear_my_pin_lockout: { Args: Record<PropertyKey, never>; Returns: undefined };
      create_gym: {
        Args: {
          p_code: string;
          p_edition?: string;
          p_first_branch_name: string;
          p_id?: string;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
        };
        Returns: {
          code: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          edition: string;
          id: string;
          locked_at: string | null;
          max_branches: number | null;
          max_devices: number | null;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          paid_until: string | null;
          suspended_at: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'gyms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_staff_profile: {
        Args: {
          p_all_branches: boolean;
          p_branch_ids: string[];
          p_full_name: string;
          p_id: string;
          p_phone?: string;
          p_role_id: string;
          p_username: string;
        };
        Returns: undefined;
      };
      device_heartbeat: {
        Args: { p_app_version: string; p_device_id: string };
        Returns: undefined;
      };
      my_gym: {
        Args: Record<PropertyKey, never>;
        Returns: {
          access: string;
          code: string;
          edition: string;
          id: string;
          name_ar: string;
          name_ckb: string;
          name_en: string;
          paid_until: string;
        }[];
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
          gym_id: string;
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
      set_my_pin: { Args: { p_pin: string }; Returns: undefined };
      staff_admin_orphan: { Args: { p_email: string }; Returns: string };
      staff_admin_prepare_change: {
        Args: { p_action: string; p_new_username?: string; p_staff_id: string };
        Returns: {
          gym_code: string;
          is_active: boolean;
          username: string;
        }[];
      };
      staff_admin_prepare_create: {
        Args: {
          p_all_branches: boolean;
          p_branch_ids: string[];
          p_role_id: string;
          p_username: string;
        };
        Returns: {
          gym_code: string;
          gym_id: string;
        }[];
      };
      unlock_with_pin: { Args: { p_branch_id: string; p_pin: string }; Returns: Json };
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
