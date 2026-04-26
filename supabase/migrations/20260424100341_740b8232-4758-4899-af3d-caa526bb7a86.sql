DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'resident', 'volunteer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.request_type AS ENUM ('medical', 'accident', 'disaster', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.urgency_level AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.request_status AS ENUM ('pending', 'accepted', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Community member' CHECK (char_length(display_name) <= 120),
  phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 40),
  address TEXT CHECK (address IS NULL OR char_length(address) <= 240),
  area TEXT CHECK (area IS NULL OR char_length(area) <= 120),
  avatar_url TEXT CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500),
  is_available BOOLEAN NOT NULL DEFAULT true,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  rating_average NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (rating_average >= 0 AND rating_average <= 5),
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resident_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_volunteer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 140),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 5 AND 2000),
  request_type public.request_type NOT NULL DEFAULT 'other',
  location_text TEXT NOT NULL CHECK (char_length(location_text) BETWEEN 2 AND 240),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  urgency public.urgency_level NOT NULL DEFAULT 'medium',
  status public.request_status NOT NULL DEFAULT 'pending',
  is_sos BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.request_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1200),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.request_status_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.request_status NOT NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volunteer_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  volunteer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 800),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) <= 140),
  body TEXT NOT NULL CHECK (char_length(body) <= 500),
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_request_participant(_request_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.emergency_requests
    WHERE id = _request_id
      AND (resident_id = _user_id OR assigned_volunteer_id = _user_id OR public.has_role(_user_id, 'admin'))
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_role public.app_role;
BEGIN
  selected_role := COALESCE((NEW.raw_user_meta_data ->> 'role')::public.app_role, 'resident'::public.app_role);
  IF selected_role = 'admin' THEN
    selected_role := 'resident';
  END IF;

  INSERT INTO public.profiles (user_id, display_name, phone, address, area)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''), 'Community member'),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'address', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'area', '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, selected_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.update_volunteer_rating_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET rating_average = sub.avg_rating,
      rating_count = sub.rating_count,
      updated_at = now()
  FROM (
    SELECT volunteer_id, ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS rating_count
    FROM public.volunteer_ratings
    WHERE volunteer_id = NEW.volunteer_id
    GROUP BY volunteer_id
  ) sub
  WHERE profiles.user_id = sub.volunteer_id;
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant profiles" ON public.profiles;
CREATE POLICY "Users can view relevant profiles" ON public.profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'volunteer'));

DROP POLICY IF EXISTS "Users can create own profile" ON public.profiles;
CREATE POLICY "Users can create own profile" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view own roles and admins can view all" ON public.user_roles;
CREATE POLICY "Users can view own roles and admins can view all" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Residents volunteers and admins can view requests" ON public.emergency_requests;
CREATE POLICY "Residents volunteers and admins can view requests" ON public.emergency_requests
FOR SELECT TO authenticated
USING (
  resident_id = auth.uid()
  OR assigned_volunteer_id = auth.uid()
  OR (public.has_role(auth.uid(), 'volunteer') AND status = 'pending')
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Residents can create requests" ON public.emergency_requests;
CREATE POLICY "Residents can create requests" ON public.emergency_requests
FOR INSERT TO authenticated
WITH CHECK (resident_id = auth.uid() AND public.has_role(auth.uid(), 'resident'));

DROP POLICY IF EXISTS "Residents volunteers and admins can update requests" ON public.emergency_requests;
CREATE POLICY "Residents volunteers and admins can update requests" ON public.emergency_requests
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (resident_id = auth.uid() AND status = 'pending')
  OR (public.has_role(auth.uid(), 'volunteer') AND (status = 'pending' OR assigned_volunteer_id = auth.uid()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (resident_id = auth.uid())
  OR (public.has_role(auth.uid(), 'volunteer') AND assigned_volunteer_id = auth.uid())
);

DROP POLICY IF EXISTS "Participants can view messages" ON public.request_messages;
CREATE POLICY "Participants can view messages" ON public.request_messages
FOR SELECT TO authenticated
USING (public.is_request_participant(request_id, auth.uid()));

DROP POLICY IF EXISTS "Participants can send messages" ON public.request_messages;
CREATE POLICY "Participants can send messages" ON public.request_messages
FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND public.is_request_participant(request_id, auth.uid()));

DROP POLICY IF EXISTS "Participants can view status events" ON public.request_status_events;
CREATE POLICY "Participants can view status events" ON public.request_status_events
FOR SELECT TO authenticated
USING (public.is_request_participant(request_id, auth.uid()));

DROP POLICY IF EXISTS "Participants can create status events" ON public.request_status_events;
CREATE POLICY "Participants can create status events" ON public.request_status_events
FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid() AND public.is_request_participant(request_id, auth.uid()));

DROP POLICY IF EXISTS "Residents volunteers and admins can view ratings" ON public.volunteer_ratings;
CREATE POLICY "Residents volunteers and admins can view ratings" ON public.volunteer_ratings
FOR SELECT TO authenticated
USING (resident_id = auth.uid() OR volunteer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Residents can rate completed assigned requests" ON public.volunteer_ratings;
CREATE POLICY "Residents can rate completed assigned requests" ON public.volunteer_ratings
FOR INSERT TO authenticated
WITH CHECK (
  resident_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.emergency_requests er
    WHERE er.id = request_id
      AND er.resident_id = auth.uid()
      AND er.assigned_volunteer_id = volunteer_id
      AND er.status = 'completed'
  )
);

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can create own notifications" ON public.notifications;
CREATE POLICY "Users can create own notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_emergency_requests_updated_at ON public.emergency_requests;
CREATE TRIGGER update_emergency_requests_updated_at BEFORE UPDATE ON public.emergency_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_volunteer_rating_summary_trigger ON public.volunteer_ratings;
CREATE TRIGGER update_volunteer_rating_summary_trigger AFTER INSERT ON public.volunteer_ratings FOR EACH ROW EXECUTE FUNCTION public.update_volunteer_rating_summary();

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_resident ON public.emergency_requests(resident_id);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_volunteer ON public.emergency_requests(assigned_volunteer_id);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status_urgency ON public.emergency_requests(status, urgency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_messages_request_created ON public.request_messages(request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);