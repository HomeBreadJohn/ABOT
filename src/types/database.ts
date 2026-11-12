// Regenerate this file from the local Supabase schema with `npm run db:types`.
// The source of truth for the database is in supabase/migrations.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          preferred_language: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["profiles"]["Row"],
          "created_at" | "updated_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["profiles"]["Row"],
              "created_at" | "updated_at"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          original_filename: string;
          storage_path: string;
          mime_type: string;
          file_size: number;
          document_type: string | null;
          processing_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["documents"]["Row"],
          "id" | "created_at" | "updated_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["documents"]["Row"],
              "id" | "created_at" | "updated_at"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["documents"]["Row"]>;
      };
      document_analyses: {
        Row: {
          id: string;
          document_id: string;
          user_id: string;
          provider: string;
          model: string;
          extracted_data: Json;
          explanation: string | null;
          confidence: number | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["document_analyses"]["Row"],
          "id" | "created_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["document_analyses"]["Row"],
              "id" | "created_at"
            >
          >;
        Update: Partial<
          Database["public"]["Tables"]["document_analyses"]["Row"]
        >;
      };
      document_tasks: {
        Row: {
          id: string;
          document_id: string;
          user_id: string;
          title: string;
          description: string | null;
          due_date: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["document_tasks"]["Row"],
          "id" | "created_at" | "updated_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["document_tasks"]["Row"],
              "id" | "created_at" | "updated_at"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["document_tasks"]["Row"]>;
      };
      document_shares: {
        Row: {
          id: string;
          document_id: string;
          owner_id: string;
          shared_with_user_id: string;
          permission: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["document_shares"]["Row"],
          "id" | "created_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["document_shares"]["Row"],
              "id" | "created_at"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["document_shares"]["Row"]>;
      };
      processing_jobs: {
        Row: {
          id: string;
          document_id: string;
          user_id: string;
          status: string;
          attempts: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["processing_jobs"]["Row"],
          "id" | "created_at" | "updated_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["processing_jobs"]["Row"],
              "id" | "created_at" | "updated_at"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["processing_jobs"]["Row"]>;
      };
    };
  };
};
