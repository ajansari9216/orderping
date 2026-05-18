-- OrderPing Production Supabase Schema
-- Designed for idempotent execution (rerunnable)

-- 1. CREATE TABLES FIRST
-- We define structures before enabling security or adding triggers

-- Profiles: Extended user information
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Settings: Global app preferences
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_name TEXT,
  active_template_id TEXT,
  haptic_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Uploads: Groups of orders processed together
CREATE TABLE IF NOT EXISTS public.uploads (
  id TEXT PRIMARY KEY, -- Group ID (client-side generated)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders: Individual COD confirmations
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY, -- Unique Order ID
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id TEXT REFERENCES public.uploads(id) ON DELETE SET NULL,
  customer_name TEXT,
  phone TEXT,
  product TEXT,
  amount TEXT,
  status TEXT DEFAULT 'pending', -- pending, confirmed, canceled, invalid
  risk_level TEXT DEFAULT 'low', -- low, medium, high
  repeat_customer BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Templates: Reusable WhatsApp message templates
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_text TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.templates ENABLE ROW LEVEL SECURITY;

-- 3. CREATE POLICIES (USER ISOLATION)
-- We drop existing policies first to prevent "already exists" errors during re-run

DO $$ 
BEGIN
    -- Profiles
    DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
    CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

    -- User Settings
    DROP POLICY IF EXISTS "Users can manage their own settings" ON public.user_settings;
    CREATE POLICY "Users can manage their own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);

    -- Uploads
    DROP POLICY IF EXISTS "Users can manage their own uploads" ON public.uploads;
    CREATE POLICY "Users can manage their own uploads" ON public.uploads FOR ALL USING (auth.uid() = user_id);

    -- Orders
    DROP POLICY IF EXISTS "Users can manage their own orders" ON public.orders;
    CREATE POLICY "Users can manage their own orders" ON public.orders FOR ALL USING (auth.uid() = user_id);

    -- Templates
    DROP POLICY IF EXISTS "Users can manage their own templates" ON public.templates;
    CREATE POLICY "Users can manage their own templates" ON public.templates FOR ALL USING (auth.uid() = user_id);
END $$;

-- 4. AUTOMATED PROFILE SYNC (Triggers)
-- Ensures every new auth.user gets a profile and setting record immediately

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (new.id, new.email);
  
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Safe trigger creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
