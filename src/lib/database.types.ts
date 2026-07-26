// Gerado a partir do schema do Supabase (projeto brwfbyxthuqwwwzlzbwj).
// Para atualizar depois de mudar o banco:
//   npx supabase gen types typescript --project-id brwfbyxthuqwwwzlzbwj > src/lib/database.types.ts

export type Database = {
  public: {
    Tables: {
      prospects: {
        Row: {
          address: string | null
          approach_message: string | null
          city: string
          contact: string | null
          created_at: string
          email: string | null
          google_cid: string | null
          google_place_id: string | null
          google_rating: number | null
          google_reviews_count: number | null
          id: string
          instagram: string | null
          landing_page_url: string | null
          last_contacted_at: string | null
          name: string
          next_action_at: string | null
          notes: string | null
          preview_images: string[] | null
          problem: string | null
          prospected_at: string
          segment: string
          slug: string | null
          status: Database['public']['Enums']['prospect_status']
          updated_at: string
          website: string | null
          website_quality: string | null
        }
        Insert: {
          address?: string | null
          approach_message?: string | null
          city?: string
          contact?: string | null
          created_at?: string
          email?: string | null
          google_cid?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_reviews_count?: number | null
          id?: string
          instagram?: string | null
          landing_page_url?: string | null
          last_contacted_at?: string | null
          name: string
          next_action_at?: string | null
          notes?: string | null
          preview_images?: string[] | null
          problem?: string | null
          prospected_at?: string
          segment: string
          slug?: string | null
          status?: Database['public']['Enums']['prospect_status']
          updated_at?: string
          website?: string | null
          website_quality?: string | null
        }
        Update: Partial<Database['public']['Tables']['prospects']['Insert']>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      prospect_status:
        | 'novo'
        | 'prototipado'
        | 'contatado'
        | 'respondeu'
        | 'negociando'
        | 'fechado'
        | 'perdido'
        | 'descartado'
    }
    CompositeTypes: Record<never, never>
  }
}

export type Prospect = Database['public']['Tables']['prospects']['Row']
export type ProspectUpdate = Database['public']['Tables']['prospects']['Update']
export type ProspectStatus = Database['public']['Enums']['prospect_status']
