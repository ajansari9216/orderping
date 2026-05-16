-- SQL Schema for Supabase Integration (Hardened SaaS Version)

-- 1. CREATE TABLES (NO RLS YET)
-- All tables use UUID from auth.users for security and scale

-- Profiles: Extended user information
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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
  id TEXT PRIMARY KEY, -- nanoId from client
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  total_orders INTEGER DEFAULT 0,
  timestamp BIGINT, -- JS timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders: Individual COD confirmations
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY, -- orderId from client/file
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id TEXT REFERENCES public.uploads(id) ON DELETE CASCADE,
  customer_name TEXT,
  phone_number TEXT,
  product_name TEXT,
  amount TEXT,
  status TEXT DEFAULT 'pending', -- pending, confirmed, opened
  delivery_status TEXT DEFAULT 'unfulfilled',
  notes TEXT,
  timestamp BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Templates: Reusable WhatsApp message templates
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- 3. CREATE POLICIES (USER ISOLATION)

-- Profiles
DO $$ BEGIN
  CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User Settings
DO $$ BEGIN
  CREATE POLICY "Users can manage their own settings" ON public.user_settings 
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Uploads
DO $$ BEGIN
  CREATE POLICY "Users can manage their own uploads" ON public.uploads 
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Orders
DO $$ BEGIN
  CREATE POLICY "Users can manage their own orders" ON public.orders 
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Templates
DO $$ BEGIN
  CREATE POLICY "Users can manage their own templates" ON public.templates 
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. AUTOMATED PROFILE SYNC (SaaS Best Practice)
-- Automatically create profile and settings rows when a user signs up via Supabase Auth

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  
  -- Create default settings
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger registration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END $$;
