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
      installments: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          due_date: string;
          gym_id: string;
          id: string;
          invoice_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          due_date: string;
          gym_id?: string;
          id: string;
          invoice_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          due_date?: string;
          gym_id?: string;
          id?: string;
          invoice_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'installments_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'gym_id'];
          },
          {
            foreignKeyName: 'installments_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      invoice_credits: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          invoice_id: string;
          kind: string;
          reason: string | null;
          subscription_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          invoice_id: string;
          kind: string;
          reason?: string | null;
          subscription_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          invoice_id?: string;
          kind?: string;
          reason?: string | null;
          subscription_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_credits_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'gym_id'];
          },
          {
            foreignKeyName: 'invoice_credits_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'invoice_credits_subscription_id_gym_id_fkey';
            columns: ['subscription_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      invoice_items: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description_ar: string | null;
          description_ckb: string;
          description_en: string | null;
          discount: number;
          discount_reason: string | null;
          gym_id: string;
          id: string;
          invoice_id: string;
          kind: string;
          quantity: number;
          subscription_id: string | null;
          total: number;
          unit_price: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description_ar?: string | null;
          description_ckb: string;
          description_en?: string | null;
          discount?: number;
          discount_reason?: string | null;
          gym_id?: string;
          id?: string;
          invoice_id: string;
          kind: string;
          quantity?: number;
          subscription_id?: string | null;
          total: number;
          unit_price: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description_ar?: string | null;
          description_ckb?: string;
          description_en?: string | null;
          discount?: number;
          discount_reason?: string | null;
          gym_id?: string;
          id?: string;
          invoice_id?: string;
          kind?: string;
          quantity?: number;
          subscription_id?: string | null;
          total?: number;
          unit_price?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_items_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'gym_id'];
          },
          {
            foreignKeyName: 'invoice_items_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'invoice_items_subscription_id_gym_id_fkey';
            columns: ['subscription_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      invoices: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          discount: number;
          gym_id: string;
          id: string;
          member_id: string;
          number: string;
          subtotal: number;
          total: number;
          updated_at: string;
          updated_by: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          discount?: number;
          gym_id?: string;
          id: string;
          member_id: string;
          number: string;
          subtotal: number;
          total: number;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          discount?: number;
          gym_id?: string;
          id?: string;
          member_id?: string;
          number?: string;
          subtotal?: number;
          total?: number;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'invoices_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      member_health: {
        Row: {
          blood_type: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          injuries: string | null;
          medical_notes: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          blood_type?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          injuries?: string | null;
          medical_notes?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          blood_type?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          injuries?: string | null;
          medical_notes?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'member_health_id_gym_id_fkey';
            columns: ['id', 'gym_id'];
            isOneToOne: true;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      member_imports: {
        Row: {
          card_count: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          file_name: string;
          gym_id: string;
          id: string;
          kept: NonNullable<Json>;
          member_count: number;
          undo_reason: string | null;
          undone_at: string | null;
          undone_by: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          card_count?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          file_name: string;
          gym_id?: string;
          id: string;
          kept?: NonNullable<Json>;
          member_count: number;
          undo_reason?: string | null;
          undone_at?: string | null;
          undone_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          card_count?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          file_name?: string;
          gym_id?: string;
          id?: string;
          kept?: NonNullable<Json>;
          member_count?: number;
          undo_reason?: string | null;
          undone_at?: string | null;
          undone_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'member_imports_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
      };
      member_photos: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          photo: string;
          photo_type: string;
          thumbnail: string;
          thumbnail_type: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          photo: string;
          photo_type: string;
          thumbnail: string;
          thumbnail_type: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          photo?: string;
          photo_type?: string;
          thumbnail?: string;
          thumbnail_type?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'member_photos_id_gym_id_fkey';
            columns: ['id', 'gym_id'];
            isOneToOne: true;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      members: {
        Row: {
          address: string | null;
          birth_date: string | null;
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          emergency_contact_name: string | null;
          emergency_phone: string | null;
          full_name: string;
          gender: string;
          goals: string | null;
          gym_id: string;
          has_health_notes: boolean;
          id: string;
          import_id: string | null;
          member_number: number;
          notes: string | null;
          phone: string | null;
          photo_updated_at: string | null;
          preferred_language: Database['public']['Enums']['language_code'];
          referral_source: string | null;
          search_text: string;
          status: string;
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          tags: string[];
          updated_at: string;
          updated_by: string | null;
          membership: string | null;
          membership_ends_on: string | null;
        };
        Insert: {
          address?: string | null;
          birth_date?: string | null;
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          emergency_contact_name?: string | null;
          emergency_phone?: string | null;
          full_name: string;
          gender: string;
          goals?: string | null;
          gym_id?: string;
          has_health_notes?: boolean;
          id: string;
          import_id?: string | null;
          member_number: number;
          notes?: string | null;
          phone?: string | null;
          photo_updated_at?: string | null;
          preferred_language?: Database['public']['Enums']['language_code'];
          referral_source?: string | null;
          search_text?: never;
          status?: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
          tags?: string[];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          address?: string | null;
          birth_date?: string | null;
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          emergency_contact_name?: string | null;
          emergency_phone?: string | null;
          full_name?: string;
          gender?: string;
          goals?: string | null;
          gym_id?: string;
          has_health_notes?: boolean;
          id?: string;
          import_id?: string | null;
          member_number?: number;
          notes?: string | null;
          phone?: string | null;
          photo_updated_at?: string | null;
          preferred_language?: Database['public']['Enums']['language_code'];
          referral_source?: string | null;
          search_text?: never;
          status?: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
          tags?: string[];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'members_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'members_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'members_import_id_gym_id_fkey';
            columns: ['import_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'member_imports';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      nfc_cards: {
        Row: {
          block_reason: string | null;
          blocked_at: string | null;
          blocked_by: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          replaces_id: string | null;
          status: string;
          uid: string;
          unblocked_at: string | null;
          unblocked_by: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          block_reason?: string | null;
          blocked_at?: string | null;
          blocked_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          end_reason?: string | null;
          ended_at?: string | null;
          ended_by?: string | null;
          gym_id?: string;
          id: string;
          member_id: string;
          replaces_id?: string | null;
          status?: string;
          uid: string;
          unblocked_at?: string | null;
          unblocked_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          block_reason?: string | null;
          blocked_at?: string | null;
          blocked_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          end_reason?: string | null;
          ended_at?: string | null;
          ended_by?: string | null;
          gym_id?: string;
          id?: string;
          member_id?: string;
          replaces_id?: string | null;
          status?: string;
          uid?: string;
          unblocked_at?: string | null;
          unblocked_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'nfc_cards_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'nfc_cards_replaces_id_gym_id_fkey';
            columns: ['replaces_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'nfc_cards';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          branch_id: string;
          change_given: number | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          deleted_at: string | null;
          exchange_rate: number | null;
          foreign_amount: number | null;
          gym_id: string;
          id: string;
          invoice_id: string;
          kind: string;
          member_id: string;
          method: string;
          number: string;
          reason: string | null;
          reference: string | null;
          updated_at: string;
          updated_by: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount: number;
          branch_id: string;
          change_given?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deleted_at?: string | null;
          exchange_rate?: number | null;
          foreign_amount?: number | null;
          gym_id?: string;
          id: string;
          invoice_id: string;
          kind?: string;
          member_id: string;
          method: string;
          number: string;
          reason?: string | null;
          reference?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number;
          branch_id?: string;
          change_given?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deleted_at?: string | null;
          exchange_rate?: number | null;
          foreign_amount?: number | null;
          gym_id?: string;
          id?: string;
          invoice_id?: string;
          kind?: string;
          member_id?: string;
          method?: string;
          number?: string;
          reason?: string | null;
          reference?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'payments_invoice_id_member_id_gym_id_fkey';
            columns: ['invoice_id', 'member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'member_id', 'gym_id'];
          },
          {
            foreignKeyName: 'payments_invoice_id_member_id_gym_id_fkey';
            columns: ['invoice_id', 'member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'member_id', 'gym_id'];
          },
          {
            foreignKeyName: 'payments_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
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
      plan_branches: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          gym_id: string;
          id: string;
          plan_id: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          plan_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_branches_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'plan_branches_plan_id_gym_id_fkey';
            columns: ['plan_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      plans: {
        Row: {
          all_branches: boolean;
          allowed_days: number[] | null;
          allowed_from: string | null;
          allowed_until: string | null;
          created_at: string;
          created_by: string | null;
          daily_visit_limit: number | null;
          deleted_at: string | null;
          duration_count: number | null;
          duration_unit: string | null;
          gender: string;
          gym_id: string;
          id: string;
          is_active: boolean;
          kind: string;
          max_freeze_days: number;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          price: number;
          updated_at: string;
          updated_by: string | null;
          visit_count: number | null;
        };
        Insert: {
          all_branches?: boolean;
          allowed_days?: number[] | null;
          allowed_from?: string | null;
          allowed_until?: string | null;
          created_at?: string;
          created_by?: string | null;
          daily_visit_limit?: number | null;
          deleted_at?: string | null;
          duration_count?: number | null;
          duration_unit?: string | null;
          gender?: string;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          kind: string;
          max_freeze_days?: number;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          price: number;
          updated_at?: string;
          updated_by?: string | null;
          visit_count?: number | null;
        };
        Update: {
          all_branches?: boolean;
          allowed_days?: number[] | null;
          allowed_from?: string | null;
          allowed_until?: string | null;
          created_at?: string;
          created_by?: string | null;
          daily_visit_limit?: number | null;
          deleted_at?: string | null;
          duration_count?: number | null;
          duration_unit?: string | null;
          gender?: string;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          max_freeze_days?: number;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          price?: number;
          updated_at?: string;
          updated_by?: string | null;
          visit_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'plans_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
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
      subscription_freezes: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_date: string;
          ended_on: string | null;
          gym_id: string;
          id: string;
          reason: string | null;
          start_date: string;
          subscription_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          end_date: string;
          ended_on?: string | null;
          gym_id?: string;
          id: string;
          reason?: string | null;
          start_date: string;
          subscription_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          end_date?: string;
          ended_on?: string | null;
          gym_id?: string;
          id?: string;
          reason?: string | null;
          start_date?: string;
          subscription_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_freezes_subscription_id_gym_id_fkey';
            columns: ['subscription_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      subscriptions: {
        Row: {
          allowed_days: number[] | null;
          allowed_from: string | null;
          allowed_until: string | null;
          branch_id: string;
          branch_ids: string[] | null;
          created_at: string;
          created_by: string | null;
          daily_visit_limit: number | null;
          deleted_at: string | null;
          duration_count: number | null;
          duration_unit: string | null;
          end_date: string | null;
          gender: string;
          gym_id: string;
          id: string;
          kind: string;
          max_freeze_days: number;
          member_id: string;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          plan_id: string;
          price: number;
          replaces_id: string | null;
          start_date: string;
          status: string;
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          transferred_from_id: string | null;
          updated_at: string;
          updated_by: string | null;
          visit_count: number | null;
        };
        Insert: {
          allowed_days?: number[] | null;
          allowed_from?: string | null;
          allowed_until?: string | null;
          branch_id: string;
          branch_ids?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          daily_visit_limit?: number | null;
          deleted_at?: string | null;
          duration_count?: number | null;
          duration_unit?: string | null;
          end_date?: string | null;
          gender: string;
          gym_id?: string;
          id: string;
          kind: string;
          max_freeze_days: number;
          member_id: string;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          plan_id: string;
          price: number;
          replaces_id?: string | null;
          start_date: string;
          status?: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
          transferred_from_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          visit_count?: number | null;
        };
        Update: {
          allowed_days?: number[] | null;
          allowed_from?: string | null;
          allowed_until?: string | null;
          branch_id?: string;
          branch_ids?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          daily_visit_limit?: number | null;
          deleted_at?: string | null;
          duration_count?: number | null;
          duration_unit?: string | null;
          end_date?: string | null;
          gender?: string;
          gym_id?: string;
          id?: string;
          kind?: string;
          max_freeze_days?: number;
          member_id?: string;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          plan_id?: string;
          price?: number;
          replaces_id?: string | null;
          start_date?: string;
          status?: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
          transferred_from_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          visit_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'subscriptions_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'subscriptions_plan_id_gym_id_fkey';
            columns: ['plan_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'subscriptions_replaces_id_gym_id_fkey';
            columns: ['replaces_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'subscriptions_transferred_from_id_gym_id_fkey';
            columns: ['transferred_from_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
    };
    Views: {
      installment_balances: {
        Row: {
          amount: number | null;
          due_date: string | null;
          gym_id: string | null;
          installment_id: string | null;
          invoice_id: string | null;
          paid: number | null;
          voided: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'installments_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'gym_id'];
          },
          {
            foreignKeyName: 'installments_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      invoice_balances: {
        Row: {
          branch_id: string | null;
          created_at: string | null;
          credited: number | null;
          due: number | null;
          gym_id: string | null;
          invoice_id: string | null;
          member_id: string | null;
          number: string | null;
          paid: number | null;
          refunded: number | null;
          total: number | null;
          voided_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'invoices_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      member_debts: {
        Row: {
          due: number | null;
          full_name: string | null;
          gym_id: string | null;
          invoice_count: number | null;
          member_id: string | null;
          member_number: number | null;
          next_due_date: string | null;
          owed_now: number | null;
          phone: string | null;
          status: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
    };
    Functions: {
      assign_card: {
        Args: { p_id: string; p_member_id: string; p_uid: string };
        Returns: {
          block_reason: string | null;
          blocked_at: string | null;
          blocked_by: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          replaces_id: string | null;
          status: string;
          uid: string;
          unblocked_at: string | null;
          unblocked_by: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'nfc_cards';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      block_card: {
        Args: { p_card_id: string; p_reason: string };
        Returns: {
          block_reason: string | null;
          blocked_at: string | null;
          blocked_by: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          replaces_id: string | null;
          status: string;
          uid: string;
          unblocked_at: string | null;
          unblocked_by: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'nfc_cards';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancel_subscription: {
        Args: {
          p_branch_id?: string;
          p_reason: string;
          p_refund?: Json;
          p_subscription_id: string;
        };
        Returns: Json;
      };
      change_plan: {
        Args: {
          p_branch_id: string;
          p_installments?: Json;
          p_invoice_id: string;
          p_new_subscription_id: string;
          p_payment?: Json;
          p_plan_id: string;
          p_price: number;
          p_subscription_id: string;
        };
        Returns: Json;
      };
      charge_member: {
        Args: {
          p_amount: number;
          p_branch_id: string;
          p_description: string;
          p_invoice_id: string;
          p_kind: string;
          p_member_id: string;
          p_payment?: Json;
        };
        Returns: Json;
      };
      check_member_import: {
        Args: { p_rows: Json };
        Returns: {
          full_name: string;
          match: string;
          member_id: string;
          member_number: number;
          row: number;
          status: string;
        }[];
      };
      clear_my_pin_lockout: { Args: Record<PropertyKey, never>; Returns: undefined };
      create_branch: {
        Args: {
          p_address?: string;
          p_id: string;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
          p_phone?: string;
        };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'branches';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
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
      create_member: {
        Args: {
          p_address?: string;
          p_birth_date?: string;
          p_blood_type?: string;
          p_branch_id: string;
          p_emergency_contact_name?: string;
          p_emergency_phone?: string;
          p_full_name: string;
          p_gender: string;
          p_goals?: string;
          p_id: string;
          p_injuries?: string;
          p_medical_notes?: string;
          p_notes?: string;
          p_phone?: string;
          p_preferred_language?: Database['public']['Enums']['language_code'];
          p_referral_source?: string;
          p_tags?: string[];
        };
        Returns: {
          address: string | null;
          birth_date: string | null;
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          emergency_contact_name: string | null;
          emergency_phone: string | null;
          full_name: string;
          gender: string;
          goals: string | null;
          gym_id: string;
          has_health_notes: boolean;
          id: string;
          import_id: string | null;
          member_number: number;
          notes: string | null;
          phone: string | null;
          photo_updated_at: string | null;
          preferred_language: Database['public']['Enums']['language_code'];
          referral_source: string | null;
          search_text: string;
          status: string;
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          tags: string[];
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'members';
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
      device_overview: {
        Args: Record<PropertyKey, never>;
        Returns: {
          app_version: string;
          branch_id: string;
          code: string;
          created_at: string;
          default_language: Database['public']['Enums']['language_code'];
          id: string;
          is_active: boolean;
          last_seen_at: string;
          last_seen_by: string;
          last_seen_by_name: string;
          name: string;
          platform: string;
        }[];
      };
      end_card: {
        Args: { p_card_id: string };
        Returns: {
          block_reason: string | null;
          blocked_at: string | null;
          blocked_by: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          replaces_id: string | null;
          status: string;
          uid: string;
          unblocked_at: string | null;
          unblocked_by: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'nfc_cards';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      find_card: {
        Args: { p_uid: string };
        Returns: {
          block_reason: string | null;
          blocked_at: string | null;
          blocked_by: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          replaces_id: string | null;
          status: string;
          uid: string;
          unblocked_at: string | null;
          unblocked_by: string | null;
          updated_at: string;
          updated_by: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'nfc_cards';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      find_member_duplicates: {
        Args: { p_exclude_id?: string; p_full_name?: string; p_phone?: string };
        Returns: {
          branch_id: string;
          full_name: string;
          id: string;
          match: string;
          member_number: number;
          phone: string;
          status: string;
        }[];
      };
      freeze_subscription: {
        Args: {
          p_days: number;
          p_freeze_id: string;
          p_reason?: string;
          p_start_date: string;
          p_subscription_id: string;
        };
        Returns: Json;
      };
      gym_limits: {
        Args: Record<PropertyKey, never>;
        Returns: {
          active_branches: number;
          active_devices: number;
          max_branches: number;
          max_devices: number;
        }[];
      };
      import_members: {
        Args: { p_file_name: string; p_import_id: string; p_rows: Json };
        Returns: {
          card_count: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          file_name: string;
          gym_id: string;
          id: string;
          kept: NonNullable<Json>;
          member_count: number;
          undo_reason: string | null;
          undone_at: string | null;
          undone_by: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'member_imports';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      member_import_history: {
        Args: Record<PropertyKey, never>;
        Returns: {
          card_count: number;
          created_at: string;
          created_by_name: string;
          file_name: string;
          id: string;
          member_count: number;
          undo_reason: string;
          undone_at: string;
          undone_by_name: string;
        }[];
      };
      member_import_undo_preview: {
        Args: { p_import_id: string };
        Returns: {
          already_archived: number;
          cards: number;
          changed: number;
          to_archive: number;
        }[];
      };
      member_tags: {
        Args: Record<PropertyKey, never>;
        Returns: {
          member_count: number;
          tag: string;
        }[];
      };
      membership: {
        Args: { p_member: Database['public']['Tables']['members']['Row'] };
        Returns: string;
      };
      membership_ends_on: {
        Args: { p_member: Database['public']['Tables']['members']['Row'] };
        Returns: string;
      };
      move_device: {
        Args: { p_branch_id: string; p_device_id: string };
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
      my_device: {
        Args: { p_device_id: string };
        Returns: {
          branch_code: string;
          branch_id: string;
          branch_is_active: boolean;
          branch_name_ar: string;
          branch_name_ckb: string;
          branch_name_en: string;
          can_use: boolean;
          code: string;
          default_language: Database['public']['Enums']['language_code'];
          id: string;
          is_active: boolean;
          name: string;
          platform: string;
        }[];
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
          suspended: boolean;
        }[];
      };
      pay_invoice: {
        Args: { p_branch_id: string; p_invoice_id: string; p_payment: Json };
        Returns: Json;
      };
      platform_admin_orphan: { Args: { p_email: string }; Returns: string };
      platform_script_add_admin: {
        Args: { p_full_name: string; p_user_id: string };
        Returns: undefined;
      };
      platform_script_find_admin: {
        Args: { p_email: string };
        Returns: {
          full_name: string;
          is_active: boolean;
          user_id: string;
        }[];
      };
      platform_script_record: { Args: { p_action: string; p_user_id: string }; Returns: undefined };
      refund_invoice: {
        Args: {
          p_amount: number;
          p_branch_id: string;
          p_invoice_id: string;
          p_method: string;
          p_reason: string;
          p_reference?: string;
          p_refund_id: string;
        };
        Returns: Json;
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
      remove_member_photo: { Args: { p_member_id: string }; Returns: undefined };
      replace_card: {
        Args: { p_card_id: string; p_new_id?: string; p_new_uid?: string; p_reason: string };
        Returns: {
          block_reason: string | null;
          blocked_at: string | null;
          blocked_by: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          replaces_id: string | null;
          status: string;
          uid: string;
          unblocked_at: string | null;
          unblocked_by: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'nfc_cards';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reset_staff_pin: { Args: { p_staff_id: string }; Returns: undefined };
      role_overview: {
        Args: Record<PropertyKey, never>;
        Returns: {
          can_edit: boolean;
          can_edit_permissions: boolean;
          can_grant: boolean;
          id: string;
          is_own_role: boolean;
          is_system: boolean;
          key: string;
          name_ar: string;
          name_ckb: string;
          name_en: string;
          permission_keys: string[];
          staff_count: number;
        }[];
      };
      save_plan: {
        Args: {
          p_allowed_days?: number[];
          p_allowed_from?: string;
          p_allowed_until?: string;
          p_branch_ids?: string[];
          p_daily_visit_limit?: number;
          p_duration_count?: number;
          p_duration_unit?: string;
          p_gender?: string;
          p_id: string;
          p_is_active?: boolean;
          p_kind: string;
          p_max_freeze_days?: number;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
          p_price: number;
          p_visit_count?: number;
        };
        Returns: {
          all_branches: boolean;
          allowed_days: number[] | null;
          allowed_from: string | null;
          allowed_until: string | null;
          created_at: string;
          created_by: string | null;
          daily_visit_limit: number | null;
          deleted_at: string | null;
          duration_count: number | null;
          duration_unit: string | null;
          gender: string;
          gym_id: string;
          id: string;
          is_active: boolean;
          kind: string;
          max_freeze_days: number;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          price: number;
          updated_at: string;
          updated_by: string | null;
          visit_count: number | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plans';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_role: {
        Args: {
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
          p_permission_keys?: string[];
          p_role_id: string;
        };
        Returns: undefined;
      };
      save_staff_access: {
        Args: {
          p_all_branches: boolean;
          p_branch_ids: string[];
          p_full_name: string;
          p_phone?: string;
          p_role_id: string;
          p_staff_id: string;
        };
        Returns: undefined;
      };
      search_members: {
        Args: { p_include_archived?: boolean; p_limit?: number; p_query: string };
        Returns: {
          address: string | null;
          birth_date: string | null;
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          emergency_contact_name: string | null;
          emergency_phone: string | null;
          full_name: string;
          gender: string;
          goals: string | null;
          gym_id: string;
          has_health_notes: boolean;
          id: string;
          import_id: string | null;
          member_number: number;
          notes: string | null;
          phone: string | null;
          photo_updated_at: string | null;
          preferred_language: Database['public']['Enums']['language_code'];
          referral_source: string | null;
          search_text: string;
          status: string;
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          tags: string[];
          updated_at: string;
          updated_by: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'members';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      sell_subscription: {
        Args: {
          p_branch_id: string;
          p_discount?: number;
          p_discount_reason?: string;
          p_installments?: Json;
          p_invoice_id: string;
          p_member_id: string;
          p_payment?: Json;
          p_plan_id: string;
          p_price: number;
          p_start_date: string;
          p_subscription_id: string;
        };
        Returns: Json;
      };
      seller_add_admin: { Args: { p_full_name: string; p_user_id: string }; Returns: undefined };
      seller_admins: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          email: string;
          full_name: string;
          has_two_step: boolean;
          is_active: boolean;
          last_sign_in_at: string;
          must_change_password: boolean;
          recovery_codes_left: number;
          user_id: string;
        }[];
      };
      seller_audit_log: {
        Args: { p_before?: string; p_gym_id?: string; p_limit?: number };
        Returns: {
          action: string;
          actor_email: string;
          actor_id: string;
          details: Json;
          gym_code: string;
          gym_id: string;
          id: string;
          occurred_at: string;
          reason: string;
          target_admin_id: string;
          target_email: string;
        }[];
      };
      seller_create_gym: {
        Args: {
          p_code: string;
          p_first_branch_name: string;
          p_gym_id: string;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
          p_owner_full_name: string;
          p_owner_id: string;
          p_owner_phone?: string;
          p_owner_username: string;
          p_paid_until?: string;
        };
        Returns: undefined;
      };
      seller_gyms: {
        Args: { p_gym_id?: string };
        Returns: {
          access: string;
          active_branches: number;
          active_devices: number;
          active_staff: number;
          code: string;
          created_at: string;
          edition: string;
          id: string;
          last_device_seen_at: string;
          last_login_at: string;
          locked_at: string;
          max_branches: number;
          max_devices: number;
          name_ar: string;
          name_ckb: string;
          name_en: string;
          paid_until: string;
          state_reason: string;
          suspended_at: string;
        }[];
      };
      seller_lock_gym: { Args: { p_gym_id: string; p_reason: string }; Returns: undefined };
      seller_me: {
        Args: Record<PropertyKey, never>;
        Returns: {
          aal2: boolean;
          active_admins: number;
          email: string;
          full_name: string;
          has_two_step: boolean;
          must_change_password: boolean;
          recovery_codes_left: number;
          user_id: string;
        }[];
      };
      seller_member_counts: {
        Args: { p_gym_id?: string };
        Returns: {
          active_members: number;
          gym_id: string;
          members: number;
        }[];
      };
      seller_new_recovery_codes: { Args: Record<PropertyKey, never>; Returns: string[] };
      seller_prepare_add_admin: { Args: { p_email: string }; Returns: undefined };
      seller_prepare_admin_change: {
        Args: { p_action: string; p_user_id: string };
        Returns: {
          email: string;
          is_active: boolean;
        }[];
      };
      seller_prepare_create_gym: {
        Args: { p_code: string; p_owner_username: string };
        Returns: undefined;
      };
      seller_reactivate_gym: { Args: { p_gym_id: string; p_reason?: string }; Returns: undefined };
      seller_record_admin_change: {
        Args: { p_action: string; p_user_id: string };
        Returns: undefined;
      };
      seller_rename_gym: {
        Args: { p_gym_id: string; p_name_ar: string; p_name_ckb: string; p_name_en: string };
        Returns: undefined;
      };
      seller_set_admin_active: {
        Args: { p_active: boolean; p_user_id: string };
        Returns: undefined;
      };
      seller_set_limits: {
        Args: { p_gym_id: string; p_max_branches: number; p_max_devices: number };
        Returns: undefined;
      };
      seller_set_paid_until: {
        Args: { p_gym_id: string; p_paid_until: string };
        Returns: undefined;
      };
      seller_suspend_gym: { Args: { p_gym_id: string; p_reason?: string }; Returns: undefined };
      seller_use_recovery_code: { Args: { p_code: string }; Returns: Json };
      set_member_photo: {
        Args: {
          p_member_id: string;
          p_photo: string;
          p_photo_type: string;
          p_thumbnail: string;
          p_thumbnail_type: string;
        };
        Returns: string;
      };
      set_member_status: {
        Args: { p_id: string; p_reason?: string; p_status: string };
        Returns: {
          address: string | null;
          birth_date: string | null;
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          emergency_contact_name: string | null;
          emergency_phone: string | null;
          full_name: string;
          gender: string;
          goals: string | null;
          gym_id: string;
          has_health_notes: boolean;
          id: string;
          import_id: string | null;
          member_number: number;
          notes: string | null;
          phone: string | null;
          photo_updated_at: string | null;
          preferred_language: Database['public']['Enums']['language_code'];
          referral_source: string | null;
          search_text: string;
          status: string;
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          tags: string[];
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'members';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
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
      staff_directory: {
        Args: Record<PropertyKey, never>;
        Returns: {
          all_branches: boolean;
          branch_ids: string[];
          can_manage: boolean;
          created_at: string;
          full_name: string;
          has_pin: boolean;
          hidden_branch_count: number;
          id: string;
          is_active: boolean;
          last_login_at: string;
          must_change_password: boolean;
          phone: string;
          pin_locked: boolean;
          role_id: string;
          username: string;
        }[];
      };
      subscription_change_preview: { Args: { p_subscription_id: string }; Returns: Json };
      transfer_subscription: {
        Args: {
          p_member_id: string;
          p_new_subscription_id: string;
          p_reason: string;
          p_subscription_id: string;
        };
        Returns: Json;
      };
      unblock_card: {
        Args: { p_card_id: string };
        Returns: {
          block_reason: string | null;
          blocked_at: string | null;
          blocked_by: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          replaces_id: string | null;
          status: string;
          uid: string;
          unblocked_at: string | null;
          unblocked_by: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'nfc_cards';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      undo_member_import: {
        Args: { p_import_id: string; p_reason: string };
        Returns: {
          already_archived: number;
          archived: number;
          cards_ended: number;
          changed: number;
        }[];
      };
      unfreeze_subscription: { Args: { p_freeze_id: string }; Returns: Json };
      unlock_on_device: { Args: { p_device_id: string; p_pin: string }; Returns: Json };
      unlock_with_pin: { Args: { p_branch_id: string; p_pin: string }; Returns: Json };
      update_member: {
        Args: {
          p_address?: string;
          p_birth_date?: string;
          p_blood_type?: string;
          p_branch_id: string;
          p_emergency_contact_name?: string;
          p_emergency_phone?: string;
          p_full_name: string;
          p_gender: string;
          p_goals?: string;
          p_id: string;
          p_injuries?: string;
          p_medical_notes?: string;
          p_notes?: string;
          p_phone?: string;
          p_preferred_language?: Database['public']['Enums']['language_code'];
          p_referral_source?: string;
          p_save_health?: boolean;
          p_tags?: string[];
        };
        Returns: {
          address: string | null;
          birth_date: string | null;
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          emergency_contact_name: string | null;
          emergency_phone: string | null;
          full_name: string;
          gender: string;
          goals: string | null;
          gym_id: string;
          has_health_notes: boolean;
          id: string;
          import_id: string | null;
          member_number: number;
          notes: string | null;
          phone: string | null;
          photo_updated_at: string | null;
          preferred_language: Database['public']['Enums']['language_code'];
          referral_source: string | null;
          search_text: string;
          status: string;
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          tags: string[];
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'members';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      void_invoice: { Args: { p_invoice_id: string; p_reason: string }; Returns: undefined };
      void_payment: { Args: { p_payment_id: string; p_reason: string }; Returns: Json };
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
