
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "analysis_translations": {
                  Row: {
                    "analysis_id": string,"created_at": string,"id": string,"language": string,"translated_json": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_id": string,"created_at"?: string,"id"?: string,"language": string,"translated_json"?: NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "analysis_id"?: string,"created_at"?: string,"id"?: string,"language"?: string,"translated_json"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "analysis_translations_analysis_id_fkey"
      columns: ["analysis_id"]
isOneToOne: false
      referencedRelation: "document_analyses"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"document_id": string,"id": string,"lumen_session_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_id": string,"id"?: string,"lumen_session_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"document_id"?: string,"id"?: string,"lumen_session_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"cross_document_analyses": {
                  Row: {
                    "created_at": string,"id": string,"report_json": Json | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"report_json"?: Json | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"report_json"?: Json | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cross_document_analysis_documents": {
                  Row: {
                    "created_at": string,"cross_document_analysis_id": string,"document_id": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"cross_document_analysis_id": string,"document_id": string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"cross_document_analysis_id"?: string,"document_id"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cross_document_analysis_documen_cross_document_analysis_id_fkey"
      columns: ["cross_document_analysis_id"]
isOneToOne: false
      referencedRelation: "cross_document_analyses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cross_document_analysis_documents_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"document_analyses": {
                  Row: {
                    "completed_at": string | null,"confidence": number | null,"created_at": string,"document_id": string,"explanation": string | null,"extracted_data": NonNullable<Json>,"id": string,"idempotency_key": string | null,"language": string | null,"model": string,"model_instance_id": string | null,"provider": string,"report_json": Json | null,"schema_version": string | null,"status": string,"user_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"confidence"?: number | null,"created_at"?: string,"document_id": string,"explanation"?: string | null,"extracted_data"?: NonNullable<Json>,"id"?: string,"idempotency_key"?: string | null,"language"?: string | null,"model": string,"model_instance_id"?: string | null,"provider": string,"report_json"?: Json | null,"schema_version"?: string | null,"status"?: string,"user_id": string,"version"?: number
                  }
                  Update: {
                    "completed_at"?: string | null,"confidence"?: number | null,"created_at"?: string,"document_id"?: string,"explanation"?: string | null,"extracted_data"?: NonNullable<Json>,"id"?: string,"idempotency_key"?: string | null,"language"?: string | null,"model"?: string,"model_instance_id"?: string | null,"provider"?: string,"report_json"?: Json | null,"schema_version"?: string | null,"status"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_analyses_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"document_chunks": {
                  Row: {
                    "chunk_index": number,"content": string,"created_at": string,"document_id": string,"id": string,"page_end": number,"page_start": number,"processing_status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chunk_index": number,"content": string,"created_at"?: string,"document_id": string,"id"?: string,"page_end": number,"page_start": number,"processing_status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "chunk_index"?: number,"content"?: string,"created_at"?: string,"document_id"?: string,"id"?: string,"page_end"?: number,"page_start"?: number,"processing_status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_chunks_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"document_pages": {
                  Row: {
                    "average_confidence": number | null,"created_at": string,"document_id": string,"extracted_text": string,"id": string,"ocr_status": string,"page_metadata": NonNullable<Json>,"page_number": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "average_confidence"?: number | null,"created_at"?: string,"document_id": string,"extracted_text"?: string,"id"?: string,"ocr_status": string,"page_metadata"?: NonNullable<Json>,"page_number": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "average_confidence"?: number | null,"created_at"?: string,"document_id"?: string,"extracted_text"?: string,"id"?: string,"ocr_status"?: string,"page_metadata"?: NonNullable<Json>,"page_number"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_pages_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"document_relationships": {
                  Row: {
                    "approval_status": string,"confidence": number | null,"created_at": string,"id": string,"relationship_type": string,"source_document_id": string,"target_document_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_status"?: string,"confidence"?: number | null,"created_at"?: string,"id"?: string,"relationship_type": string,"source_document_id": string,"target_document_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "approval_status"?: string,"confidence"?: number | null,"created_at"?: string,"id"?: string,"relationship_type"?: string,"source_document_id"?: string,"target_document_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_relationships_source_document_id_fkey"
      columns: ["source_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_relationships_target_document_id_fkey"
      columns: ["target_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"document_shares": {
                  Row: {
                    "created_at": string,"document_id": string,"id": string,"owner_id": string,"permission": string,"shared_with_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_id": string,"id"?: string,"owner_id": string,"permission"?: string,"shared_with_user_id": string
                  }
                  Update: {
                    "created_at"?: string,"document_id"?: string,"id"?: string,"owner_id"?: string,"permission"?: string,"shared_with_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_shares_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"document_tasks": {
                  Row: {
                    "created_at": string,"description": string | null,"document_id": string,"due_date": string | null,"id": string,"status": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"document_id": string,"due_date"?: string | null,"id"?: string,"status"?: string,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"document_id"?: string,"due_date"?: string | null,"id"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_tasks_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "category": string | null,"classification_confidence": number | null,"created_at": string,"document_type": string | null,"file_size": number,"id": string,"language": string | null,"mime_type": string,"ocr_document_id": string | null,"original_filename": string,"processing_status": string,"storage_path": string,"subtype": string | null,"title": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"classification_confidence"?: number | null,"created_at"?: string,"document_type"?: string | null,"file_size": number,"id"?: string,"language"?: string | null,"mime_type": string,"ocr_document_id"?: string | null,"original_filename": string,"processing_status"?: string,"storage_path": string,"subtype"?: string | null,"title"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "category"?: string | null,"classification_confidence"?: number | null,"created_at"?: string,"document_type"?: string | null,"file_size"?: number,"id"?: string,"language"?: string | null,"mime_type"?: string,"ocr_document_id"?: string | null,"original_filename"?: string,"processing_status"?: string,"storage_path"?: string,"subtype"?: string | null,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evidence_references": {
                  Row: {
                    "created_at": string,"document_id": string,"excerpt": string,"finding_id": string,"id": string,"match_confidence": number | null,"page_number": number,"source_type": string,"user_id": string,"word_end": number,"word_start": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_id": string,"excerpt": string,"finding_id": string,"id"?: string,"match_confidence"?: number | null,"page_number": number,"source_type": string,"user_id": string,"word_end"?: number,"word_start"?: number
                  }
                  Update: {
                    "created_at"?: string,"document_id"?: string,"excerpt"?: string,"finding_id"?: string,"id"?: string,"match_confidence"?: number | null,"page_number"?: number,"source_type"?: string,"user_id"?: string,"word_end"?: number,"word_start"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_references_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_references_finding_id_fkey"
      columns: ["finding_id"]
isOneToOne: false
      referencedRelation: "findings"
      referencedColumns: ["id"]
    }
                  ]
                },"findings": {
                  Row: {
                    "analysis_id": string,"basis": string | null,"confidence": number | null,"created_at": string,"document_id": string,"explanation": string,"finding_type": string,"id": string,"information_status": string,"severity": string,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_id": string,"basis"?: string | null,"confidence"?: number | null,"created_at"?: string,"document_id": string,"explanation": string,"finding_type": string,"id"?: string,"information_status": string,"severity": string,"title": string,"user_id": string
                  }
                  Update: {
                    "analysis_id"?: string,"basis"?: string | null,"confidence"?: number | null,"created_at"?: string,"document_id"?: string,"explanation"?: string,"finding_type"?: string,"id"?: string,"information_status"?: string,"severity"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "findings_analysis_id_fkey"
      columns: ["analysis_id"]
isOneToOne: false
      referencedRelation: "document_analyses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "content": string,"conversation_id": string,"created_at": string,"id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"conversation_id": string,"created_at"?: string,"id"?: string,"role": string,"user_id": string
                  }
                  Update: {
                    "content"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"ocr_corrections": {
                  Row: {
                    "corrected_value": string,"correction_status": string,"created_at": string,"document_id": string,"id": string,"original_value": string,"page_number": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "corrected_value": string,"correction_status"?: string,"created_at"?: string,"document_id": string,"id"?: string,"original_value": string,"page_number": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "corrected_value"?: string,"correction_status"?: string,"created_at"?: string,"document_id"?: string,"id"?: string,"original_value"?: string,"page_number"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ocr_corrections_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"processing_jobs": {
                  Row: {
                    "attempts": number,"completed_at": string | null,"created_at": string,"document_id": string,"error_code": string | null,"error_message": string | null,"id": string,"idempotency_key": string | null,"job_type": string,"lease_expires_at": string | null,"max_attempts": number,"payload": NonNullable<Json>,"run_after": string,"started_at": string | null,"status": string,"step": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"document_id": string,"error_code"?: string | null,"error_message"?: string | null,"id"?: string,"idempotency_key"?: string | null,"job_type"?: string,"lease_expires_at"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"run_after"?: string,"started_at"?: string | null,"status"?: string,"step"?: number | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"document_id"?: string,"error_code"?: string | null,"error_message"?: string | null,"id"?: string,"idempotency_key"?: string | null,"job_type"?: string,"lease_expires_at"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"run_after"?: string,"started_at"?: string | null,"status"?: string,"step"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "processing_jobs_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string | null,"id": string,"preferred_language": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name"?: string | null,"id": string,"preferred_language"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string | null,"id"?: string,"preferred_language"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"provider_calls": {
                  Row: {
                    "created_at": string,"credits": number,"document_id": string | null,"duration_ms": number,"id": string,"operation": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"credits": number,"document_id"?: string | null,"duration_ms": number,"id"?: string,"operation": string,"status": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"credits"?: number,"document_id"?: string | null,"duration_ms"?: number,"id"?: string,"operation"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_calls_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"reminders": {
                  Row: {
                    "created_at": string,"description": string | null,"document_id": string | null,"due_at": string | null,"id": string,"reminder_at": string | null,"status": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"document_id"?: string | null,"due_at"?: string | null,"id"?: string,"reminder_at"?: string | null,"status"?: string,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"document_id"?: string | null,"due_at"?: string | null,"id"?: string,"reminder_at"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_processing_job":
{ Args: { "lease_seconds": number }; Returns: {
              "attempts": number,
"completed_at": string | null,
"created_at": string,
"document_id": string,
"error_code": string | null,
"error_message": string | null,
"id": string,
"idempotency_key": string | null,
"job_type": string,
"lease_expires_at": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"run_after": string,
"started_at": string | null,
"status": string,
"step": number | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "processing_jobs"
        isOneToOne: true
        isSetofReturn: false
      } },
"owns_document":
{ Args: { "p_document_id": string }; Returns: boolean
                           },
"persist_analysis":
{ Args: { "p_document_id": string,"p_evidence": Json,"p_findings": Json,"p_idempotency_key": string,"p_language": string,"p_model_instance_id": string,"p_outcome": string,"p_report": Json,"p_schema_version": string,"p_user_id": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
