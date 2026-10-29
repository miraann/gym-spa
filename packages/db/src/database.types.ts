export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      attendance: {
        Row: {
          branch_id: string;
          card_id: string | null;
          checked_in_at: string;
          checked_out_at: string | null;
          checked_out_by: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          device_id: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          method: string;
          override_note: string | null;
          override_reason: string | null;
          subscription_id: string | null;
          updated_at: string;
          updated_by: string | null;
          visit_date: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          inside: boolean | null;
        };
        Insert: {
          branch_id: string;
          card_id?: string | null;
          checked_in_at?: string;
          checked_out_at?: string | null;
          checked_out_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          device_id?: string | null;
          gym_id?: string;
          id: string;
          member_id: string;
          method: string;
          override_note?: string | null;
          override_reason?: string | null;
          subscription_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          visit_date?: never;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          branch_id?: string;
          card_id?: string | null;
          checked_in_at?: string;
          checked_out_at?: string | null;
          checked_out_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          device_id?: string | null;
          gym_id?: string;
          id?: string;
          member_id?: string;
          method?: string;
          override_note?: string | null;
          override_reason?: string | null;
          subscription_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          visit_date?: never;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'attendance_card_id_gym_id_fkey';
            columns: ['card_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'nfc_cards';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'attendance_device_id_gym_id_fkey';
            columns: ['device_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'attendance_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'attendance_subscription_id_gym_id_fkey';
            columns: ['subscription_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
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
      cash_movements: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          kind: string;
          reason: string;
          shift_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          currency: string;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          kind: string;
          reason: string;
          shift_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          kind?: string;
          reason?: string;
          shift_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_movements_shift_id_gym_id_fkey';
            columns: ['shift_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'cash_shifts';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      cash_shifts: {
        Row: {
          branch_id: string;
          close_note: string | null;
          closed_at: string | null;
          closed_by: string | null;
          counted_iqd: number | null;
          counted_usd: number | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          expected_iqd: number | null;
          expected_usd: number | null;
          gym_id: string;
          id: string;
          opened_at: string;
          opened_by: string | null;
          opening_iqd: number;
          opening_usd: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          branch_id: string;
          close_note?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          counted_iqd?: number | null;
          counted_usd?: number | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          expected_iqd?: number | null;
          expected_usd?: number | null;
          gym_id?: string;
          id: string;
          opened_at?: string;
          opened_by?: string | null;
          opening_iqd: number;
          opening_usd?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          close_note?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          counted_iqd?: number | null;
          counted_usd?: number | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          expected_iqd?: number | null;
          expected_usd?: number | null;
          gym_id?: string;
          id?: string;
          opened_at?: string;
          opened_by?: string | null;
          opening_iqd?: number;
          opening_usd?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_shifts_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      class_bookings: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          session_id: string;
          status: string;
          status_changed_at: string | null;
          status_changed_by: string | null;
          updated_at: string;
          updated_by: string | null;
          waitlisted_at: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          member_id: string;
          session_id: string;
          status: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          waitlisted_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          member_id?: string;
          session_id?: string;
          status?: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          waitlisted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'class_bookings_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'class_bookings_session_id_gym_id_fkey';
            columns: ['session_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'class_sessions';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      class_schedules: {
        Row: {
          branch_id: string;
          capacity: number;
          class_type_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          duration_minutes: number;
          ends_on: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          place: string | null;
          starts_at: string;
          starts_on: string;
          trainer_id: string | null;
          updated_at: string;
          updated_by: string | null;
          weekday: number;
        };
        Insert: {
          branch_id: string;
          capacity: number;
          class_type_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          duration_minutes: number;
          ends_on?: string | null;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          place?: string | null;
          starts_at: string;
          starts_on: string;
          trainer_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          weekday: number;
        };
        Update: {
          branch_id?: string;
          capacity?: number;
          class_type_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          duration_minutes?: number;
          ends_on?: string | null;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          place?: string | null;
          starts_at?: string;
          starts_on?: string;
          trainer_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'class_schedules_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'class_schedules_class_type_id_gym_id_fkey';
            columns: ['class_type_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'class_types';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'class_schedules_trainer_id_gym_id_fkey';
            columns: ['trainer_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      class_sessions: {
        Row: {
          branch_id: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          capacity: number;
          class_type_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          ends_at: string;
          gym_id: string;
          id: string;
          place: string | null;
          schedule_id: string;
          session_date: string;
          starts_at: string;
          trainer_id: string | null;
          updated_at: string;
          updated_by: string | null;
          taken: number | null;
        };
        Insert: {
          branch_id: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          capacity: number;
          class_type_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_at: string;
          gym_id?: string;
          id: string;
          place?: string | null;
          schedule_id: string;
          session_date: string;
          starts_at: string;
          trainer_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          capacity?: number;
          class_type_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_at?: string;
          gym_id?: string;
          id?: string;
          place?: string | null;
          schedule_id?: string;
          session_date?: string;
          starts_at?: string;
          trainer_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'class_sessions_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'class_sessions_class_type_id_gym_id_fkey';
            columns: ['class_type_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'class_types';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'class_sessions_schedule_id_gym_id_fkey';
            columns: ['schedule_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'class_schedules';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'class_sessions_trainer_id_gym_id_fkey';
            columns: ['trainer_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      class_types: {
        Row: {
          capacity: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          duration_minutes: number;
          gym_id: string;
          id: string;
          is_active: boolean;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          capacity?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          duration_minutes?: number;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          capacity?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          duration_minutes?: number;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'class_types_gym_id_fkey';
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
          product_id: string | null;
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
          product_id?: string | null;
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
          product_id?: string | null;
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
            foreignKeyName: 'invoice_items_product_id_gym_id_fkey';
            columns: ['product_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'products';
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
      locker_assignments: {
        Row: {
          assigned_at: string;
          attendance_id: string | null;
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          ends_on: string | null;
          gym_id: string;
          id: string;
          invoice_id: string | null;
          key_fee_invoice_id: string | null;
          kind: string;
          locker_id: string;
          member_id: string;
          release_reason: string | null;
          released_at: string | null;
          released_by: string | null;
          renews_id: string | null;
          starts_on: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          assigned_at?: string;
          attendance_id?: string | null;
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_on?: string | null;
          gym_id?: string;
          id: string;
          invoice_id?: string | null;
          key_fee_invoice_id?: string | null;
          kind: string;
          locker_id: string;
          member_id: string;
          release_reason?: string | null;
          released_at?: string | null;
          released_by?: string | null;
          renews_id?: string | null;
          starts_on: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          assigned_at?: string;
          attendance_id?: string | null;
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_on?: string | null;
          gym_id?: string;
          id?: string;
          invoice_id?: string | null;
          key_fee_invoice_id?: string | null;
          kind?: string;
          locker_id?: string;
          member_id?: string;
          release_reason?: string | null;
          released_at?: string | null;
          released_by?: string | null;
          renews_id?: string | null;
          starts_on?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'locker_assignments_attendance_id_gym_id_fkey';
            columns: ['attendance_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'attendance';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'locker_assignments_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'locker_assignments_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'gym_id'];
          },
          {
            foreignKeyName: 'locker_assignments_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'locker_assignments_key_fee_invoice_id_gym_id_fkey';
            columns: ['key_fee_invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'gym_id'];
          },
          {
            foreignKeyName: 'locker_assignments_key_fee_invoice_id_gym_id_fkey';
            columns: ['key_fee_invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'locker_assignments_locker_id_gym_id_fkey';
            columns: ['locker_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'lockers';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'locker_assignments_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'locker_assignments_renews_id_gym_id_fkey';
            columns: ['renews_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'locker_assignments';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      lockers: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          kind: string;
          number: string;
          out_of_order_at: string | null;
          out_of_order_note: string | null;
          updated_at: string;
          updated_by: string | null;
          zone: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          kind: string;
          number: string;
          out_of_order_at?: string | null;
          out_of_order_note?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          zone: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          kind?: string;
          number?: string;
          out_of_order_at?: string | null;
          out_of_order_note?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          zone?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lockers_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
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
      member_messages: {
        Row: {
          body: string;
          branch_id: string;
          channel: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          language: Database['public']['Enums']['language_code'];
          member_id: string;
          phone: string;
          reminder_id: string | null;
          status: string;
          template_key: string | null;
          to_emergency_contact: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body: string;
          branch_id: string;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          language: Database['public']['Enums']['language_code'];
          member_id: string;
          phone: string;
          reminder_id?: string | null;
          status?: string;
          template_key?: string | null;
          to_emergency_contact: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body?: string;
          branch_id?: string;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          language?: Database['public']['Enums']['language_code'];
          member_id?: string;
          phone?: string;
          reminder_id?: string | null;
          status?: string;
          template_key?: string | null;
          to_emergency_contact?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'member_messages_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_messages_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_messages_reminder_id_gym_id_fkey';
            columns: ['reminder_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'reminders';
            referencedColumns: ['id', 'gym_id'];
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
      member_pt_packages: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          expires_on: string | null;
          gym_id: string;
          id: string;
          invoice_id: string;
          member_id: string;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          package_id: string;
          price: number;
          session_count: number;
          starts_on: string;
          trainer_id: string;
          updated_at: string;
          updated_by: string | null;
          sessions_left: number | null;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          expires_on?: string | null;
          gym_id?: string;
          id: string;
          invoice_id: string;
          member_id: string;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          package_id: string;
          price: number;
          session_count: number;
          starts_on: string;
          trainer_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          expires_on?: string | null;
          gym_id?: string;
          id?: string;
          invoice_id?: string;
          member_id?: string;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          package_id?: string;
          price?: number;
          session_count?: number;
          starts_on?: string;
          trainer_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'member_pt_packages_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_pt_packages_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_pt_packages_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_pt_packages_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_pt_packages_package_id_gym_id_fkey';
            columns: ['package_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'pt_packages';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_pt_packages_trainer_id_gym_id_fkey';
            columns: ['trainer_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      member_spa_packages: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          expires_on: string | null;
          gym_id: string;
          id: string;
          invoice_id: string;
          member_id: string;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          package_id: string;
          price: number;
          service_id: string;
          session_count: number;
          starts_on: string;
          updated_at: string;
          updated_by: string | null;
          sessions_left: number | null;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          expires_on?: string | null;
          gym_id?: string;
          id: string;
          invoice_id: string;
          member_id: string;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          package_id: string;
          price: number;
          service_id: string;
          session_count: number;
          starts_on: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          expires_on?: string | null;
          gym_id?: string;
          id?: string;
          invoice_id?: string;
          member_id?: string;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          package_id?: string;
          price?: number;
          service_id?: string;
          session_count?: number;
          starts_on?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'member_spa_packages_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_spa_packages_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_spa_packages_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_spa_packages_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_spa_packages_package_id_gym_id_fkey';
            columns: ['package_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_packages';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'member_spa_packages_service_id_gym_id_fkey';
            columns: ['service_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_services';
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
          is_guest: boolean;
          is_walk_in: boolean;
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
          is_guest?: boolean;
          is_walk_in?: boolean;
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
          is_guest?: boolean;
          is_walk_in?: boolean;
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
      message_templates: {
        Row: {
          body_ar: string | null;
          body_ckb: string | null;
          body_en: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          key: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body_ar?: string | null;
          body_ckb?: string | null;
          body_en?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body_ar?: string | null;
          body_ckb?: string | null;
          body_en?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'message_templates_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
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
          cash_shift_id: string | null;
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
          cash_shift_id?: string | null;
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
          cash_shift_id?: string | null;
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
            foreignKeyName: 'payments_cash_shift_id_gym_id_fkey';
            columns: ['cash_shift_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'cash_shifts';
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
      plan_spa_sessions: {
        Row: {
          created_at: string;
          created_by: string | null;
          gym_id: string;
          id: string;
          plan_id: string;
          service_id: string;
          session_count: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          plan_id: string;
          service_id: string;
          session_count: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          plan_id?: string;
          service_id?: string;
          session_count?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_spa_sessions_plan_id_gym_id_fkey';
            columns: ['plan_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'plan_spa_sessions_service_id_gym_id_fkey';
            columns: ['service_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_services';
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
      product_categories: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'product_categories_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          barcode: string | null;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          low_stock_level: number | null;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          price: number;
          track_stock: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          barcode?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          low_stock_level?: number | null;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          price: number;
          track_stock?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          barcode?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          low_stock_level?: number | null;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          price?: number;
          track_stock?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'products_category_id_gym_id_fkey';
            columns: ['category_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'product_categories';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'products_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
      };
      pt_packages: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          price: number;
          session_count: number;
          updated_at: string;
          updated_by: string | null;
          valid_days: number | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          price: number;
          session_count: number;
          updated_at?: string;
          updated_by?: string | null;
          valid_days?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          price?: number;
          session_count?: number;
          updated_at?: string;
          updated_by?: string | null;
          valid_days?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pt_packages_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
      };
      pt_sessions: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          earning: number;
          gym_id: string;
          happened_at: string;
          id: string;
          member_id: string;
          member_pt_package_id: string;
          note: string | null;
          status: string;
          trainer_id: string;
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
          earning?: number;
          gym_id?: string;
          happened_at?: string;
          id: string;
          member_id: string;
          member_pt_package_id: string;
          note?: string | null;
          status: string;
          trainer_id: string;
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
          earning?: number;
          gym_id?: string;
          happened_at?: string;
          id?: string;
          member_id?: string;
          member_pt_package_id?: string;
          note?: string | null;
          status?: string;
          trainer_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pt_sessions_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'pt_sessions_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'pt_sessions_member_pt_package_id_gym_id_fkey';
            columns: ['member_pt_package_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'member_pt_packages';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'pt_sessions_trainer_id_gym_id_fkey';
            columns: ['trainer_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      reminders: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          details: NonNullable<Json>;
          done_at: string | null;
          done_by: string | null;
          gym_id: string;
          id: string;
          kind: string;
          member_id: string;
          remind_on: string;
          subject_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          details?: NonNullable<Json>;
          done_at?: string | null;
          done_by?: string | null;
          gym_id?: string;
          id?: string;
          kind: string;
          member_id: string;
          remind_on: string;
          subject_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          details?: NonNullable<Json>;
          done_at?: string | null;
          done_by?: string | null;
          gym_id?: string;
          id?: string;
          kind?: string;
          member_id?: string;
          remind_on?: string;
          subject_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reminders_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'reminders_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
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
      spa_bookings: {
        Row: {
          arrived_at: string | null;
          branch_id: string;
          commission_amount: number | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          ends_at: string;
          gym_id: string;
          id: string;
          invoice_id: string | null;
          member_id: string;
          member_package_id: string | null;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          note: string | null;
          paid_with: string;
          place: number;
          price: number;
          room_free_at: string;
          room_id: string;
          room_time: unknown;
          service_id: string;
          service_time: unknown;
          starts_at: string;
          status: string;
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_note: string | null;
          subscription_id: string | null;
          therapist_id: string | null;
          updated_at: string;
          updated_by: string | null;
          walk_in: boolean;
        };
        Insert: {
          arrived_at?: string | null;
          branch_id: string;
          commission_amount?: number | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_at: string;
          gym_id?: string;
          id: string;
          invoice_id?: string | null;
          member_id: string;
          member_package_id?: string | null;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          note?: string | null;
          paid_with: string;
          place: number;
          price: number;
          room_free_at: string;
          room_id: string;
          room_time?: never;
          service_id: string;
          service_time?: never;
          starts_at: string;
          status?: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_note?: string | null;
          subscription_id?: string | null;
          therapist_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          walk_in?: boolean;
        };
        Update: {
          arrived_at?: string | null;
          branch_id?: string;
          commission_amount?: number | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_at?: string;
          gym_id?: string;
          id?: string;
          invoice_id?: string | null;
          member_id?: string;
          member_package_id?: string | null;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          note?: string | null;
          paid_with?: string;
          place?: number;
          price?: number;
          room_free_at?: string;
          room_id?: string;
          room_time?: never;
          service_id?: string;
          service_time?: never;
          starts_at?: string;
          status?: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_note?: string | null;
          subscription_id?: string | null;
          therapist_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          walk_in?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'spa_bookings_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_bookings_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_balances';
            referencedColumns: ['invoice_id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_bookings_invoice_id_gym_id_fkey';
            columns: ['invoice_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_bookings_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_bookings_member_package_id_gym_id_fkey';
            columns: ['member_package_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'member_spa_packages';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_bookings_room_id_gym_id_fkey';
            columns: ['room_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_rooms';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_bookings_service_id_gym_id_fkey';
            columns: ['service_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_services';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_bookings_subscription_id_gym_id_fkey';
            columns: ['subscription_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_bookings_therapist_id_gym_id_fkey';
            columns: ['therapist_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_therapists';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      spa_packages: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          price: number;
          service_id: string;
          session_count: number;
          updated_at: string;
          updated_by: string | null;
          valid_days: number | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          price: number;
          service_id: string;
          session_count: number;
          updated_at?: string;
          updated_by?: string | null;
          valid_days?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          price?: number;
          service_id?: string;
          session_count?: number;
          updated_at?: string;
          updated_by?: string | null;
          valid_days?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'spa_packages_service_id_gym_id_fkey';
            columns: ['service_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_services';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      spa_rooms: {
        Row: {
          branch_id: string;
          capacity: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          kind: string;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          branch_id: string;
          capacity?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          kind: string;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          capacity?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'spa_rooms_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      spa_services: {
        Row: {
          cleanup_minutes: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          duration_minutes: number;
          gender: string;
          gym_id: string;
          id: string;
          is_active: boolean;
          kind: string;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          needs_therapist: boolean;
          price: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          cleanup_minutes?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          duration_minutes: number;
          gender?: string;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          kind: string;
          name_ar?: string | null;
          name_ckb: string;
          name_en?: string | null;
          needs_therapist?: boolean;
          price: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          cleanup_minutes?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          duration_minutes?: number;
          gender?: string;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name_ar?: string | null;
          name_ckb?: string;
          name_en?: string | null;
          needs_therapist?: boolean;
          price?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'spa_services_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
      };
      spa_therapist_hours: {
        Row: {
          created_at: string;
          created_by: string | null;
          ends_at: string;
          gym_id: string;
          id: string;
          starts_at: string;
          therapist_id: string;
          weekday: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          ends_at: string;
          gym_id?: string;
          id?: string;
          starts_at: string;
          therapist_id: string;
          weekday: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          ends_at?: string;
          gym_id?: string;
          id?: string;
          starts_at?: string;
          therapist_id?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'spa_therapist_hours_therapist_id_gym_id_fkey';
            columns: ['therapist_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_therapists';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      spa_therapist_services: {
        Row: {
          created_at: string;
          created_by: string | null;
          gym_id: string;
          id: string;
          service_id: string;
          therapist_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          service_id: string;
          therapist_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          service_id?: string;
          therapist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'spa_therapist_services_service_id_gym_id_fkey';
            columns: ['service_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_services';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_therapist_services_therapist_id_gym_id_fkey';
            columns: ['therapist_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_therapists';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      spa_therapists: {
        Row: {
          branch_id: string;
          commission_percent: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          full_name: string;
          gender: string;
          gym_id: string;
          id: string;
          is_active: boolean;
          phone: string | null;
          staff_user_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          branch_id: string;
          commission_percent?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          full_name: string;
          gender: string;
          gym_id?: string;
          id: string;
          is_active?: boolean;
          phone?: string | null;
          staff_user_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          commission_percent?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          full_name?: string;
          gender?: string;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          phone?: string | null;
          staff_user_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'spa_therapists_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'spa_therapists_staff_user_id_gym_id_fkey';
            columns: ['staff_user_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
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
      staff_cards: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          staff_id: string;
          status: string;
          uid: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          end_reason?: string | null;
          ended_at?: string | null;
          ended_by?: string | null;
          gym_id?: string;
          id: string;
          staff_id: string;
          status?: string;
          uid: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          end_reason?: string | null;
          ended_at?: string | null;
          ended_by?: string | null;
          gym_id?: string;
          id?: string;
          staff_id?: string;
          status?: string;
          uid?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_cards_staff_id_gym_id_fkey';
            columns: ['staff_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      staff_clock: {
        Row: {
          branch_id: string;
          card_id: string | null;
          clocked_in_at: string;
          clocked_out_at: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          method: string;
          note: string | null;
          staff_id: string;
          updated_at: string;
          updated_by: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          branch_id: string;
          card_id?: string | null;
          clocked_in_at?: string;
          clocked_out_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          method: string;
          note?: string | null;
          staff_id: string;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          branch_id?: string;
          card_id?: string | null;
          clocked_in_at?: string;
          clocked_out_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          method?: string;
          note?: string | null;
          staff_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_clock_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'staff_clock_card_id_gym_id_fkey';
            columns: ['card_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_cards';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'staff_clock_staff_id_gym_id_fkey';
            columns: ['staff_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      staff_notification_reads: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          notification_id: string;
          staff_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          notification_id: string;
          staff_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          notification_id?: string;
          staff_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_notification_reads_notification_id_gym_id_fkey';
            columns: ['notification_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_notifications';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'staff_notification_reads_staff_id_gym_id_fkey';
            columns: ['staff_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      staff_notifications: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          details: NonNullable<Json>;
          gym_id: string;
          id: string;
          kind: string;
          notify_on: string;
          subject_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          details?: NonNullable<Json>;
          gym_id?: string;
          id?: string;
          kind: string;
          notify_on: string;
          subject_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          details?: NonNullable<Json>;
          gym_id?: string;
          id?: string;
          kind?: string;
          notify_on?: string;
          subject_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_notifications_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
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
      staff_profiles: {
        Row: {
          class_fee: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          hired_on: string | null;
          hourly_rate: number | null;
          id: string;
          monthly_salary: number | null;
          note: string | null;
          pt_percent: number;
          salary_type: string;
          teaches: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          class_fee?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          hired_on?: string | null;
          hourly_rate?: number | null;
          id: string;
          monthly_salary?: number | null;
          note?: string | null;
          pt_percent?: number;
          salary_type?: string;
          teaches?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          class_fee?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          hired_on?: string | null;
          hourly_rate?: number | null;
          id?: string;
          monthly_salary?: number | null;
          note?: string | null;
          pt_percent?: number;
          salary_type?: string;
          teaches?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_profiles_id_gym_id_fkey';
            columns: ['id', 'gym_id'];
            isOneToOne: true;
            referencedRelation: 'staff_users';
            referencedColumns: ['id', 'gym_id'];
          },
        ];
      };
      staff_shifts: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          ends_at: string;
          gym_id: string;
          id: string;
          note: string | null;
          shift_time: unknown;
          staff_id: string;
          starts_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_at: string;
          gym_id?: string;
          id: string;
          note?: string | null;
          shift_time?: never;
          staff_id: string;
          starts_at: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_at?: string;
          gym_id?: string;
          id?: string;
          note?: string | null;
          shift_time?: never;
          staff_id?: string;
          starts_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_shifts_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'staff_shifts_staff_id_gym_id_fkey';
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
      stock_movements: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          invoice_item_id: string | null;
          kind: string;
          note: string | null;
          product_id: string;
          quantity: number;
          reason: string | null;
          unit_cost: number | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id: string;
          invoice_item_id?: string | null;
          kind: string;
          note?: string | null;
          product_id: string;
          quantity: number;
          reason?: string | null;
          unit_cost?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          gym_id?: string;
          id?: string;
          invoice_item_id?: string | null;
          kind?: string;
          note?: string | null;
          product_id?: string;
          quantity?: number;
          reason?: string | null;
          unit_cost?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_movements_branch_id_gym_id_fkey';
            columns: ['branch_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'stock_movements_invoice_item_id_gym_id_fkey';
            columns: ['invoice_item_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_items';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'stock_movements_product_id_gym_id_fkey';
            columns: ['product_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'products';
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
      subscription_spa_sessions: {
        Row: {
          created_at: string;
          created_by: string | null;
          gym_id: string;
          id: string;
          service_id: string;
          session_count: number;
          subscription_id: string;
          sessions_left: number | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          service_id: string;
          session_count: number;
          subscription_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          service_id?: string;
          session_count?: number;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_spa_sessions_service_id_gym_id_fkey';
            columns: ['service_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'spa_services';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'subscription_spa_sessions_subscription_id_gym_id_fkey';
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
          used_visits: number | null;
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
      support_grants: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          ends_at: string;
          gym_id: string;
          id: string;
          reason: string;
          revoked_at: string | null;
          revoked_by: string | null;
          starts_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_at: string;
          gym_id?: string;
          id: string;
          reason: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          starts_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          ends_at?: string;
          gym_id?: string;
          id?: string;
          reason?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          starts_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'support_grants_gym_id_fkey';
            columns: ['gym_id'];
            isOneToOne: false;
            referencedRelation: 'gyms';
            referencedColumns: ['id'];
          },
        ];
      };
      support_reads: {
        Row: {
          admin_email: string | null;
          admin_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          details: NonNullable<Json>;
          grant_id: string;
          gym_id: string;
          id: string;
          member_id: string | null;
          read_at: string;
          updated_at: string;
          updated_by: string | null;
          what: string;
        };
        Insert: {
          admin_email?: string | null;
          admin_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          details?: NonNullable<Json>;
          grant_id: string;
          gym_id: string;
          id?: string;
          member_id?: string | null;
          read_at?: string;
          updated_at?: string;
          updated_by?: string | null;
          what: string;
        };
        Update: {
          admin_email?: string | null;
          admin_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          details?: NonNullable<Json>;
          grant_id?: string;
          gym_id?: string;
          id?: string;
          member_id?: string | null;
          read_at?: string;
          updated_at?: string;
          updated_by?: string | null;
          what?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_reads_grant_id_gym_id_fkey';
            columns: ['grant_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'support_grants';
            referencedColumns: ['id', 'gym_id'];
          },
          {
            foreignKeyName: 'support_reads_member_id_gym_id_fkey';
            columns: ['member_id', 'gym_id'];
            isOneToOne: false;
            referencedRelation: 'members';
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
      add_cash_movement: {
        Args: {
          p_amount: number;
          p_currency: string;
          p_id: string;
          p_kind: string;
          p_reason: string;
          p_shift_id: string;
        };
        Returns: {
          amount: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          kind: string;
          reason: string;
          shift_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'cash_movements';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      add_lockers: {
        Args: {
          p_branch_id: string;
          p_from: number;
          p_kind: string;
          p_prefix: string;
          p_to: number;
          p_zone: string;
        };
        Returns: number;
      };
      arrive_spa_booking: {
        Args: { p_booking_id: string; p_invoice_id?: string; p_payment?: Json };
        Returns: Json;
      };
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
      audit_tables: { Args: Record<PropertyKey, never>; Returns: string[] };
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
      book_class: {
        Args: { p_booking_id: string; p_date: string; p_member_id: string; p_schedule_id: string };
        Returns: Json;
      };
      book_spa: {
        Args: {
          p_branch_id: string;
          p_id: string;
          p_member_id: string;
          p_member_package_id?: string;
          p_note?: string;
          p_paid_with?: string;
          p_room_id: string;
          p_service_id: string;
          p_starts_at: string;
          p_subscription_id?: string;
          p_therapist_id?: string;
          p_walk_in?: boolean;
        };
        Returns: Json;
      };
      branch_occupancy: { Args: { p_branch_id: string }; Returns: number };
      cancel_class_booking: { Args: { p_booking_id: string }; Returns: Json };
      cancel_class_session: {
        Args: { p_date: string; p_reason: string; p_schedule_id: string };
        Returns: Json;
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
      cash_shift_report: { Args: { p_shift_id: string }; Returns: Json };
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
      check_in: {
        Args: {
          p_branch_id: string;
          p_card_uid?: string;
          p_device_id?: string;
          p_id: string;
          p_member_id?: string;
          p_override_note?: string;
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
      check_out: { Args: { p_attendance_id: string }; Returns: Json };
      clear_my_pin_lockout: { Args: Record<PropertyKey, never>; Returns: undefined };
      close_cash_shift: {
        Args: {
          p_counted_iqd: number;
          p_counted_usd?: number;
          p_note?: string;
          p_shift_id: string;
        };
        Returns: Json;
      };
      count_stock: {
        Args: {
          p_branch_id: string;
          p_counted: number;
          p_id: string;
          p_note?: string;
          p_product_id: string;
        };
        Returns: Json;
      };
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
      create_guest: {
        Args: {
          p_branch_id: string;
          p_full_name: string;
          p_gender: string;
          p_id: string;
          p_phone: string;
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
          is_guest: boolean;
          is_walk_in: boolean;
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
          is_guest: boolean;
          is_walk_in: boolean;
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
      dashboard_summary: { Args: { p_branch_id?: string }; Returns: Json };
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
      end_staff_card: {
        Args: { p_card_id: string; p_reason: string };
        Returns: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          staff_id: string;
          status: string;
          uid: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'staff_cards';
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
      give_locker: {
        Args: {
          p_assignment_id: string;
          p_attendance_id?: string;
          p_locker_id: string;
          p_member_id: string;
        };
        Returns: Json;
      };
      give_staff_card: {
        Args: { p_id: string; p_staff_id: string; p_uid: string };
        Returns: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          gym_id: string;
          id: string;
          staff_id: string;
          status: string;
          uid: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'staff_cards';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      grant_support_access: {
        Args: { p_hours: number; p_id: string; p_reason: string };
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
      inside: {
        Args: { p_visit: Database['public']['Tables']['attendance']['Row'] };
        Returns: boolean;
      };
      log_pt_session: {
        Args: {
          p_branch_id: string;
          p_happened_at?: string;
          p_id: string;
          p_member_package_id: string;
          p_note?: string;
          p_status: string;
          p_trainer_id?: string;
        };
        Returns: Json;
      };
      lost_locker_key: {
        Args: {
          p_assignment_id: string;
          p_description: string;
          p_invoice_id: string;
          p_payment?: Json;
        };
        Returns: Json;
      };
      make_guest_member: {
        Args: { p_member_id: string };
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
          is_guest: boolean;
          is_walk_in: boolean;
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
      mark_class_attendance: { Args: { p_booking_id: string; p_status: string }; Returns: Json };
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: number };
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
      member_message_details: { Args: { p_member_id: string }; Returns: Json };
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
      move_spa_booking: {
        Args: {
          p_booking_id: string;
          p_room_id: string;
          p_starts_at: string;
          p_therapist_id?: string;
        };
        Returns: Json;
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
      open_cash_shift: {
        Args: { p_branch_id: string; p_id: string; p_opening_iqd: number; p_opening_usd?: number };
        Returns: {
          branch_id: string;
          close_note: string | null;
          closed_at: string | null;
          closed_by: string | null;
          counted_iqd: number | null;
          counted_usd: number | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          expected_iqd: number | null;
          expected_usd: number | null;
          gym_id: string;
          id: string;
          opened_at: string;
          opened_by: string | null;
          opening_iqd: number;
          opening_usd: number;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'cash_shifts';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      receive_stock: {
        Args: {
          p_branch_id: string;
          p_id: string;
          p_note?: string;
          p_product_id: string;
          p_quantity: number;
          p_unit_cost?: number;
        };
        Returns: Json;
      };
      record_message_opened: {
        Args: {
          p_body: string;
          p_branch_id: string;
          p_id: string;
          p_language: Database['public']['Enums']['language_code'];
          p_member_id: string;
          p_phone: string;
          p_reminder_id?: string;
          p_template_key?: string;
        };
        Returns: {
          body: string;
          branch_id: string;
          channel: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          language: Database['public']['Enums']['language_code'];
          member_id: string;
          phone: string;
          reminder_id: string | null;
          status: string;
          template_key: string | null;
          to_emergency_contact: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'member_messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      refresh_reminders: { Args: Record<PropertyKey, never>; Returns: number };
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
      release_daily_lockers: { Args: { p_branch_id: string }; Returns: number };
      release_locker: { Args: { p_assignment_id: string }; Returns: Json };
      remove_locker: { Args: { p_locker_id: string }; Returns: undefined };
      remove_member_photo: { Args: { p_member_id: string }; Returns: undefined };
      remove_staff_shift: { Args: { p_id: string }; Returns: undefined };
      remove_stock: {
        Args: {
          p_branch_id: string;
          p_id: string;
          p_note?: string;
          p_product_id: string;
          p_quantity: number;
          p_reason: string;
        };
        Returns: Json;
      };
      renew_locker_rental: {
        Args: {
          p_assignment_id: string;
          p_description: string;
          p_invoice_id: string;
          p_months: number;
          p_payment?: Json;
          p_renews_id: string;
        };
        Returns: Json;
      };
      rent_locker: {
        Args: {
          p_assignment_id: string;
          p_description: string;
          p_invoice_id: string;
          p_locker_id: string;
          p_member_id: string;
          p_months: number;
          p_payment?: Json;
          p_starts_on: string;
        };
        Returns: Json;
      };
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
      report_attendance: {
        Args: { p_branch_id?: string; p_from: string; p_to: string };
        Returns: {
          day: string;
          members: number;
          visits: number;
        }[];
      };
      report_cash: {
        Args: { p_branch_id?: string; p_from: string; p_to: string };
        Returns: {
          branch_id: string;
          closed_at: string;
          closed_by: string;
          counted_iqd: number;
          counted_usd: number;
          difference_iqd: number;
          difference_usd: number;
          expected_iqd: number;
          expected_usd: number;
          opened_at: string;
          opened_by: string;
          shift_id: string;
        }[];
      };
      report_discounts: {
        Args: { p_branch_id?: string; p_from: string; p_to: string };
        Returns: {
          discount: number;
          full_name: string;
          invoices: number;
          staff_id: string;
        }[];
      };
      report_inventory: {
        Args: { p_branch_id?: string };
        Returns: {
          branch_id: string;
          low_stock_level: number;
          name_ar: string;
          name_ckb: string;
          name_en: string;
          product_id: string;
          quantity: number;
          unit_cost: number;
          value: number;
        }[];
      };
      report_payments: {
        Args: { p_branch_id?: string; p_from: string; p_to: string };
        Returns: {
          amount: number;
          currency: string;
          dollars: number;
          method: string;
          payments: number;
          refunds: number;
        }[];
      };
      report_peak_hours: {
        Args: { p_branch_id?: string; p_from: string; p_to: string };
        Returns: {
          hour: number;
          visits: number;
          weekday: number;
        }[];
      };
      report_plans: {
        Args: { p_branch_id?: string; p_from: string; p_to: string };
        Returns: {
          name_ar: string;
          name_ckb: string;
          name_en: string;
          plan_id: string;
          revenue: number;
          sold: number;
        }[];
      };
      report_retention: {
        Args: { p_branch_id?: string; p_from: string; p_to: string };
        Returns: {
          ended_on: string;
          full_name: string;
          member_id: string;
          member_number: number;
          renewed_on: string;
          subscription_id: string;
        }[];
      };
      report_revenue: {
        Args: { p_branch_id?: string; p_from: string; p_to: string };
        Returns: {
          amount: number;
          day: string;
          source: string;
        }[];
      };
      report_staff: {
        Args: { p_branch_id?: string; p_from: string; p_to: string };
        Returns: {
          amount: number;
          full_name: string;
          manual_checkins: number;
          payments: number;
          staff_id: string;
          subscriptions: number;
        }[];
      };
      reset_staff_pin: { Args: { p_staff_id: string }; Returns: undefined };
      revoke_support_access: { Args: { p_id: string }; Returns: Json };
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
      save_class_schedule: {
        Args: {
          p_branch_id: string;
          p_capacity: number;
          p_class_type_id: string;
          p_duration_minutes: number;
          p_ends_on?: string;
          p_id: string;
          p_is_active?: boolean;
          p_place?: string;
          p_starts_at: string;
          p_starts_on: string;
          p_trainer_id?: string;
          p_weekday: number;
        };
        Returns: {
          branch_id: string;
          capacity: number;
          class_type_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          duration_minutes: number;
          ends_on: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          place: string | null;
          starts_at: string;
          starts_on: string;
          trainer_id: string | null;
          updated_at: string;
          updated_by: string | null;
          weekday: number;
        };
        SetofOptions: {
          from: '*';
          to: 'class_schedules';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_class_type: {
        Args: {
          p_capacity?: number;
          p_duration_minutes?: number;
          p_id: string;
          p_is_active?: boolean;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
        };
        Returns: {
          capacity: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          duration_minutes: number;
          gym_id: string;
          id: string;
          is_active: boolean;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'class_types';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_message_template: {
        Args: { p_body_ar?: string; p_body_ckb?: string; p_body_en?: string; p_key: string };
        Returns: {
          body_ar: string | null;
          body_ckb: string | null;
          body_en: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          key: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'message_templates';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      save_product: {
        Args: {
          p_barcode?: string;
          p_category_id?: string;
          p_id: string;
          p_is_active?: boolean;
          p_low_stock_level?: number;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
          p_price: number;
          p_track_stock?: boolean;
        };
        Returns: {
          barcode: string | null;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          low_stock_level: number | null;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          price: number;
          track_stock: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'products';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_product_category: {
        Args: {
          p_id: string;
          p_is_active?: boolean;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
          p_sort_order?: number;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'product_categories';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_pt_package: {
        Args: {
          p_id: string;
          p_is_active?: boolean;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
          p_price: number;
          p_session_count: number;
          p_valid_days?: number;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          price: number;
          session_count: number;
          updated_at: string;
          updated_by: string | null;
          valid_days: number | null;
        };
        SetofOptions: {
          from: '*';
          to: 'pt_packages';
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
      save_spa_package: {
        Args: {
          p_id: string;
          p_is_active?: boolean;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
          p_price: number;
          p_service_id: string;
          p_session_count: number;
          p_valid_days?: number;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          price: number;
          service_id: string;
          session_count: number;
          updated_at: string;
          updated_by: string | null;
          valid_days: number | null;
        };
        SetofOptions: {
          from: '*';
          to: 'spa_packages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_spa_room: {
        Args: {
          p_branch_id: string;
          p_capacity?: number;
          p_id: string;
          p_is_active?: boolean;
          p_kind: string;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
        };
        Returns: {
          branch_id: string;
          capacity: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          id: string;
          is_active: boolean;
          kind: string;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'spa_rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_spa_service: {
        Args: {
          p_cleanup_minutes?: number;
          p_duration_minutes: number;
          p_gender?: string;
          p_id: string;
          p_is_active?: boolean;
          p_kind: string;
          p_name_ar?: string;
          p_name_ckb: string;
          p_name_en?: string;
          p_needs_therapist?: boolean;
          p_price: number;
        };
        Returns: {
          cleanup_minutes: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          duration_minutes: number;
          gender: string;
          gym_id: string;
          id: string;
          is_active: boolean;
          kind: string;
          name_ar: string | null;
          name_ckb: string;
          name_en: string | null;
          needs_therapist: boolean;
          price: number;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'spa_services';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_spa_therapist: {
        Args: {
          p_branch_id: string;
          p_commission_percent?: number;
          p_full_name: string;
          p_gender: string;
          p_hours: Json;
          p_id: string;
          p_is_active?: boolean;
          p_phone?: string;
          p_service_ids: string[];
          p_staff_user_id?: string;
        };
        Returns: {
          branch_id: string;
          commission_percent: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          full_name: string;
          gender: string;
          gym_id: string;
          id: string;
          is_active: boolean;
          phone: string | null;
          staff_user_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'spa_therapists';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      save_staff_profile: {
        Args: {
          p_class_fee?: number;
          p_hired_on?: string;
          p_hourly_rate?: number;
          p_monthly_salary?: number;
          p_note?: string;
          p_pt_percent?: number;
          p_salary_type: string;
          p_staff_id: string;
          p_teaches?: boolean;
        };
        Returns: {
          class_fee: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          gym_id: string;
          hired_on: string | null;
          hourly_rate: number | null;
          id: string;
          monthly_salary: number | null;
          note: string | null;
          pt_percent: number;
          salary_type: string;
          teaches: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'staff_profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_staff_shift: {
        Args: {
          p_branch_id: string;
          p_ends_at: string;
          p_id: string;
          p_note?: string;
          p_staff_id: string;
          p_starts_at: string;
        };
        Returns: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          ends_at: string;
          gym_id: string;
          id: string;
          note: string | null;
          shift_time: unknown;
          staff_id: string;
          starts_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'staff_shifts';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
          is_guest: boolean;
          is_walk_in: boolean;
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
      sell_products: {
        Args: {
          p_branch_id: string;
          p_invoice_id: string;
          p_items: Json;
          p_member_id?: string;
          p_payment?: Json;
        };
        Returns: Json;
      };
      sell_pt_package: {
        Args: {
          p_branch_id: string;
          p_invoice_id: string;
          p_member_id: string;
          p_member_package_id: string;
          p_package_id: string;
          p_payment?: Json;
          p_trainer_id: string;
        };
        Returns: Json;
      };
      sell_spa_package: {
        Args: {
          p_branch_id: string;
          p_invoice_id: string;
          p_member_id: string;
          p_member_package_id: string;
          p_package_id: string;
          p_payment?: Json;
        };
        Returns: Json;
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
      seller_support_gyms: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
          ends_at: string;
          grant_id: string;
          gym_id: string;
          name_ckb: string;
          reason: string;
          starts_at: string;
        }[];
      };
      seller_support_member: { Args: { p_gym_id: string; p_member_id: string }; Returns: Json };
      seller_support_members: { Args: { p_gym_id: string; p_search?: string }; Returns: Json };
      seller_support_reads: {
        Args: { p_gym_id: string };
        Returns: {
          admin_email: string;
          details: Json;
          member_id: string;
          read_at: string;
          what: string;
        }[];
      };
      seller_suspend_gym: { Args: { p_gym_id: string; p_reason?: string }; Returns: undefined };
      seller_use_recovery_code: { Args: { p_code: string }; Returns: Json };
      sessions_left:
        | {
            Args: { p_package: Database['public']['Tables']['member_pt_packages']['Row'] };
            Returns: {
              error: true;
            } & 'Could not choose the best candidate function between: public.sessions_left(p_package => member_spa_packages), public.sessions_left(p_package => member_pt_packages). Try renaming the parameters or the function itself in the database so function overloading can be resolved';
          }
        | {
            Args: { p_package: Database['public']['Tables']['member_spa_packages']['Row'] };
            Returns: {
              error: true;
            } & 'Could not choose the best candidate function between: public.sessions_left(p_package => member_spa_packages), public.sessions_left(p_package => member_pt_packages). Try renaming the parameters or the function itself in the database so function overloading can be resolved';
          }
        | {
            Args: { p_sessions: Database['public']['Tables']['subscription_spa_sessions']['Row'] };
            Returns: number;
          };
      set_locker_out_of_order: {
        Args: { p_locker_id: string; p_note?: string };
        Returns: undefined;
      };
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
          is_guest: boolean;
          is_walk_in: boolean;
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
      set_plan_spa_sessions: { Args: { p_plan_id: string; p_sessions: Json }; Returns: Json };
      set_reminder_done: {
        Args: { p_done: boolean; p_id: string };
        Returns: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          details: NonNullable<Json>;
          done_at: string | null;
          done_by: string | null;
          gym_id: string;
          id: string;
          kind: string;
          member_id: string;
          remind_on: string;
          subject_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'reminders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_spa_booking_status: {
        Args: { p_booking_id: string; p_note?: string; p_status: string };
        Returns: Json;
      };
      spa_commissions: {
        Args: { p_branch_id: string; p_from: string; p_until: string };
        Returns: {
          bookings: number;
          commission: number;
          full_name: string;
          therapist_id: string;
          total: number;
        }[];
      };
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
      staff_clock_by_card: { Args: { p_branch_id: string; p_uid: string }; Returns: Json };
      staff_clock_manual: {
        Args: {
          p_at: string;
          p_branch_id: string;
          p_in: boolean;
          p_note: string;
          p_staff_id: string;
        };
        Returns: Json;
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
      stock_levels: {
        Args: { p_branch_id: string };
        Returns: {
          product_id: string;
          quantity: number;
        }[];
      };
      subscription_change_preview: { Args: { p_subscription_id: string }; Returns: Json };
      taken: {
        Args: { p_session: Database['public']['Tables']['class_sessions']['Row'] };
        Returns: number;
      };
      trainer_report: {
        Args: { p_branch_id: string; p_from: string; p_until: string };
        Returns: {
          class_earning: number;
          classes: number;
          clock_minutes: number;
          full_name: string;
          pt_earning: number;
          pt_sessions: number;
          staff_id: string;
        }[];
      };
      trainers: {
        Args: { p_branch_id?: string };
        Returns: {
          full_name: string;
          id: string;
        }[];
      };
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
      update_locker: {
        Args: { p_kind: string; p_locker_id: string; p_number: string; p_zone: string };
        Returns: undefined;
      };
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
          is_guest: boolean;
          is_walk_in: boolean;
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
      used_visits: {
        Args: { p_subscription: Database['public']['Tables']['subscriptions']['Row'] };
        Returns: number;
      };
      void_invoice: { Args: { p_invoice_id: string; p_reason: string }; Returns: undefined };
      void_payment: { Args: { p_payment_id: string; p_reason: string }; Returns: Json };
      void_pt_session: { Args: { p_id: string; p_reason: string }; Returns: undefined };
      void_staff_clock: { Args: { p_reason: string; p_record_id: string }; Returns: undefined };
      void_visit: { Args: { p_attendance_id: string; p_reason: string }; Returns: Json };
      walk_in_member_id: { Args: Record<PropertyKey, never>; Returns: string };
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
