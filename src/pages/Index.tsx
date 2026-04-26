import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Clock, HeartHandshake, LogOut, MapPin, MessageCircle, Radio, Shield, Star, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// AidConnect is implemented with Lovable Cloud for auth, database, and realtime updates.
type Role = Database["public"]["Enums"]["app_role"];
type RequestType = Database["public"]["Enums"]["request_type"];
type Urgency = Database["public"]["Enums"]["urgency_level"];
type RequestStatus = Database["public"]["Enums"]["request_status"];
type EmergencyRequest = Database["public"]["Tables"]["emergency_requests"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Message = Database["public"]["Tables"]["request_messages"]["Row"];
type Notification = Database["public"]["Tables"]["notifications"]["Row"];
type Rating = Database["public"]["Tables"]["volunteer_ratings"]["Row"];

type SessionUser = { id: string; email?: string } | null;

type AuthMode = "signin" | "signup";

const requestTypes: RequestType[] = ["medical", "accident", "disaster", "other"];
const urgencyLevels: Urgency[] = ["low", "medium", "high"];

const statusLabels: Record<RequestStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  completed: "Completed",
  cancelled: "Cancelled",
};

const urgencyLabels: Record<Urgency, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const typeLabels: Record<RequestType, string> = {
  medical: "Medical",
  accident: "Accident",
  disaster: "Disaster",
  other: "Other",
};

const clampText = (value: string, max = 500) => value.trim().slice(0, max);

const distanceKm = (aLat?: number | null, aLng?: number | null, bLat?: number | null, bLng?: number | null) => {
  if ([aLat, aLng, bLat, bLng].some((value) => typeof value !== "number")) return null;
  const radius = 6371;
  const dLat = (((bLat as number) - (aLat as number)) * Math.PI) / 180;
  const dLng = (((bLng as number) - (aLng as number)) * Math.PI) / 180;
  const lat1 = ((aLat as number) * Math.PI) / 180;
  const lat2 = ((bLat as number) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
};

const urgencyRank: Record<Urgency, number> = { high: 3, medium: 2, low: 1 };

const urgentClass: Record<Urgency, string> = {
  high: "border-[hsl(var(--urgency-high-border))] bg-[hsl(var(--urgency-high-soft))] text-[hsl(var(--urgency-high))]",
  medium: "border-[hsl(var(--urgency-medium-border))] bg-[hsl(var(--urgency-medium-soft))] text-[hsl(var(--urgency-medium))]",
  low: "border-[hsl(var(--urgency-low-border))] bg-[hsl(var(--urgency-low-soft))] text-[hsl(var(--urgency-low))]",
};

const statusClass: Record<RequestStatus, string> = {
  pending: "border-[hsl(var(--urgency-medium-border))] bg-[hsl(var(--urgency-medium-soft))] text-[hsl(var(--urgency-medium))]",
  accepted: "border-[hsl(var(--aid-blue-border))] bg-[hsl(var(--aid-blue-soft))] text-[hsl(var(--aid-blue))]",
  completed: "border-[hsl(var(--urgency-low-border))] bg-[hsl(var(--urgency-low-soft))] text-[hsl(var(--urgency-low))]",
  cancelled: "border-border bg-muted text-muted-foreground",
};

const AidConnect = () => {
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [user, setUser] = useState<SessionUser>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"resident" | "volunteer" | "admin">("resident");

  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    displayName: "",
    phone: "",
    address: "",
    area: "",
    role: "resident" as Exclude<Role, "admin">,
  });

  const [requestForm, setRequestForm] = useState({
    title: "",
    description: "",
    request_type: "medical" as RequestType,
    location_text: "",
    urgency: "medium" as Urgency,
    latitude: null as number | null,
    longitude: null as number | null,
  });

  const [messageBody, setMessageBody] = useState("");
  const [ratingForm, setRatingForm] = useState({ rating: 5, comment: "" });

  const primaryRole = roles.includes("admin") ? "admin" : roles.includes("volunteer") ? "volunteer" : "resident";

  useEffect(() => {
    const setupAuth = async () => {
      const { data } = await supabase.auth.getSession();
      const authUser = data.session?.user;
      setUser(authUser ? { id: authUser.id, email: authUser.email ?? undefined } : null);
      setLoading(false);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user;
      setUser(authUser ? { id: authUser.id, email: authUser.email ?? undefined } : null);
    });

    setupAuth();
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setRoles([]);
      setRequests([]);
      setProfiles([]);
      setMessages([]);
      setNotifications([]);
      setRatings([]);
      return;
    }

    refreshAll();

    const channel = supabase
      .channel("aidconnect-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_requests" }, () => {
        toast.info("Emergency request update received");
        refreshRequests();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "request_messages" }, () => {
        toast("New chat message");
        refreshMessages();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        refreshNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (primaryRole) setActiveTab(primaryRole);
  }, [primaryRole]);

  const refreshAll = async () => {
    await Promise.all([refreshProfileAndRoles(), refreshRequests(), refreshProfiles(), refreshMessages(), refreshNotifications(), refreshRatings()]);
  };

  const refreshProfileAndRoles = async () => {
    if (!user) return;
    const [{ data: profileData }, { data: roleData }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    setProfile(profileData ?? null);
    setRoles((roleData ?? []).map((row) => row.role));
  };

  const refreshRequests = async () => {
    const { data, error } = await supabase.from("emergency_requests").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRequests(data ?? []);
  };

  const refreshProfiles = async () => {
    const { data } = await supabase.from("profiles").select("*").order("display_name");
    setProfiles(data ?? []);
  };

  const refreshMessages = async () => {
    const { data } = await supabase.from("request_messages").select("*").order("created_at", { ascending: true });
    setMessages(data ?? []);
  };

  const refreshNotifications = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setNotifications(data ?? []);
  };

  const refreshRatings = async () => {
    const { data } = await supabase.from("volunteer_ratings").select("*").order("created_at", { ascending: false });
    setRatings(data ?? []);
  };

  const signUp = async () => {
    if (!authForm.email.includes("@") || authForm.password.length < 6 || authForm.displayName.trim().length < 2) {
      toast.error("Enter a valid email, 6+ character password, and name.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: authForm.email.trim(),
      password: authForm.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          role: authForm.role,
          display_name: clampText(authForm.displayName, 120),
          phone: clampText(authForm.phone, 40),
          address: clampText(authForm.address, 240),
          area: clampText(authForm.area, 120),
        },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Account created. Check your email if confirmation is required.");
  };

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authForm.email.trim(), password: authForm.password });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome to AidConnect");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    toast("Signed out safely");
  };

  const captureLocation = async (forProfile = false) => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not available in this browser.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        if (forProfile && user) {
          await supabase.from("profiles").update(coords).eq("user_id", user.id);
          await refreshProfileAndRoles();
          toast.success("Volunteer location updated");
        } else {
          setRequestForm((current) => ({ ...current, ...coords, location_text: current.location_text || "Current device location" }));
          toast.success("Location attached to request");
        }
        setGeoBusy(false);
      },
      () => {
        toast.error("Location permission was denied. You can type the location manually.");
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const createRequest = async (isSos = false) => {
    if (!user) return;
    const payload = isSos
      ? {
          resident_id: user.id,
          title: "SOS emergency assistance needed",
          description: "Immediate assistance requested through the SOS button.",
          request_type: "other" as RequestType,
          location_text: requestForm.location_text || profile?.address || profile?.area || "Location pending",
          urgency: "high" as Urgency,
          latitude: requestForm.latitude ?? profile?.latitude,
          longitude: requestForm.longitude ?? profile?.longitude,
          is_sos: true,
        }
      : {
          resident_id: user.id,
          title: clampText(requestForm.title, 140),
          description: clampText(requestForm.description, 2000),
          request_type: requestForm.request_type,
          location_text: clampText(requestForm.location_text, 240),
          urgency: requestForm.urgency,
          latitude: requestForm.latitude,
          longitude: requestForm.longitude,
          is_sos: false,
        };

    if (!payload.title || payload.title.length < 3 || !payload.description || payload.description.length < 5 || !payload.location_text) {
      toast.error("Add a title, details, and location before submitting.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.from("emergency_requests").insert(payload).select("id").single();
    if (!error && data) {
      await supabase.from("request_status_events").insert({ request_id: data.id, actor_id: user.id, status: "pending", note: isSos ? "SOS request created" : "Request created" });
      setRequestForm({ title: "", description: "", request_type: "medical", location_text: "", urgency: "medium", latitude: null, longitude: null });
      toast.success(isSos ? "SOS request broadcast" : "Emergency request created");
      refreshRequests();
    } else if (error) {
      toast.error(error.message);
    }
    setBusy(false);
  };

  const acceptRequest = async (request: EmergencyRequest) => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("emergency_requests")
      .update({ status: "accepted", assigned_volunteer_id: user.id, accepted_at: new Date().toISOString() })
      .eq("id", request.id)
      .eq("status", "pending");
    if (error) toast.error(error.message);
    else {
      await supabase.from("request_status_events").insert({ request_id: request.id, actor_id: user.id, status: "accepted", note: "Volunteer accepted the request" });
      await supabase.from("notifications").insert({ user_id: request.resident_id, request_id: request.id, title: "Volunteer assigned", body: "A nearby volunteer accepted your emergency request." });
      toast.success("Request accepted");
      refreshAll();
    }
    setBusy(false);
  };

  const completeRequest = async (request: EmergencyRequest) => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("emergency_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", request.id);
    if (error) toast.error(error.message);
    else {
      await supabase.from("request_status_events").insert({ request_id: request.id, actor_id: user.id, status: "completed", note: "Request marked completed" });
      await supabase.from("notifications").insert({ user_id: request.resident_id, request_id: request.id, title: "Request completed", body: "Your emergency request was marked completed. You can now rate the volunteer." });
      toast.success("Marked completed");
      refreshAll();
    }
    setBusy(false);
  };

  const cancelRequest = async (request: EmergencyRequest) => {
    if (!user) return;
    const { error } = await supabase.from("emergency_requests").update({ status: "cancelled" }).eq("id", request.id);
    if (error) toast.error(error.message);
    else {
      await supabase.from("request_status_events").insert({ request_id: request.id, actor_id: user.id, status: "cancelled", note: "Request cancelled" });
      toast("Request cancelled");
      refreshRequests();
    }
  };

  const sendMessage = async () => {
    if (!user || !selectedRequestId || !messageBody.trim()) return;
    const { error } = await supabase.from("request_messages").insert({ request_id: selectedRequestId, sender_id: user.id, body: clampText(messageBody, 1200) });
    if (error) toast.error(error.message);
    else {
      setMessageBody("");
      refreshMessages();
    }
  };

  const submitRating = async (request: EmergencyRequest) => {
    if (!user || !request.assigned_volunteer_id) return;
    const { error } = await supabase.from("volunteer_ratings").insert({
      request_id: request.id,
      resident_id: user.id,
      volunteer_id: request.assigned_volunteer_id,
      rating: ratingForm.rating,
      comment: clampText(ratingForm.comment, 800) || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Volunteer rated. Thank you.");
      setRatingForm({ rating: 5, comment: "" });
      refreshRatings();
      refreshProfiles();
    }
  };

  const updateProfileAvailability = async (available: boolean) => {
    if (!user) return;
    await supabase.from("profiles").update({ is_available: available }).eq("user_id", user.id);
    refreshProfileAndRoles();
  };

  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? null;
  const myRequests = requests.filter((request) => request.resident_id === user?.id);
  const volunteerRequests = requests.filter((request) => request.assigned_volunteer_id === user?.id);
  const openRequests = useMemo(() => {
    return requests
      .filter((request) => request.status === "pending")
      .sort((a, b) => urgencyRank[b.urgency] - urgencyRank[a.urgency] || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [requests]);
  const participantMessages = selectedRequest ? messages.filter((message) => message.request_id === selectedRequest.id) : [];

  const analytics = {
    total: requests.length,
    pending: requests.filter((request) => request.status === "pending").length,
    accepted: requests.filter((request) => request.status === "accepted").length,
    completed: requests.filter((request) => request.status === "completed").length,
    volunteers: profiles.filter((profileRow) => profiles.some(Boolean) && requests.some((request) => request.assigned_volunteer_id === profileRow.user_id)).length,
    residents: new Set(requests.map((request) => request.resident_id)).size,
  };

  if (loading) {
    return <main className="min-h-screen bg-background text-foreground grid place-items-center"><Radio className="h-10 w-10 animate-pulse text-primary" /></main>;
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <section className="relative overflow-hidden border-b bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--aid-blue-soft)),hsl(var(--urgency-high-soft)))]">
          <div className="mx-auto grid min-h-[92vh] max-w-7xl gap-10 px-5 py-8 md:grid-cols-[1.1fr_0.9fr] md:px-8 md:py-14">
            <div className="flex flex-col justify-center">
              <Badge className="mb-6 w-fit border-[hsl(var(--aid-blue-border))] bg-[hsl(var(--aid-blue-soft))] text-[hsl(var(--aid-blue))]" variant="outline">
                Live local emergency coordination
              </Badge>
              <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-normal text-foreground md:text-7xl">
                AidConnect
              </h1>
              <p className="mt-5 max-w-2xl text-xl font-semibold text-foreground md:text-2xl">
                Local Community Assistance Platform for Emergency Help
              </p>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
                Residents can send urgent requests with location, volunteers respond in real time, and admins keep the community response network visible and accountable.
              </p>
              <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
                <SignalCard icon={<AlertTriangle />} label="SOS requests" value="High priority" />
                <SignalCard icon={<MessageCircle />} label="Live chat" value="After accept" />
                <SignalCard icon={<Shield />} label="Secure roles" value="Cloud backed" />
              </div>
            </div>

            <Card className="self-center rounded-[var(--radius)] border-border/80 shadow-[var(--shadow-command)]">
              <CardHeader>
                <CardTitle>{authMode === "signin" ? "Log in" : "Create account"}</CardTitle>
                <CardDescription>{authMode === "signin" ? "Access your emergency dashboard." : "Join as a resident or volunteer."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {authMode === "signup" && (
                  <>
                    <Field label="Full name"><Input value={authForm.displayName} onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })} maxLength={120} /></Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Phone"><Input value={authForm.phone} onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })} maxLength={40} /></Field>
                      <Field label="Area"><Input value={authForm.area} onChange={(e) => setAuthForm({ ...authForm, area: e.target.value })} maxLength={120} /></Field>
                    </div>
                    <Field label="Address"><Input value={authForm.address} onChange={(e) => setAuthForm({ ...authForm, address: e.target.value })} maxLength={240} /></Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant={authForm.role === "resident" ? "default" : "outline"} onClick={() => setAuthForm({ ...authForm, role: "resident" })}>Resident</Button>
                      <Button variant={authForm.role === "volunteer" ? "default" : "outline"} onClick={() => setAuthForm({ ...authForm, role: "volunteer" })}>Volunteer</Button>
                    </div>
                  </>
                )}
                <Field label="Email"><Input type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} /></Field>
                <Field label="Password"><Input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} minLength={6} /></Field>
                <Button className="w-full" size="lg" disabled={busy} onClick={authMode === "signin" ? signIn : signUp}>{authMode === "signin" ? "Log in" : "Sign up"}</Button>
                <Button className="w-full" variant="ghost" onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}>
                  {authMode === "signin" ? "Need an account? Sign up" : "Already registered? Log in"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-normal text-primary">AidConnect Command</p>
            <h1 className="text-2xl font-black tracking-normal">Community emergency response</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["resident", "volunteer", "admin"] as const).map((tab) =>
              roles.includes(tab) ? <Button key={tab} size="sm" variant={activeTab === tab ? "default" : "outline"} onClick={() => setActiveTab(tab)}>{tab}</Button> : null,
            )}
            <Button size="sm" variant="outline" onClick={signOut}><LogOut /> Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 md:px-8 lg:grid-cols-[1fr_340px]">
        <section className="space-y-6">
          <ProfileStrip profile={profile} roles={roles} notifications={notifications} />
          {activeTab === "resident" && (
            <ResidentDashboard
              busy={busy}
              geoBusy={geoBusy}
              requestForm={requestForm}
              setRequestForm={setRequestForm}
              createRequest={createRequest}
              captureLocation={() => captureLocation(false)}
              myRequests={myRequests}
              profiles={profiles}
              ratings={ratings}
              selectedRequestId={selectedRequestId}
              setSelectedRequestId={setSelectedRequestId}
              cancelRequest={cancelRequest}
              submitRating={submitRating}
              ratingForm={ratingForm}
              setRatingForm={setRatingForm}
            />
          )}
          {activeTab === "volunteer" && (
            <VolunteerDashboard
              profile={profile}
              openRequests={openRequests}
              assignedRequests={volunteerRequests}
              profiles={profiles}
              acceptRequest={acceptRequest}
              completeRequest={completeRequest}
              captureLocation={() => captureLocation(true)}
              geoBusy={geoBusy}
              busy={busy}
              updateAvailability={updateProfileAvailability}
              selectedRequestId={selectedRequestId}
              setSelectedRequestId={setSelectedRequestId}
            />
          )}
          {activeTab === "admin" && <AdminDashboard analytics={analytics} requests={requests} profiles={profiles} roles={roles} />}
        </section>

        <aside className="space-y-6">
          <ChatPanel request={selectedRequest} messages={participantMessages} profiles={profiles} userId={user.id} messageBody={messageBody} setMessageBody={setMessageBody} sendMessage={sendMessage} />
          <Card className="rounded-[var(--radius)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-primary" /> Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notifications.length === 0 ? <p className="text-sm text-muted-foreground">No alerts yet.</p> : notifications.slice(0, 6).map((notice) => (
                <div key={notice.id} className="rounded-md border bg-card p-3">
                  <p className="text-sm font-bold">{notice.title}</p>
                  <p className="text-sm text-muted-foreground">{notice.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    {children}
  </div>
);

const SignalCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-[var(--radius)] border bg-card/75 p-4 shadow-sm">
    <div className="mb-3 text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</div>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="font-bold">{value}</p>
  </div>
);

const ProfileStrip = ({ profile, roles, notifications }: { profile: Profile | null; roles: Role[]; notifications: Notification[] }) => (
  <section className="grid gap-4 rounded-[var(--radius)] border bg-card p-4 md:grid-cols-[1fr_auto] md:items-center">
    <div>
      <p className="text-sm text-muted-foreground">Logged in as</p>
      <h2 className="text-2xl font-black tracking-normal">{profile?.display_name ?? "Community member"}</h2>
      <p className="text-sm text-muted-foreground">{profile?.area || profile?.address || "Add your area for better local matching"}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      {roles.map((role) => <Badge key={role} variant="outline" className="capitalize">{role}</Badge>)}
      <Badge variant="outline">{notifications.filter((notice) => !notice.read_at).length} unread</Badge>
    </div>
  </section>
);

const ResidentDashboard = ({ busy, geoBusy, requestForm, setRequestForm, createRequest, captureLocation, myRequests, profiles, ratings, selectedRequestId, setSelectedRequestId, cancelRequest, submitRating, ratingForm, setRatingForm }: any) => (
  <div className="space-y-6">
    <section className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
      <Card className="rounded-[var(--radius)] border-[hsl(var(--urgency-high-border))] bg-[hsl(var(--urgency-high-soft))]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[hsl(var(--urgency-high))]"><AlertTriangle /> SOS</CardTitle>
          <CardDescription>Broadcast a high-urgency request immediately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="h-16 w-full text-lg font-black" variant="destructive" disabled={busy} onClick={() => createRequest(true)}>Send SOS now</Button>
          <Button className="w-full" variant="outline" disabled={geoBusy} onClick={captureLocation}><MapPin /> Attach my location</Button>
        </CardContent>
      </Card>

      <Card className="rounded-[var(--radius)]">
        <CardHeader>
          <CardTitle>Create emergency request</CardTitle>
          <CardDescription>Share only what responders need to act quickly.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Title"><Input maxLength={140} value={requestForm.title} onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })} /></Field>
          <Field label="Description"><Textarea maxLength={2000} value={requestForm.description} onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })} /></Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Type"><select className="h-10 rounded-md border bg-background px-3" value={requestForm.request_type} onChange={(e) => setRequestForm({ ...requestForm, request_type: e.target.value as RequestType })}>{requestTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></Field>
            <Field label="Urgency"><select className="h-10 rounded-md border bg-background px-3" value={requestForm.urgency} onChange={(e) => setRequestForm({ ...requestForm, urgency: e.target.value as Urgency })}>{urgencyLevels.map((level) => <option key={level} value={level}>{urgencyLabels[level]}</option>)}</select></Field>
            <Field label="Location"><Input maxLength={240} value={requestForm.location_text} onChange={(e) => setRequestForm({ ...requestForm, location_text: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={geoBusy} onClick={captureLocation}><MapPin /> Use browser location</Button>
            <Button disabled={busy} onClick={() => createRequest(false)}>Submit request</Button>
          </div>
        </CardContent>
      </Card>
    </section>

    <RequestList title="My emergency requests" requests={myRequests} profiles={profiles} selectedRequestId={selectedRequestId} setSelectedRequestId={setSelectedRequestId} actions={(request: EmergencyRequest) => (
      <>
        {request.status === "pending" && <Button size="sm" variant="outline" onClick={() => cancelRequest(request)}>Cancel</Button>}
        {request.status === "completed" && request.assigned_volunteer_id && !ratings.some((rating: Rating) => rating.request_id === request.id) && (
          <div className="grid w-full gap-2 rounded-md border p-3">
            <select className="h-10 rounded-md border bg-background px-3" value={ratingForm.rating} onChange={(e) => setRatingForm({ ...ratingForm, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select>
            <Input placeholder="Optional feedback" value={ratingForm.comment} onChange={(e) => setRatingForm({ ...ratingForm, comment: e.target.value })} />
            <Button size="sm" onClick={() => submitRating(request)}>Rate volunteer</Button>
          </div>
        )}
      </>
    )} />
  </div>
);

const VolunteerDashboard = ({ profile, openRequests, assignedRequests, profiles, acceptRequest, completeRequest, captureLocation, geoBusy, busy, updateAvailability, selectedRequestId, setSelectedRequestId }: any) => (
  <div className="space-y-6">
    <section className="grid gap-4 md:grid-cols-3">
      <Metric icon={<UserCheck />} label="Availability" value={profile?.is_available ? "Available" : "Offline"} />
      <Metric icon={<Star />} label="Rating" value={`${Number(profile?.rating_average ?? 0).toFixed(1)} (${profile?.rating_count ?? 0})`} />
      <Metric icon={<MapPin />} label="Location" value={profile?.latitude ? "Shared" : "Not shared"} />
    </section>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={geoBusy} onClick={captureLocation}><MapPin /> Update my location</Button>
      <Button variant={profile?.is_available ? "secondary" : "default"} onClick={() => updateAvailability(!profile?.is_available)}>{profile?.is_available ? "Go offline" : "Go available"}</Button>
    </div>
    <RequestList title="Nearby open requests" requests={openRequests} profiles={profiles} selectedRequestId={selectedRequestId} setSelectedRequestId={setSelectedRequestId} actions={(request: EmergencyRequest) => (
      <Button size="sm" disabled={busy || !profile?.is_available} onClick={() => acceptRequest(request)}>Accept</Button>
    )} volunteerProfile={profile} />
    <RequestList title="Accepted by me" requests={assignedRequests} profiles={profiles} selectedRequestId={selectedRequestId} setSelectedRequestId={setSelectedRequestId} actions={(request: EmergencyRequest) => (
      request.status === "accepted" ? <Button size="sm" onClick={() => completeRequest(request)}><CheckCircle2 /> Complete</Button> : null
    )} />
  </div>
);

const AdminDashboard = ({ analytics, requests, profiles }: { analytics: any; requests: EmergencyRequest[]; profiles: Profile[]; roles: Role[] }) => (
  <div className="space-y-6">
    <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Metric icon={<Radio />} label="Total" value={analytics.total} />
      <Metric icon={<Clock />} label="Pending" value={analytics.pending} />
      <Metric icon={<HeartHandshake />} label="Accepted" value={analytics.accepted} />
      <Metric icon={<CheckCircle2 />} label="Completed" value={analytics.completed} />
      <Metric icon={<UserCheck />} label="Responders" value={analytics.volunteers} />
      <Metric icon={<Users />} label="Residents" value={analytics.residents} />
    </section>
    <Card className="rounded-[var(--radius)]">
      <CardHeader><CardTitle>All emergency requests</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-muted-foreground"><tr><th className="py-2">Request</th><th>Status</th><th>Urgency</th><th>Type</th><th>Location</th><th>Created</th></tr></thead>
          <tbody>{requests.map((request) => <tr key={request.id} className="border-t"><td className="py-3 font-semibold">{request.title}</td><td><Pill className={statusClass[request.status]}>{statusLabels[request.status]}</Pill></td><td><Pill className={urgentClass[request.urgency]}>{urgencyLabels[request.urgency]}</Pill></td><td>{typeLabels[request.request_type]}</td><td>{request.location_text}</td><td>{new Date(request.created_at).toLocaleString()}</td></tr>)}</tbody>
        </table>
      </CardContent>
    </Card>
    <Card className="rounded-[var(--radius)]">
      <CardHeader><CardTitle>Community members</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">{profiles.map((profile) => <div key={profile.id} className="rounded-md border p-3"><p className="font-bold">{profile.display_name}</p><p className="text-sm text-muted-foreground">{profile.phone || "No phone"} · {profile.area || "No area"}</p></div>)}</CardContent>
    </Card>
  </div>
);

const RequestList = ({ title, requests, profiles, selectedRequestId, setSelectedRequestId, actions, volunteerProfile }: any) => (
  <Card className="rounded-[var(--radius)]">
    <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{requests.length} request{requests.length === 1 ? "" : "s"}</CardDescription></CardHeader>
    <CardContent className="grid gap-3">
      {requests.length === 0 ? <p className="text-sm text-muted-foreground">No requests in this queue.</p> : requests.map((request: EmergencyRequest) => {
        const resident = profiles.find((profile: Profile) => profile.user_id === request.resident_id);
        const volunteer = profiles.find((profile: Profile) => profile.user_id === request.assigned_volunteer_id);
        const km = volunteerProfile ? distanceKm(volunteerProfile.latitude, volunteerProfile.longitude, request.latitude, request.longitude) : null;
        return <article key={request.id} className={`rounded-[var(--radius)] border p-4 ${selectedRequestId === request.id ? "ring-2 ring-primary" : ""}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap gap-2"><Pill className={urgentClass[request.urgency]}>{request.is_sos ? "SOS · " : ""}{urgencyLabels[request.urgency]}</Pill><Pill className={statusClass[request.status]}>{statusLabels[request.status]}</Pill><Pill>{typeLabels[request.request_type]}</Pill>{km !== null && <Pill>{km} km</Pill>}</div>
              <h3 className="text-lg font-black tracking-normal">{request.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{request.description}</p>
              <p className="mt-3 flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-primary" /> {request.location_text}</p>
              <p className="mt-1 text-xs text-muted-foreground">Resident: {resident?.display_name ?? "Community member"}{volunteer ? ` · Volunteer: ${volunteer.display_name}` : ""}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedRequestId(request.id)}><MessageCircle /> Chat</Button>{actions(request)}</div>
          </div>
        </article>;
      })}
    </CardContent>
  </Card>
);

const ChatPanel = ({ request, messages, profiles, userId, messageBody, setMessageBody, sendMessage }: any) => (
  <Card className="rounded-[var(--radius)]">
    <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><MessageCircle className="h-5 w-5 text-primary" /> Request chat</CardTitle><CardDescription>{request ? request.title : "Select an accepted request"}</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <div className="max-h-72 min-h-40 overflow-y-auto rounded-md border bg-muted/30 p-3">
        {!request ? <p className="text-sm text-muted-foreground">Choose a request to open the participant chat.</p> : request.status === "pending" ? <p className="text-sm text-muted-foreground">Chat opens after a volunteer accepts this request.</p> : messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet.</p> : messages.map((message: Message) => {
          const sender = profiles.find((profile: Profile) => profile.user_id === message.sender_id);
          const mine = message.sender_id === userId;
          return <div key={message.id} className={`mb-3 max-w-[85%] rounded-md border p-3 ${mine ? "ml-auto bg-primary text-primary-foreground" : "bg-card"}`}><p className="text-xs opacity-80">{sender?.display_name ?? "Member"} · {new Date(message.created_at).toLocaleTimeString()}</p><p className="text-sm">{message.body}</p></div>;
        })}
      </div>
      <div className="flex gap-2"><Input disabled={!request || request.status === "pending"} placeholder="Type update..." value={messageBody} onChange={(e) => setMessageBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} /><Button disabled={!request || request.status === "pending"} onClick={sendMessage}>Send</Button></div>
    </CardContent>
  </Card>
);

const Metric = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) => (
  <Card className="rounded-[var(--radius)]"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-md bg-primary/10 p-2 text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</div><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-black">{value}</p></div></CardContent></Card>
);

const Pill = ({ children, className = "border-border bg-muted text-muted-foreground" }: { children: React.ReactNode; className?: string }) => <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{children}</span>;

export default AidConnect;
