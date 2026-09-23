export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      conversations: {
        Row: { id: string; user_id: string; title: string; created_at: string; updated_at: string; last_message_at: string }
        Insert: { id?: string; user_id: string; title?: string; created_at?: string; updated_at?: string; last_message_at?: string }
        Update: { id?: string; user_id?: string; title?: string; created_at?: string; updated_at?: string; last_message_at?: string }
        Relationships: []
      }
      messages: {
        Row: { id: string; conversation_id: string; user_id: string; role: 'user' | 'assistant' | 'tool' | 'system'; content: Json; status: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled'; openai_response_id: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; conversation_id: string; user_id: string; role: 'user' | 'assistant' | 'tool' | 'system'; content: Json; status?: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled'; openai_response_id?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; conversation_id?: string; user_id?: string; role?: 'user' | 'assistant' | 'tool' | 'system'; content?: Json; status?: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled'; openai_response_id?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      files: {
        Row: { id: string; user_id: string; conversation_id: string | null; storage_bucket: string; storage_path: string; original_name: string; sanitized_name: string; mime_type: string; size_bytes: number; extension: string; status: 'uploading' | 'uploaded' | 'failed' | 'deleted' | 'processing' | 'ready' | 'error'; metadata: Json; created_at: string; updated_at: string; deleted_at: string | null }
        Insert: { id: string; user_id: string; conversation_id?: string | null; storage_bucket?: string; storage_path: string; original_name: string; sanitized_name: string; mime_type: string; size_bytes: number; extension: string; status?: 'uploading' | 'uploaded' | 'failed' | 'deleted' | 'processing' | 'ready' | 'error'; metadata?: Json; created_at?: string; updated_at?: string; deleted_at?: string | null }
        Update: { id?: string; user_id?: string; conversation_id?: string | null; storage_bucket?: string; storage_path?: string; original_name?: string; sanitized_name?: string; mime_type?: string; size_bytes?: number; extension?: string; status?: 'uploading' | 'uploaded' | 'failed' | 'deleted' | 'processing' | 'ready' | 'error'; metadata?: Json; created_at?: string; updated_at?: string; deleted_at?: string | null }
        Relationships: []
      }
      generated_files: {
        Row: { id: string; user_id: string; conversation_id: string; message_id: string | null; tool_execution_id: string | null; storage_bucket: string; storage_path: string; filename: string; mime_type: string; size_bytes: number; metadata: Json; source_definition: Json | null; parent_generated_file_id: string | null; version: number; superseded_at: string | null; created_at: string; expires_at: string | null }
        Insert: { id: string; user_id: string; conversation_id: string; message_id?: string | null; tool_execution_id?: string | null; storage_bucket?: string; storage_path: string; filename: string; mime_type?: string; size_bytes: number; metadata?: Json; source_definition?: Json | null; parent_generated_file_id?: string | null; version?: number; superseded_at?: string | null; created_at?: string; expires_at?: string | null }
        Update: { id?: string; user_id?: string; conversation_id?: string; message_id?: string | null; tool_execution_id?: string | null; storage_bucket?: string; storage_path?: string; filename?: string; mime_type?: string; size_bytes?: number; metadata?: Json; source_definition?: Json | null; parent_generated_file_id?: string | null; version?: number; superseded_at?: string | null; created_at?: string; expires_at?: string | null }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
